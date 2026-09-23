from django.db import models
from django.conf import settings
from apps.forms_builder.models import Form
from apps.submissions.models import Submission


class ZoomMeeting(models.Model):
    """One recurring Zoom meeting linked to a Form."""
    form = models.OneToOneField(Form, on_delete=models.CASCADE, related_name="zoom_meeting")
    zoom_meeting_id = models.CharField(max_length=64, unique=True)
    topic = models.CharField(max_length=255)
    join_url = models.URLField(blank=True)
    start_url = models.URLField(blank=True)
    # Multi-day schedule: list of {date, start_time, end_time} dicts (1–4 entries)
    schedule_days = models.JSONField(default=list, blank=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True, blank=True,
        on_delete=models.SET_NULL,
        related_name="zoom_meetings_created",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"ZoomMeeting {self.zoom_meeting_id} — {self.topic}"


class ZoomRegistrant(models.Model):
    """A single user's Zoom registration for the meeting linked to their submission's form."""

    class Status(models.TextChoices):
        REGISTERED = "registered", "Registered"
        REMOVED    = "removed",    "Removed"
        FAILED     = "failed",     "Failed"

    submission      = models.OneToOneField(Submission, on_delete=models.CASCADE, related_name="zoom_registrant")
    zoom_meeting    = models.ForeignKey(ZoomMeeting, on_delete=models.CASCADE, related_name="registrants")
    registrant_id   = models.CharField(max_length=128, blank=True)
    join_url        = models.URLField(blank=True)
    status          = models.CharField(max_length=20, choices=Status.choices, default=Status.REGISTERED)
    error_message   = models.TextField(blank=True)
    registered_at   = models.DateTimeField(auto_now_add=True)
    updated_at      = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-registered_at"]

    def __str__(self):
        return f"ZoomRegistrant #{self.pk} — sub#{self.submission_id} [{self.status}]"
