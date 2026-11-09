from django.urls import path

from . import views

urlpatterns = [
    path('projects/', views.ProjectListView.as_view()),
    path('projects/<uuid:pk>/', views.ProjectDetailView.as_view()),
    path('projects/<uuid:pk>/changes/', views.ProjectChangesView.as_view()),
    path('projects/<uuid:pk>/export/', views.ProjectExportView.as_view()),
    path('projects/<uuid:pk>/preflight/', views.ProjectPreflightView.as_view()),
]
