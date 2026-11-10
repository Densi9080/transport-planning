from django.urls import path

from . import views

urlpatterns = [
    path('projects/', views.ProjectListView.as_view()),
    path('projects/<uuid:pk>/', views.ProjectDetailView.as_view()),
    path('projects/<uuid:pk>/changes/', views.ProjectChangesView.as_view()),
    path('projects/<uuid:pk>/export/', views.ProjectExportView.as_view()),
    path('projects/<uuid:pk>/preflight/', views.ProjectPreflightView.as_view()),
    path('projects/<uuid:pk>/traffic/', views.ProjectTrafficView.as_view()),
    path('projects/<uuid:pk>/sumo-signals/', views.ProjectSumoSignalsView.as_view()),
    path('assistant/settings/', views.AssistantSettingsView.as_view()),
    path('assistant/test/', views.AssistantTestView.as_view()),
    path('assistant/chat/', views.AssistantChatView.as_view()),
]
