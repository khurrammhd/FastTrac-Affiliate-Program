import logging

from rest_framework import permissions
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.permissions import CanManageForms, CanReviewSubmissions
from apps.forms_builder.models import Form
from apps.submissions.models import Submission

from .client import ZoomAPIClient, ZoomAPIError
from .models import ZoomMeeting, ZoomRegistrant
from .serializers import ZoomMeetingSerializer, ZoomRegistrantSerializer
from .signals import _register_submission, _remove_submission

logger = logging.getLogger(__name__)


class ZoomMeetingDetailView(APIView):
    """
    GET  /api/zoom/forms/<form_pk>/meeting/   → return meeting (or 404)
    POST /api/zoom/forms/<form_pk>/meeting/   → create meeting in Zoom + store
    DELETE /api/zoom/forms/<form_pk>/meeting/ → delete from Zoom + DB
    """
    permission_classes = [permissions.IsAuthenticated, CanManageForms]

    def _get_form(self, form_pk):
        try:
            return Form.objects.get(pk=form_pk)
        except Form.DoesNotExist:
            return None

    def get(self, request, form_pk):
        form = self._get_form(form_pk)
        if not form:
            return Response({"error": "Form not found."}, status=404)
        try:
            meeting = form.zoom_meeting
        except ZoomMeeting.DoesNotExist:
            return Response({"detail": "No Zoom meeting linked to this form."}, status=404)
        return Response(ZoomMeetingSerializer(meeting).data)

    def post(self, request, form_pk):
        form = self._get_form(form_pk)
        if not form:
            return Response({"error": "Form not found."}, status=404)

        # Prevent duplicate
        if ZoomMeeting.objects.filter(form=form).exists():
            return Response({"error": "A Zoom meeting is already linked to this form."}, status=400)

        topic = request.data.get("topic") or f"Session: {form.title}"
        agenda = request.data.get("agenda", "")
        duration = int(request.data.get("duration_minutes", 60))
        start_time = request.data.get("start_time") or None
        schedule_days = request.data.get("schedule_days", [])

        # Validate schedule_days
        if not isinstance(schedule_days, list):
            return Response({"error": "schedule_days must be a list."}, status=400)
        if len(schedule_days) > 4:
            return Response({"error": "Maximum 4 days allowed."}, status=400)
        for i, day in enumerate(schedule_days):
            if not day.get("date") or not day.get("start_time") or not day.get("end_time"):
                return Response(
                    {"error": f"Day {i + 1} is missing date, start_time, or end_time."},
                    status=400,
                )

        # Derive start_time and duration from first scheduled day when available
        if schedule_days:
            first = schedule_days[0]
            if not start_time:
                start_time = f"{first['date']}T{first['start_time']}:00"
            import datetime as _dt
            try:
                s = _dt.datetime.strptime(f"{first['date']}T{first['start_time']}", "%Y-%m-%dT%H:%M")
                e = _dt.datetime.strptime(f"{first['date']}T{first['end_time']}", "%Y-%m-%dT%H:%M")
                duration = max(15, int((e - s).total_seconds() / 60))
            except (ValueError, KeyError):
                pass

        # Normalize datetime-local format (YYYY-MM-DDTHH:MM) to Zoom's expected format
        if start_time and len(start_time) == 16:
            start_time = start_time + ":00"

        client = ZoomAPIClient()
        try:
            result = client.create_meeting(topic, agenda=agenda, duration_minutes=duration, start_time=start_time)
        except ZoomAPIError as exc:
            return Response({"error": str(exc)}, status=502)

        meeting = ZoomMeeting.objects.create(
            form=form,
            zoom_meeting_id=str(result["id"]),
            topic=topic,
            join_url=result.get("join_url", ""),
            start_url=result.get("start_url", ""),
            created_by=request.user,
            schedule_days=schedule_days,
        )
        return Response(ZoomMeetingSerializer(meeting).data, status=201)

    def delete(self, request, form_pk):
        form = self._get_form(form_pk)
        if not form:
            return Response({"error": "Form not found."}, status=404)
        try:
            meeting = form.zoom_meeting
        except ZoomMeeting.DoesNotExist:
            return Response({"error": "No meeting found."}, status=404)

        client = ZoomAPIClient()
        try:
            client.delete_meeting(meeting.zoom_meeting_id)
        except ZoomAPIError as exc:
            logger.warning("Zoom delete meeting %s failed: %s", meeting.zoom_meeting_id, exc)

        meeting.delete()
        return Response(status=204)

    def patch(self, request, form_pk):
        """
        PATCH /api/zoom/forms/<form_pk>/meeting/  → update topic and/or schedule_days
        Does NOT touch the Zoom API — only updates the local record.
        """
        form = self._get_form(form_pk)
        if not form:
            return Response({"error": "Form not found."}, status=404)
        try:
            meeting = form.zoom_meeting
        except ZoomMeeting.DoesNotExist:
            return Response({"error": "No meeting found."}, status=404)

        if "topic" in request.data:
            meeting.topic = request.data["topic"] or meeting.topic

        if "schedule_days" in request.data:
            schedule_days = request.data["schedule_days"]
            if not isinstance(schedule_days, list):
                return Response({"error": "schedule_days must be a list."}, status=400)
            if len(schedule_days) > 4:
                return Response({"error": "Maximum 4 days allowed."}, status=400)
            for i, day in enumerate(schedule_days):
                if not day.get("date") or not day.get("start_time") or not day.get("end_time"):
                    return Response(
                        {"error": f"Day {i + 1} is missing date, start_time, or end_time."},
                        status=400,
                    )
            meeting.schedule_days = schedule_days

        meeting.save(update_fields=["topic", "schedule_days", "updated_at"])
        return Response(ZoomMeetingSerializer(meeting).data)


