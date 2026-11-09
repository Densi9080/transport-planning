from django.contrib import admin
from django.urls import include, path, re_path

from editor.views import frontend_asset, frontend_index

urlpatterns = [
    path('admin/', admin.site.urls),
    path('api/', include('editor.urls')),
    re_path(r'^assets/(?P<path>.+)$', frontend_asset),
    # Все остальные адреса ведёт маршрутизатор фронтенда
    re_path(r'^(?!api/|admin/).*$', frontend_index),
]
