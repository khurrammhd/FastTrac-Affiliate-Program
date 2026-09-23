from django.db import models
from django.conf import settings


class AuditLog(models.Model):
    """
    Immutable record of every significant admin action in the system.
    Written on: form create/publish/close, submission approve/reject/resync,
                Canvas sync complete/fail, user role change.
    """

    class Action(models.TextChoices):
        # Forms
        FORM_CREATED   = "form_created",   "Form created"
        FORM_UPDATED   = "form_updated",   "Form updated"
        FORM_PUBLISHED = "form_published", "Form published"
        FORM_CLOSED    = "form_closed",    "Form closed"
        FORM_DELETED   = "form_deleted",   "Form deleted"
        # Submissions
        SUB_APPROVED   = "sub_approved",   "Submission approved"
        SUB_REJECTED   = "sub_rejected",   "Submission rejected"
        SUB_UNREJECTED = "sub_unrejected", "Submission rejection reverted"
        SUB_RESYNCED   = "sub_resynced",   "Submission re-synced"
        SUB_USER_REMOVED = "sub_user_removed", "User removed from Canvas"
        # Canvas
        CANVAS_SYNCED  = "canvas_synced",  "Canvas sync succeeded"
        CANVAS_FAILED  = "canvas_failed",  "Canvas sync failed"
        # Users
        ROLE_CHANGED   = "role_changed",   "User role changed"
        USER_CREATED   = "user_created",   "User created"

    action      = models.CharField(max_length=40, choices=Action.choices)
    actor       = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, on_delete=models.SET_NULL,
        related_name="audit_logs"
    )
    target_type = models.CharField(max_length=40, blank=True, help_text="e.g. Form, Submission, User")
    target_id   = models.PositiveIntegerField(null=True, blank=True)
    target_repr = models.CharField(max_length=255, blank=True, help_text="Human-readable target description")
    detail      = models.JSONField(default=dict, blank=True, help_text="Extra context e.g. old/new role")
    ip_address  = models.GenericIPAddressField(null=True, blank=True)
    created_at  = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"[{self.created_at:%Y-%m-%d %H:%M}] {self.actor} → {self.action} on {self.target_repr}"


def log(action, actor=None, target=None, detail=None, request=None):
    """
    Convenience helper. Call from any view.

    log(AuditLog.Action.SUB_APPROVED, actor=request.user,
        target=submission, detail={"note": note_body}, request=request)
    """
    ip = None
    if request:
        x_forwarded = request.META.get("HTTP_X_FORWARDED_FOR")
        ip = x_forwarded.split(",")[0] if x_forwarded else request.META.get("REMOTE_ADDR")

    target_type = type(target).__name__ if target else ""
    target_id   = getattr(target, "pk", None)
    target_repr = str(target) if target else ""

    AuditLog.objects.create(
        action=action,
        actor=actor,
        target_type=target_type,
        target_id=target_id,
        target_repr=target_repr,
        detail=detail or {},
        ip_address=ip,
    )
