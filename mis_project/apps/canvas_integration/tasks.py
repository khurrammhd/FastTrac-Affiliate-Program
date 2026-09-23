import logging
from django.conf import settings
from datetime import timedelta

import requests

logger = logging.getLogger(__name__)


def _get_canvas_client_for_sync(reviewer_user_id=None):
    """
    Always use the service token (CANVAS_API_TOKEN) for sync operations — it has
    admin-level access required for listing and creating course enrollments.
    The reviewer's OAuth token is a user-level token and Canvas returns 404 (not 403)
    when it lacks admin rights on a resource.

    Fall back to the reviewer's OAuth token only when the service token is not
    configured (empty/absent in settings).
    """
    from django.utils import timezone
    from apps.accounts.models import CanvasOAuthToken
    from apps.canvas_integration.client import CanvasAPIClient

    # Prefer service token — required for admin enrollment operations.
    if getattr(settings, "CANVAS_API_TOKEN", None):
        return CanvasAPIClient(), "service_token"

    # Fallback 1: reviewer's OAuth token.
    if reviewer_user_id:
        try:
            token_obj = CanvasOAuthToken.objects.select_related("user").get(user_id=reviewer_user_id)
        except CanvasOAuthToken.DoesNotExist:
            token_obj = None

        if token_obj and token_obj.access_token:
            if token_obj.is_expired and token_obj.refresh_token:
                try:
                    refreshed = CanvasAPIClient.refresh_access_token(token_obj.refresh_token)
                    new_access = refreshed.get("access_token")
                    if new_access:
                        token_obj.access_token = new_access
                        token_obj.refresh_token = refreshed.get("refresh_token") or token_obj.refresh_token
                        expires_in = refreshed.get("expires_in")
                        if expires_in:
                            token_obj.expires_at = timezone.now() + timedelta(seconds=int(expires_in))
                        token_obj.save(update_fields=["access_token", "refresh_token", "expires_at", "updated_at"])
                except requests.HTTPError:
                    logger.warning("Failed to refresh reviewer Canvas OAuth token for user %s", reviewer_user_id)

            return CanvasAPIClient(access_token=token_obj.access_token), "reviewer_oauth"

    # Fallback 2: any stored admin/superadmin OAuth token.
    try:
        admin_token = (
            CanvasOAuthToken.objects
            .filter(user__role__in=["admin", "superadmin"])
            .select_related("user")
            .order_by("-updated_at")
            .first()
        )
        if admin_token and admin_token.access_token:
            if admin_token.is_expired and admin_token.refresh_token:
                try:
                    refreshed = CanvasAPIClient.refresh_access_token(admin_token.refresh_token)
                    new_access = refreshed.get("access_token")
                    if new_access:
                        admin_token.access_token = new_access
                        admin_token.refresh_token = refreshed.get("refresh_token") or admin_token.refresh_token
                        expires_in = refreshed.get("expires_in")
                        if expires_in:
                            admin_token.expires_at = timezone.now() + timedelta(seconds=int(expires_in))
                        admin_token.save(update_fields=["access_token", "refresh_token", "expires_at", "updated_at"])
                except requests.HTTPError:
                    logger.warning("Failed to refresh admin Canvas OAuth token for user %s", admin_token.user_id)
            return CanvasAPIClient(access_token=admin_token.access_token), "admin_oauth"
    except Exception:
        pass

    return CanvasAPIClient(), "service_token"


