"""
Zoom integration signals.

- When a submission is approved → auto-register in Zoom (if the form has a meeting).
- When a submission is rejected → auto-remove from Zoom (if registered).
"""
import logging
import uuid
from datetime import datetime
from urllib.parse import urlencode

from django.db.models.signals import post_save
from django.dispatch import receiver

logger = logging.getLogger(__name__)


# ── Calendar helpers ──────────────────────────────────────────────────────────

def _format_date(date_str):
    """Format 'YYYY-MM-DD' → 'Month DD, YYYY'."""
    try:
        return datetime.strptime(date_str, "%Y-%m-%d").strftime("%B %d, %Y")
    except (ValueError, TypeError):
        return date_str


def _format_time(time_str):
    """Format 'HH:MM' → '12:00 PM' (strips leading zero)."""
    try:
        result = datetime.strptime(time_str, "%H:%M").strftime("%I:%M %p").lstrip("0")
        return result or "12:00 AM"
    except (ValueError, TypeError):
        return time_str


def _google_calendar_link(topic, date_str, start_str, end_str):
    """Return a Google Calendar 'Add Event' URL for a single day."""
    try:
        start = datetime.strptime(f"{date_str}T{start_str}", "%Y-%m-%dT%H:%M")
        end   = datetime.strptime(f"{date_str}T{end_str}",   "%Y-%m-%dT%H:%M")
        dates = f"{start.strftime('%Y%m%dT%H%M%S')}/{end.strftime('%Y%m%dT%H%M%S')}"
        params = urlencode({"action": "TEMPLATE", "text": topic, "dates": dates})
        return f"https://calendar.google.com/calendar/render?{params}"
    except (ValueError, TypeError):
        return ""


def _generate_ics(topic, schedule_days):
    """Generate RFC 5545 iCalendar content with one VEVENT per scheduled day."""
    dtstamp = datetime.utcnow().strftime("%Y%m%dT%H%M%SZ")
    lines = [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        "PRODID:-//FastTrac//Meeting Schedule//EN",
        "CALSCALE:GREGORIAN",
        "METHOD:PUBLISH",
    ]
    for day in schedule_days:
        date_str  = day.get("date", "")
        start_str = day.get("start_time", "09:00")
        end_str   = day.get("end_time",   "10:00")
        try:
            start = datetime.strptime(f"{date_str}T{start_str}", "%Y-%m-%dT%H:%M")
            end   = datetime.strptime(f"{date_str}T{end_str}",   "%Y-%m-%dT%H:%M")
        except (ValueError, TypeError):
            continue
        lines += [
            "BEGIN:VEVENT",
            f"UID:{uuid.uuid4()}@fasttrac",
            f"DTSTAMP:{dtstamp}",
            f"DTSTART:{start.strftime('%Y%m%dT%H%M%S')}",
            f"DTEND:{end.strftime('%Y%m%dT%H%M%S')}",
            f"SUMMARY:{topic}",
            "END:VEVENT",
        ]
    lines.append("END:VCALENDAR")
    return "\r\n".join(lines)


def _build_schedule_context(topic, schedule_days):
    """Return a list of enriched day dicts suitable for the email template."""
    enriched = []
    for i, day in enumerate(schedule_days or []):
        date_str  = day.get("date", "")
        start_str = day.get("start_time", "")
        end_str   = day.get("end_time", "")
        enriched.append({
            "day_number":           i + 1,
            "date":                 date_str,
            "start_time":           start_str,
            "end_time":             end_str,
            "formatted_date":       _format_date(date_str),
            "formatted_start":      _format_time(start_str),
            "formatted_end":        _format_time(end_str),
            "google_calendar_url":  _google_calendar_link(topic, date_str, start_str, end_str),
        })
    return enriched


# ── Core business logic ───────────────────────────────────────────────────────

