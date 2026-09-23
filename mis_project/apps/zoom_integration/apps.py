from django.apps import AppConfig


class ZoomIntegrationConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "apps.zoom_integration"
    verbose_name = "Zoom Integration"

    def ready(self):
        import apps.zoom_integration.signals  # noqa: F401