def _run_sync(submission_id, existing_canvas_user_id=None, reviewer_user_id=None):
    """
    Core sync logic — runs the Canvas user creation and enrollment.
    Called directly or via Celery depending on configuration.
    """
    from apps.submissions.models import Submission
    from apps.canvas_integration.client import CanvasAPIClient
    from django.utils import timezone

    try:
        submission = Submission.objects.select_related("form").get(pk=submission_id)
    except Submission.DoesNotExist:
        logger.error("sync_submission_to_canvas: Submission %s not found.", submission_id)
        return

    if submission.status == Submission.Status.SYNCED:
        logger.info("Submission %s already synced, skipping.", submission_id)
        return

    client, auth_source = _get_canvas_client_for_sync(reviewer_user_id=reviewer_user_id)
    enrollment_role = getattr(settings, "CANVAS_FACILITATOR_ENROLLMENT_TYPE", "TeacherEnrollment")
    enrollment_role_name = getattr(settings, "CANVAS_FACILITATOR_ROLE_NAME", "Facilitator")
    enrollment_state = getattr(settings, "CANVAS_ENROLLMENT_STATE", "invited")

    # Extract name and email from mapped fields
    name  = submission.submitter_name  or _extract_field(submission, "name")  or "Unknown"
    email = submission.submitter_email or _extract_field(submission, "email")

    if not email:
        _fail(submission, "Could not determine email from submission data.")
        return

    try:
        if existing_canvas_user_id:
            # Reviewer confirmed this is the same person; use existing Canvas account.
            client.get_user(existing_canvas_user_id)
            canvas_user = {"id": existing_canvas_user_id}
            user_precreated = True
        else:
            # Find existing Canvas user by email.
            canvas_user = client.find_user_by_email(email)
            if canvas_user:
                user_precreated = True
            else:
                # No existing Canvas account found.  Use invite_user so Canvas
                # creates a pending (unregistered) account and emails the person
                # a self-registration link — the same thing Canvas does internally
                # when you add someone by email through the web UI.
                canvas_user = client.invite_user(name=name, email=email)
                # This account was created specifically for this course sync, so
                # it is safe to delete entirely if the submission is later removed.
                user_precreated = False

        canvas_user_id = str(canvas_user.get("id", ""))
        submission.canvas_user_id = canvas_user_id
        submission.canvas_user_precreated = user_precreated

        course_id = submission.form.canvas_course_id
        if course_id and canvas_user_id:
            enrollment = client.ensure_enrollment(
                course_id,
                canvas_user_id,
                role=enrollment_role,
                role_name=enrollment_role_name,
                enrollment_state=enrollment_state,
            )
            submission.canvas_enrollment_id = str(enrollment.get("id", ""))
            # If enrolled via SIS login ID, capture the resolved numeric Canvas user ID.
            resolved_user_id = enrollment.get("user_id")
            if resolved_user_id:
                submission.canvas_user_id = str(resolved_user_id)

        submission.status           = Submission.Status.SYNCED
        submission.canvas_synced_at = timezone.now()
        submission.canvas_sync_error = ""
        submission.save()

        logger.info("Submission %s synced. Canvas user ID: %s", submission_id, canvas_user_id)

    except Exception as exc:
        logger.exception("Canvas sync failed for submission %s: %s", submission_id, exc)
        err_text = str(exc)
        err_lower = err_text.lower()
        course_id_hint = getattr(getattr(submission, "form", None), "canvas_course_id", None)

        if "concluded" in err_lower:
            err_text = (
                f"Canvas course '{course_id_hint}' has been concluded (archived) and no longer "
                "accepts new enrollments. To fix this: open the course in Canvas, go to "
                "Settings → End Date, and either extend the end date or re-open the course."
            )
        elif "404" in err_text:
            err_text = (
                f"Canvas course ID '{course_id_hint}' was not found. "
                "Please verify the Canvas Course ID set on this form is correct. "
                f"Details: {err_text}"
            )
        elif "401" in err_text:
            if auth_source == "service_token":
                err_text = (
                    "Canvas authorization failed (invalid CANVAS_API_TOKEN). "
                    "Reconnect Canvas as reviewer/admin or update CANVAS_API_TOKEN in backend .env. "
                    f"Details: {err_text}"
                )
            else:
                err_text = (
                    "Canvas authorization failed for your Canvas login token. "
                    "Please log out and reconnect Canvas OAuth, then try re-sync. "
                    f"Details: {err_text}"
                )
        _fail(submission, err_text)


def _extract_field(submission, mapping_key):
    from apps.forms_builder.models import FormField
    field = FormField.objects.filter(
        form=submission.form,
        canvas_field_mapping=mapping_key,
    ).first()
    if field:
        return submission.data.get(str(field.pk), "")
    return ""


def _fail(submission, error_msg):
    from apps.submissions.models import Submission
    submission.status = Submission.Status.FAILED
    submission.canvas_sync_error = error_msg
    submission.save()
    logger.error("Submission %s marked FAILED: %s", submission.pk, error_msg)


# ── Task wrapper ──────────────────────────────────────────────────────────

try:
    from celery import shared_task

    @shared_task(bind=True, max_retries=3, default_retry_delay=60)
    def sync_submission_to_canvas(self, submission_id, existing_canvas_user_id=None, reviewer_user_id=None):
        try:
            _run_sync(
                submission_id,
                existing_canvas_user_id=existing_canvas_user_id,
                reviewer_user_id=reviewer_user_id,
            )
        except Exception as exc:
            try:
                raise self.retry(exc=exc)
            except self.MaxRetriesExceededError:
                pass

except ImportError:
    # Celery not installed — run synchronously
    def sync_submission_to_canvas(submission_id, existing_canvas_user_id=None, reviewer_user_id=None):
        logger.info("Celery not available — running Canvas sync synchronously.")
        _run_sync(
            submission_id,
            existing_canvas_user_id=existing_canvas_user_id,
            reviewer_user_id=reviewer_user_id,
        )

    # Add a .delay() shim so call sites don't need changing
    sync_submission_to_canvas.delay = sync_submission_to_canvas
