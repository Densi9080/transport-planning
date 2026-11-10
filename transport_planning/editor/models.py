import uuid

from django.db import models


class AssistantSettings(models.Model):
    """Подключение помощника к модели: одна запись на весь сервер."""

    base_url = models.CharField(max_length=500, blank=True)
    model = models.CharField(max_length=200, blank=True)
    api_key = models.CharField(max_length=500, blank=True)
    updated_at = models.DateTimeField(auto_now=True)


class Project(models.Model):
    """Исходный .osm без изменений и список правок поверх него."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=255)
    original = models.FileField(upload_to='projects/')
    changes = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-updated_at']

    def __str__(self) -> str:
        return self.name

    def read_original(self) -> bytes:
        with self.original.open('rb') as handle:
            return handle.read()
