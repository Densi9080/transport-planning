import uuid

from django.db import models


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
