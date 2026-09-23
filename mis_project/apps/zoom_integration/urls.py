from django.urls import path
from .views import ZoomMeetingDetailView, ZoomRegistrantView, ZoomBatchCleanupView

urlpatterns = [
    path("forms/<int:form_pk>/meeting/",   ZoomMeetingDetailView.as_view(), name="zoom_meeting"),
    path("forms/<int:form_pk>/cleanup/",   ZoomBatchCleanupView.as_view(),  name="zoom_cleanup"),
    path("submissions/<int:submission_pk>/registrant/", ZoomRegistrantView.as_view(), name="zoom_registrant"),
]