class ZoomRegistrantView(APIView):
    """
    GET    /api/zoom/submissions/<submission_pk>/registrant/  → return registrant
    POST   /api/zoom/submissions/<submission_pk>/registrant/  → manually register
    DELETE /api/zoom/submissions/<submission_pk>/registrant/  → manually remove
    """
    permission_classes = [permissions.IsAuthenticated, CanReviewSubmissions]

    def _get_submission(self, pk):
        try:
            return Submission.objects.select_related("form", "form__zoom_meeting").get(pk=pk)
        except Submission.DoesNotExist:
            return None

    def get(self, request, submission_pk):
        sub = self._get_submission(submission_pk)
        if not sub:
            return Response({"error": "Submission not found."}, status=404)
        try:
            reg = sub.zoom_registrant
        except ZoomRegistrant.DoesNotExist:
            return Response({"detail": "Not registered in Zoom."}, status=404)
        return Response(ZoomRegistrantSerializer(reg).data)

    def post(self, request, submission_pk):
        sub = self._get_submission(submission_pk)
        if not sub:
            return Response({"error": "Submission not found."}, status=404)

        _register_submission(sub)

        try:
            reg = sub.zoom_registrant
        except ZoomRegistrant.DoesNotExist:
            return Response({"error": "Could not register — does this form have a Zoom meeting?"}, status=400)

        if reg.status == ZoomRegistrant.Status.FAILED:
            return Response({"error": reg.error_message}, status=502)

        return Response(ZoomRegistrantSerializer(reg).data, status=201)

    def delete(self, request, submission_pk):
        sub = self._get_submission(submission_pk)
        if not sub:
            return Response({"error": "Submission not found."}, status=404)

        _remove_submission(sub)
        return Response(status=204)


class ZoomBatchCleanupView(APIView):
    """
    POST /api/zoom/forms/<form_pk>/cleanup/
    Removes all current registrants from Zoom (sets status=removed).
    Used for monthly cohort rotation.
    """
    permission_classes = [permissions.IsAuthenticated, CanManageForms]

    def post(self, request, form_pk):
        try:
            form = Form.objects.get(pk=form_pk)
            meeting = form.zoom_meeting
        except (Form.DoesNotExist, ZoomMeeting.DoesNotExist):
            return Response({"error": "Form or meeting not found."}, status=404)

        registrants = ZoomRegistrant.objects.filter(
            zoom_meeting=meeting,
            status=ZoomRegistrant.Status.REGISTERED,
        ).select_related("submission")

        removed = 0
        errors = []
        for reg in registrants:
            try:
                _remove_submission(reg.submission)
                removed += 1
            except Exception as exc:
                errors.append(str(exc))

        return Response({"removed": removed, "errors": errors})
