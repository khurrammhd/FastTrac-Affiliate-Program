# Celery is optional — only imported if the package is installed
try:
    from .celery import app as celery_app
    __all__ = ("celery_app",)
except ImportError:
    pass
