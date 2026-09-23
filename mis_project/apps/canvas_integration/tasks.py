import logging
from django.conf import settings

logger = logging.getLogger(__name__)


def _run_sync(submission_id):
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

    client = CanvasAPIClient()

    # Extract name and email from mapped fields
    name  = submission.submitter_name  or _extract_field(submission, "name")  or "Unknown"
    email = submission.submitter_email or _extract_field(submission, "email")

    if not email:
        _fail(submission, "Could not determine email from submission data.")
        return

    try:
        canvas_user   = client.create_user(name=name, email=email)
        canvas_user_id = str(canvas_user.get("id", ""))
        submission.canvas_user_id = canvas_user_id

        course_id = submission.form.canvas_course_id
        if course_id and canvas_user_id:
            enrollment = client.enroll_user(course_id, canvas_user_id)
            submission.canvas_enrollment_id = str(enrollment.get("id", ""))

        submission.status           = Submission.Status.SYNCED
        submission.canvas_synced_at = timezone.now()
        submission.canvas_sync_error = ""
        submission.save()

        logger.info("Submission %s synced. Canvas user ID: %s", submission_id, canvas_user_id)

    except Exception as exc:
        logger.exception("Canvas sync failed for submission %s: %s", submission_id, exc)
        _fail(submission, str(exc))


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
    def sync_submission_to_canvas(self, submission_id):
        try:
            _run_sync(submission_id)
        except Exception as exc:
            try:
                raise self.retry(exc=exc)
            except self.MaxRetriesExceededError:
                pass

except ImportError:
    # Celery not installed — run synchronously
    def sync_submission_to_canvas(submission_id):
        logger.info("Celery not available — running Canvas sync synchronously.")
        _run_sync(submission_id)

    # Add a .delay() shim so call sites don't need changing
    sync_submission_to_canvas.delay = sync_submission_to_canvas