def _register_submission(submission):
    """Register a submission by sharing the form's Zoom meeting join URL."""
    from .models import ZoomMeeting, ZoomRegistrant

    try:
        meeting = ZoomMeeting.objects.get(form=submission.form)
    except ZoomMeeting.DoesNotExist:
        return

    if hasattr(submission, "zoom_registrant") and submission.zoom_registrant.status == ZoomRegistrant.Status.REGISTERED:
        return

    email = (submission.submitter_email or "").strip()
    if not email:
        logger.warning("Zoom: submission #%s has no email — skipping", submission.pk)
        return

    join_url = meeting.join_url

    ZoomRegistrant.objects.update_or_create(
        submission=submission,
        defaults={
            "zoom_meeting":   meeting,
            "registrant_id":  "",
            "join_url":       join_url,
            "status":         ZoomRegistrant.Status.REGISTERED,
            "error_message":  "",
        },
    )
    logger.info("Zoom: stored join URL for submission #%s", submission.pk)
    _send_approval_email(
        submission,
        join_url,
        schedule_days=meeting.schedule_days or [],
        topic=meeting.topic,
    )


def _remove_submission(submission):
    """Remove Zoom access for a rejected submission (local record only on free plan)."""
    from .models import ZoomRegistrant

    try:
        reg = submission.zoom_registrant
    except ZoomRegistrant.DoesNotExist:
        return

    reg.status = ZoomRegistrant.Status.REMOVED
    reg.join_url = ""
    reg.save(update_fields=["status", "join_url", "updated_at"])
    logger.info("Zoom: marked submission #%s as removed", submission.pk)


def _send_approval_email(submission, join_url=None, schedule_days=None, topic=""):
    """Send an HTML approval confirmation email with optional Zoom link and schedule."""
    from django.core.mail import EmailMultiAlternatives
    from django.template.loader import render_to_string
    from django.conf import settings as django_settings

    email = (submission.submitter_email or "").strip()
    if not email:
        return

    name       = submission.submitter_name or "Applicant"
    form_title = submission.form.title
    topic      = topic or form_title

    enriched_days = _build_schedule_context(topic, schedule_days or [])
    has_schedule  = bool(enriched_days)

    ics_content = None
    if has_schedule:
        ics_content = _generate_ics(topic, schedule_days)

    context = {
        "name":          name,
        "form_title":    form_title,
        "join_url":      join_url or "",
        "schedule_days": enriched_days,
        "has_schedule":  has_schedule,
    }

    html_body = render_to_string("emails/approval_email.html", context)

    text_lines = [
        f"Dear {name},",
        "",
        f"Congratulations! Your application for '{form_title}' has been approved.",
        "",
    ]
    if has_schedule:
        text_lines.append("Meeting Schedule:")
        for d in enriched_days:
            text_lines.append(
                f"  Day {d['day_number']}: {d['formatted_date']} — "
                f"{d['formatted_start']} to {d['formatted_end']}"
            )
        text_lines.append("")
    if join_url:
        text_lines += ["Join the Zoom session here:", join_url, ""]
    text_lines += [
        "If you have any questions, please reply to this email.",
        "",
        "Best regards,",
        "The FastTrac Team",
    ]
    text_body = "\n".join(text_lines)

    try:
        msg = EmailMultiAlternatives(
            subject="Application Approved - " + form_title,
            body=text_body,
            from_email=django_settings.DEFAULT_FROM_EMAIL,
            to=[email],
        )
        msg.attach_alternative(html_body, "text/html")
        if ics_content:
            safe_topic = "".join(c if c.isalnum() or c in "-_ " else "_" for c in topic)[:40].strip()
            msg.attach(f"{safe_topic}.ics", ics_content, "text/calendar")
        msg.send()
        logger.info("Approval email sent to %s for submission #%s", email, submission.pk)
    except Exception as exc:
        logger.warning("Could not send approval email to %s: %s", email, exc)


# ── Signal handler ────────────────────────────────────────────────────────────

@receiver(post_save, sender="submissions.Submission")
def on_submission_save(sender, instance, created, **kwargs):
    from apps.submissions.models import Submission

    if instance.status in (Submission.Status.APPROVED, Submission.Status.SYNCED):
        from .models import ZoomMeeting
        has_meeting = ZoomMeeting.objects.filter(form=instance.form).exists()
        if has_meeting:
            _register_submission(instance)
        else:
            _send_approval_email(instance, join_url=None)
    elif instance.status == Submission.Status.REJECTED:
        _remove_submission(instance)
