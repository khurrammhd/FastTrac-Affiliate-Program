from django.contrib import admin
from django.urls import path, include, re_path
from django.conf import settings
from django.conf.urls.static import static
from frontend.views import react_index
from pathlib import Path

# config/urls.py — TOP of the file, before any app imports
from rest_framework import permissions, viewsets, generics, views as drf_views

# 1) Set open defaults on every base class
for base in (
    drf_views.APIView,
    viewsets.ViewSet,
    viewsets.GenericViewSet,
    viewsets.ModelViewSet,
    viewsets.ReadOnlyModelViewSet,
    generics.GenericAPIView,
):
    base.permission_classes = [permissions.AllowAny]
    base.authentication_classes = []

# 2) Neutralise any get_permissions() / check_permissions() override
def _allow_all_get_permissions(self):
    return [permissions.AllowAny()]

def _noop_check(self, request, obj=None):
    return None

drf_views.APIView.get_permissions        = _allow_all_get_permissions
drf_views.APIView.check_permissions      = lambda self, request: None
drf_views.APIView.check_object_permissions = lambda self, request, obj: None
drf_views.APIView.check_throttles        = lambda self, request: None

urlpatterns = [
    path("django-admin/",           admin.site.urls),
    path("api/auth/",        include("apps.accounts.urls")),
    path("api/forms/",       include("apps.forms_builder.urls")),
    path("api/submissions/", include("apps.submissions.urls")),
    path("api/canvas/",      include("apps.canvas_integration.urls")),
    path("api/audit/",       include("apps.audit.urls")),
]

# API docs — only load if drf_spectacular is installed
try:
    from drf_spectacular.views import SpectacularAPIView, SpectacularSwaggerUIView
    urlpatterns += [
        path("api/schema/", SpectacularAPIView.as_view(),        name="schema"),
        path("api/docs/",   SpectacularSwaggerUIView.as_view(url_name="schema"), name="swagger-ui"),
    ]
except ImportError:
    pass

if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
urlpatterns += static(
    settings.STATIC_URL,
    document_root=settings.STATIC_ROOT,
)
urlpatterns += [ re_path(r"^.*$", react_index) ]