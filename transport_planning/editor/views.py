from __future__ import annotations

import mimetypes
from pathlib import Path

from django.conf import settings
from django.core.files.base import ContentFile
from django.http import FileResponse, Http404, HttpResponse
from django.shortcuts import get_object_or_404
from django.views.static import serve
from rest_framework.response import Response
from rest_framework.views import APIView

from . import assistant
from .models import Project
from .osm_io import ChangesError, OsmFormatError, apply_changes, parse_document
from .preflight import find_netconvert, run_preflight
from .sumo_signals import SignalExportError, SignalNetError, export_signal_programs, parse_groups
from .traffic import TrafficError, run_traffic

SAMPLE_NAME = 'example.osm'

# Воркер карты браузер примет только как JavaScript, а таблицы типов на разных системах отличаются
mimetypes.add_type('text/javascript', '.mjs')


def _project_summary(project: Project) -> dict:
    return {
        'id': str(project.id),
        'name': project.name,
        'updatedAt': project.updated_at.isoformat(),
    }


def _changes_from_request(request) -> dict:
    changes = request.data.get('changes') if isinstance(request.data, dict) else None
    if changes is None:
        return {}
    if not isinstance(changes, dict):
        raise ChangesError('Поле changes должно быть объектом')
    return changes


class ProjectListView(APIView):
    def get(self, request):
        return Response([_project_summary(p) for p in Project.objects.all()[:20]])

    def post(self, request):
        upload = request.FILES.get('file')
        if upload is not None:
            name = Path(upload.name).name
            data = upload.read()
        elif request.data.get('sample'):
            name = SAMPLE_NAME
            data = (Path(settings.BASE_DIR) / 'samples' / SAMPLE_NAME).read_bytes()
        else:
            return Response({'detail': 'Не передан файл .osm'}, status=400)

        try:
            parse_document(data)
        except OsmFormatError as exc:
            return Response({'detail': str(exc)}, status=400)

        project = Project(name=name)
        project.original.save(f'{project.id}.osm', ContentFile(data), save=True)
        return Response(_project_summary(project), status=201)


class ProjectDetailView(APIView):
    def get(self, request, pk):
        project = get_object_or_404(Project, pk=pk)
        return Response({
            **_project_summary(project),
            'document': parse_document(project.read_original()),
            'changes': project.changes,
        })


class ProjectChangesView(APIView):
    """Автосохранение правок. Сам файл при этом не меняется."""

    def put(self, request, pk):
        project = get_object_or_404(Project, pk=pk)
        try:
            project.changes = _changes_from_request(request)
        except ChangesError as exc:
            return Response({'detail': str(exc)}, status=400)
        project.save(update_fields=['changes', 'updated_at'])
        return Response(_project_summary(project))


class ProjectExportView(APIView):
    """Отдаёт готовый .osm. Имя файла задаёт браузер, поэтому здесь оно не нужно."""

    def post(self, request, pk):
        project = get_object_or_404(Project, pk=pk)
        try:
            output = apply_changes(project.read_original(), _changes_from_request(request))
        except (ChangesError, OsmFormatError) as exc:
            return Response({'detail': str(exc)}, status=400)
        return HttpResponse(output, content_type='application/xml; charset=utf-8')


class ProjectPreflightView(APIView):
    def post(self, request, pk):
        project = get_object_or_404(Project, pk=pk)
        try:
            output = apply_changes(project.read_original(), _changes_from_request(request))
        except (ChangesError, OsmFormatError) as exc:
            return Response({'detail': str(exc)}, status=400)
        return Response(run_preflight(output))


class ProjectTrafficView(APIView):
    """Загрузка сети по расчёту SUMO. Считается по файлу с текущими правками."""

    def post(self, request, pk):
        project = get_object_or_404(Project, pk=pk)
        try:
            output = apply_changes(project.read_original(), _changes_from_request(request))
            trips = int(request.data.get('trips', 1000))
            period = int(request.data.get('period', 3600))
        except (ChangesError, OsmFormatError, TypeError, ValueError) as exc:
            return Response({'detail': str(exc)}, status=400)
        try:
            return Response(run_traffic(output, trips=trips, period=period))
        except TrafficError as exc:
            return Response({'detail': str(exc)}, status=502)


class ProjectSumoSignalsView(APIView):
    """Фазы светофоров редактора отдельным файлом для SUMO. Привязка к сети строится по итоговому .osm."""

    def post(self, request, pk):
        project = get_object_or_404(Project, pk=pk)
        data = request.data if isinstance(request.data, dict) else {}
        try:
            output = apply_changes(project.read_original(), _changes_from_request(request))
            groups = parse_groups(data.get('groups'))
        except (ChangesError, OsmFormatError, SignalExportError) as exc:
            return Response({'detail': str(exc)}, status=400)
        if find_netconvert() is None:
            return Response({
                'available': False,
                'message': 'Для привязки фаз к сети SUMO нужен netconvert: установите пакет eclipse-sumo или задайте SUMO_HOME.',
            })
        try:
            return Response(export_signal_programs(output, groups))
        except SignalNetError as exc:
            return Response({'detail': str(exc)}, status=502)


class AssistantSettingsView(APIView):
    def get(self, request):
        return Response(assistant.public_settings())

    def put(self, request):
        try:
            assistant.save_settings(request.data if isinstance(request.data, dict) else {})
        except assistant.AssistantError as exc:
            return Response({'detail': exc.message}, status=exc.status)
        return Response(assistant.public_settings())


class AssistantTestView(APIView):
    """Проверка подключения: список моделей заодно подсказывает, что можно выбрать."""

    def post(self, request):
        try:
            models = assistant.list_models(request.data if isinstance(request.data, dict) else {})
        except assistant.AssistantError as exc:
            return Response({'detail': exc.message}, status=exc.status)
        return Response({'ok': True, 'models': models})


class AssistantChatView(APIView):
    def post(self, request):
        data = request.data if isinstance(request.data, dict) else {}
        try:
            return Response(assistant.chat(data.get('messages'), data.get('tools')))
        except assistant.AssistantError as exc:
            return Response({'detail': exc.message}, status=exc.status)


def frontend_index(request):
    """Страница приложения в готовом образе. При разработке фронт отдаёт Vite."""
    index = Path(settings.FRONTEND_DIST) / 'index.html'
    if not index.is_file():
        raise Http404('Фронтенд не собран')
    return FileResponse(index.open('rb'), content_type='text/html; charset=utf-8')


def frontend_asset(request, path):
    return serve(request, path, document_root=Path(settings.FRONTEND_DIST) / 'assets')
