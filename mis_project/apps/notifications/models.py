from django.db import models
from django.conf import settings


class Notification(models.Model):
    class Type(models.TextChoices):
        NEW_SUBMISSION       = "new_submission",       "New Submission"
        SUBMISSION_APPROVED  = "submission_approved",  "Submission Approved"
        SUBMISSION_REJECTED  = "submission_rejected",  "Submission Rejected"
        CANVAS_SYNC_FAILED   = "canvas_sync_failed",   "Canvas Sync Failed"

    recipient = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="notifications",
    )
    notification_type = models.CharField(max_length=50, choices=Type.choices)
    title   = models.CharField(max_length=255)
    message = models.TextField()
    submission = models.ForeignKey(
        "submissions.Submission",
        null=True, blank=True,
        on_delete=models.SET_NULL,
        related_name="notifications",
    )
    is_read = models.BooleanField(default=False, db_index=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.recipient.username} — {self.title}"
