from django.db import models
from django.conf import settings
from apps.forms_builder.models import Form


class Submission(models.Model):
    """
    A single public user's response to a Form.
    Moves through a simple approval workflow before Canvas sync.
    """

    class Status(models.TextChoices):
        PENDING = "pending", "Pending Review"
        APPROVED = "approved", "Approved"
        REJECTED = "rejected", "Rejected"
        SYNCED = "synced", "Synced to Canvas"
        FAILED = "failed", "Sync Failed"

    form = models.ForeignKey(Form, on_delete=models.CASCADE, related_name="submissions")

    # Snapshot of form data at submission time: {field_id: value}
    data = models.JSONField(default=dict)

    status = models.CharField(max_length=20, choices=Status.choices, default=Status.PENDING)

    # Reviewer
    reviewed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True, blank=True,
        on_delete=models.SET_NULL,
        related_name="submissions_reviewed",
    )
    reviewed_at = models.DateTimeField(null=True, blank=True)
    rejection_reason = models.TextField(blank=True)

    # Canvas sync
    canvas_user_id = models.CharField(max_length=64, blank=True, null=True)
    canvas_enrollment_id = models.CharField(max_length=64, blank=True, null=True)
    canvas_sync_error = models.TextField(blank=True)
    canvas_synced_at = models.DateTimeField(null=True, blank=True)

    # Submitter contact (extracted from form data for quick reference)
    submitter_email = models.EmailField(blank=True)
    submitter_name = models.CharField(max_length=255, blank=True)

    submitted_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-submitted_at"]

    def __str__(self):
        return f"Submission #{self.pk} — {self.form.title} [{self.status}]"


class SubmissionNote(models.Model):
    """Internal admin notes on a submission."""
    submission = models.ForeignKey(Submission, on_delete=models.CASCADE, related_name="notes")
    author = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
    )
    body = models.TextField()
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["created_at"]

    def __str__(self):
        return f"Note on #{self.submission_id} by {self.author}"
