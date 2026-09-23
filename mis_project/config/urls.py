from django.contrib import admin
from django.urls import path, include, re_path
from django.conf import settings
from django.conf.urls.static import static
from frontend.views import react_index
from pathlib import Path

urlpatterns = [
    path("django-admin/",           admin.site.urls),
    path("api/auth/",          include("apps.accounts.urls")),
    path("api/forms/",         include("apps.forms_builder.urls")),
    path("api/submissions/",   include("apps.submissions.urls")),
    path("api/canvas/",        include("apps.canvas_integration.urls")),
    path("api/audit/",         include("apps.audit.urls")),
    path("api/zoom/",          include("apps.zoom_integration.urls")),
    path("api/notifications/", include("apps.notifications.urls")),
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