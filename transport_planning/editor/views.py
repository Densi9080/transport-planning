from __future__ import annotations

from pathlib import Path

from django.conf import settings
from django.core.files.base import ContentFile
from django.http import HttpResponse
from django.shortcuts import get_object_or_404
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import Project
from .osm_io import ChangesError, OsmFormatError, apply_changes, parse_document
from .preflight import run_preflight

SAMPLE_NAME = 'example.osm'


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
