import csv
import json
from datetime import timedelta
import logging

from django.db.models import Count, Q
from django.db.models.functions import TruncDate
from django.http import HttpResponse
from django.utils import timezone
from rest_framework import generics, permissions, filters
from rest_framework.response import Response
from rest_framework.views import APIView
from django_filters.rest_framework import DjangoFilterBackend

from apps.accounts.permissions import CanReviewSubmissions, CanSyncToCanvas, IsViewerOrAbove, IsAdminOrAbove
from apps.audit.models import AuditLog, log as audit_log
from .models import Submission, SubmissionNote
from .serializers import (
    SubmissionSerializer, PublicSubmissionCreateSerializer,
    SubmissionNoteSerializer, SubmissionApproveSerializer, SubmissionRejectSerializer,
)
from apps.canvas_integration.client import CanvasAPIClient
from apps.canvas_integration.views import _get_canvas_client_for_user, _maybe_refresh_canvas_token
from apps.canvas_integration.tasks import sync_submission_to_canvas

logger = logging.getLogger(__name__)


def _resolve_submitter_identity(submission):
    name = (submission.submitter_name or "").strip()
    email = (submission.submitter_email or "").strip()

    if name and email:
        return name, email

    raw_data = submission.data or {}
    for field in submission.form.fields.all():
        value = raw_data.get(str(field.id)) or raw_data.get(field.id, "")
        value = str(value).strip() if value else ""
        if not value:
            continue

        if not email and (field.canvas_field_mapping == "email" or field.field_type == "email" or "email" in field.label.lower()):
            email = value

        if not name and (field.canvas_field_mapping == "name" or "name" in field.label.lower()):
            name = value

    return name, email


class SubmissionListView(generics.ListAPIView):
    serializer_class = SubmissionSerializer
    permission_classes = [permissions.IsAuthenticated, CanReviewSubmissions]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ["status", "form"]
    search_fields = ["submitter_email", "submitter_name"]
    ordering_fields = ["submitted_at", "updated_at"]

    def get_queryset(self):
        return Submission.objects.select_related("form", "reviewed_by").prefetch_related("notes", "form__fields")


class SubmissionExportView(APIView):
    permission_classes = [permissions.IsAuthenticated, CanReviewSubmissions]

    def get(self, request):
        form_id = request.query_params.get("form")
        if not form_id or not str(form_id).isdigit():
            return Response({"error": "A valid form parameter is required."}, status=400)

        submissions = list(
            Submission.objects.filter(form_id=form_id)
            .select_related("form", "reviewed_by")
            .prefetch_related("form__fields")
            .order_by("submitted_at", "id")
        )
        if not submissions:
            return Response({"error": "No submissions found for this form."}, status=404)

        form = submissions[0].form
        fields = list(form.fields.order_by("order", "id"))
        response = HttpResponse(content_type="text/csv; charset=utf-8")
        response["Content-Disposition"] = f'attachment; filename="{form.slug}-submissions.csv"'
        writer = csv.writer(response)
        writer.writerow([
            "Submission ID", "Name", "Email", "Status", "Submitted",
            "Reviewed", "Canvas User ID", "Canvas Enrollment ID",
            *[field.label for field in fields],
        ])

        for submission in submissions:
            data = submission.data or {}
            values = []
            for field in fields:
                value = data.get(str(field.id), data.get(field.id, ""))
                if isinstance(value, (dict, list)):
                    value = json.dumps(value, ensure_ascii=False)
                values.append(value)
            writer.writerow([
                submission.id,
                submission.submitter_name,
                submission.submitter_email,
                submission.status,
                submission.submitted_at.isoformat() if submission.submitted_at else "",
                submission.reviewed_at.isoformat() if submission.reviewed_at else "",
                submission.canvas_user_id or "",
                submission.canvas_enrollment_id or "",
                *values,
            ])

        return response


class SubmissionDetailView(generics.RetrieveDestroyAPIView):
    queryset = Submission.objects.select_related("form", "reviewed_by").prefetch_related("notes", "form__fields")
    serializer_class = SubmissionSerializer

    def get_permissions(self):
        if self.request.method == "DELETE":
            return [permissions.IsAuthenticated(), IsAdminOrAbove()]
        return [permissions.IsAuthenticated(), CanReviewSubmissions()]


class SubmissionDashboardSummaryView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsViewerOrAbove]

    def get(self, request):
        today = timezone.localdate()
        week_start = today - timedelta(days=today.weekday())
        queryset = Submission.objects.select_related("form")

        form_id = request.query_params.get("form")
        if form_id:
            queryset = queryset.filter(form_id=form_id)

        try:
            days = int(request.query_params.get("days", 7))
        except (TypeError, ValueError):
            days = 7
        days = max(7, min(days, 365))

        range_start = today - timedelta(days=days - 1)
        trend_start = range_start
        queryset = queryset.filter(submitted_at__date__gte=range_start)

        counts = queryset.aggregate(
            total=Count("id"),
            today=Count("id", filter=Q(submitted_at__date=today)),
            this_week=Count("id", filter=Q(submitted_at__date__gte=week_start)),
            pending=Count("id", filter=Q(status=Submission.Status.PENDING)),
            approved=Count("id", filter=Q(status=Submission.Status.APPROVED)),
            rejected=Count("id", filter=Q(status=Submission.Status.REJECTED)),
            synced=Count("id", filter=Q(status=Submission.Status.SYNCED)),
            failed=Count("id", filter=Q(status=Submission.Status.FAILED)),
        )

        reviewed_total = (
            counts["approved"]
            + counts["rejected"]
            + counts["synced"]
            + counts["failed"]
        )
        completion_rate = round((reviewed_total / counts["total"]) * 100, 1) if counts["total"] else 0

        trend_rows = (
            queryset.filter(submitted_at__date__gte=trend_start)
            .annotate(day=TruncDate("submitted_at"))
            .values("day")
            .annotate(total=Count("id"))
            .order_by("day")
        )
        trend_lookup = {row["day"]: row["total"] for row in trend_rows}
        trend = []
        for day_offset in range(days):
            current_day = trend_start + timedelta(days=day_offset)
            trend.append(
                {
                    "label": current_day.strftime("%a"),
                    "date": current_day.isoformat(),
                    "total": trend_lookup.get(current_day, 0),
                }
            )

        top_forms = list(
            queryset.values("form", "form__title")
            .annotate(total=Count("id"))
            .order_by("-total", "form__title")[:5]
        )

        return Response(
            {
                "totals": {
                    "submissions": counts["total"],
                    "today": counts["today"],
                    "this_week": counts["this_week"],
                    "completion_rate": completion_rate,
                },
                "status_counts": {
                    "pending": counts["pending"],
                    "approved": counts["approved"],
                    "rejected": counts["rejected"],
                    "synced": counts["synced"],
                    "failed": counts["failed"],
                },
                "pending_vs_approved": {
                    "pending": counts["pending"],
                    "approved": counts["approved"] + counts["synced"],
                },
                "reviewed_total": reviewed_total,
                "trend": trend,
                "top_forms": [
                    {
                        "id": row["form"],
                        "title": row["form__title"],
                        "total": row["total"],
                    }
                    for row in top_forms
                ],
                "filters": {
                    "form": int(form_id) if form_id and str(form_id).isdigit() else None,
                    "days": days,
                    "range_start": range_start.isoformat(),
                    "range_end": today.isoformat(),
                },
            }
        )


class SubmissionApproveView(APIView):
    permission_classes = [permissions.IsAuthenticated, CanReviewSubmissions]

    def post(self, request, pk):
        if not request.user or not request.user.is_authenticated:
            return Response({"error": "Authentication required."}, status=401)

        try:
            submission = Submission.objects.get(pk=pk, status=Submission.Status.PENDING)
        except Submission.DoesNotExist:
            return Response({"error": "Submission not found or not pending."}, status=404)

        serializer = SubmissionApproveSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        existing_canvas_user_id = serializer.validated_data.get("existing_canvas_user_id")

        submission.status = Submission.Status.APPROVED
        submission.reviewed_by = request.user
        submission.reviewed_at = timezone.now()
        submission.save()

        note_body = serializer.validated_data.get("note", "").strip()
        if note_body:
            SubmissionNote.objects.create(submission=submission, author=request.user, body=note_body)

        try:
            sync_submission_to_canvas.delay(submission.pk, existing_canvas_user_id, request.user.pk)
        except Exception as exc:
            submission.canvas_sync_error = (
                "Canvas sync could not be queued right now. "
                "Use Re-sync when background workers are available. "
                f"Details: {exc}"
            )
            submission.save(update_fields=["canvas_sync_error", "updated_at"])

        try:
            audit_log(
                AuditLog.Action.SUB_APPROVED,
                actor=request.user,
                target=submission,
                detail={"note": note_body},
                request=request,
            )
        except Exception:
            logger.exception("Failed to write approve audit log for submission %s", submission.pk)

        return Response(SubmissionSerializer(submission).data)


class SubmissionCanvasUserMatchesView(APIView):
    permission_classes = [permissions.IsAuthenticated, CanReviewSubmissions]

    def get(self, request, pk):
        try:
            submission = Submission.objects.select_related("form").prefetch_related("form__fields").get(pk=pk)
        except Submission.DoesNotExist:
            return Response({"error": "Submission not found."}, status=404)

        submitter_name, submitter_email = _resolve_submitter_identity(submission)

        if not submitter_name and not submitter_email:
            return Response(
                {
                    "submission_user": {
                        "name": "",
                        "email": "",
                    },
                    "matches": [],
                    "message": "No identifying data found in submission.",
                }
            )

        try:
            client, token_obj = _get_canvas_client_for_user(request.user)
            if token_obj and token_obj.is_expired:
                refreshed = _maybe_refresh_canvas_token(token_obj)
                if refreshed:
                    client = refreshed
            matches = client.find_potential_users(email=submitter_email, name=submitter_name)
            lookup_unavailable = False
        except Exception as exc:
            logger.warning(
                "Canvas user lookup unavailable for submission %s: %s",
                submission.pk, exc
            )
            matches = []
            lookup_unavailable = True

        return Response(
            {
                "submission_user": {
                    "name": submitter_name,
                    "email": submitter_email,
                },
                "matches": matches,
                "lookup_unavailable": lookup_unavailable,
            }
        )


class SubmissionRejectView(APIView):
    permission_classes = [permissions.IsAuthenticated, CanReviewSubmissions]

    def post(self, request, pk):
        if not request.user or not request.user.is_authenticated:
            return Response({"error": "Authentication required."}, status=401)

        try:
            submission = Submission.objects.get(pk=pk, status=Submission.Status.PENDING)
        except Submission.DoesNotExist:
            return Response({"error": "Submission not found or not pending."}, status=404)

        serializer = SubmissionRejectSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        submission.status = Submission.Status.REJECTED
        submission.reviewed_by = request.user
        submission.reviewed_at = timezone.now()
        submission.rejection_reason = serializer.validated_data["reason"]
        submission.save()

        try:
            audit_log(
                AuditLog.Action.SUB_REJECTED,
                actor=request.user,
                target=submission,
                detail={"reason": submission.rejection_reason},
                request=request,
            )
        except Exception:
            logger.exception("Failed to write reject audit log for submission %s", submission.pk)

        return Response(SubmissionSerializer(submission).data)


class SubmissionUnrejectView(APIView):
    permission_classes = [permissions.IsAuthenticated, CanReviewSubmissions]

    def post(self, request, pk):
        if not request.user or not request.user.is_authenticated:
            return Response({"error": "Authentication required."}, status=401)

        try:
            submission = Submission.objects.get(pk=pk, status=Submission.Status.REJECTED)
        except Submission.DoesNotExist:
            return Response({"error": "Submission not found or not rejected."}, status=404)

        previous_reason = submission.rejection_reason
        submission.status = Submission.Status.PENDING
        submission.reviewed_by = None
        submission.reviewed_at = None
        submission.rejection_reason = ""
        submission.save(update_fields=["status", "reviewed_by", "reviewed_at", "rejection_reason", "updated_at"])

        try:
            audit_log(
                AuditLog.Action.SUB_UNREJECTED,
                actor=request.user,
                target=submission,
                detail={"previous_reason": previous_reason},
                request=request,
            )
        except Exception:
            logger.exception("Failed to write unreject audit log for submission %s", submission.pk)

        return Response(SubmissionSerializer(submission).data)


class SubmissionResyncView(APIView):
    permission_classes = [permissions.IsAuthenticated, CanSyncToCanvas]

    def post(self, request, pk):
        try:
            submission = Submission.objects.get(
                pk=pk, status__in=[Submission.Status.APPROVED, Submission.Status.FAILED]
            )
        except Submission.DoesNotExist:
            return Response({"error": "Submission not found or not eligible for re-sync."}, status=404)

        submission.canvas_sync_error = ""
        submission.save()
        try:
            sync_submission_to_canvas.delay(submission.pk, None, request.user.pk)
        except Exception as exc:
            submission.canvas_sync_error = (
                "Canvas sync could not be queued right now. "
                "Please try again after workers are available. "
                f"Details: {exc}"
            )
            submission.save(update_fields=["canvas_sync_error", "updated_at"])
            return Response({"error": submission.canvas_sync_error}, status=503)

        audit_log(AuditLog.Action.SUB_RESYNCED, actor=request.user,
                  target=submission, request=request)

        return Response({"message": "Canvas sync triggered.", "id": submission.pk})


class SubmissionRemoveUserView(APIView):
    """
    Removes a submitter's Canvas enrollment. Whether the Canvas user account
    itself is also deleted depends on `canvas_user_precreated`:
      - False → account was created during this course sync → safe to delete entirely.
      - True/None (existed before, or unknown) → keep the account, course removal only.
    """
    permission_classes = [permissions.IsAuthenticated, IsAdminOrAbove]

    def post(self, request, pk):
        try:
            submission = Submission.objects.select_related("form").get(pk=pk)
        except Submission.DoesNotExist:
            return Response({"error": "Submission not found."}, status=404)

        if not submission.canvas_user_id:
            return Response({"error": "This submission has no associated Canvas user."}, status=400)

        # Safety default: only delete the Canvas account when we are certain
        # it was created as part of this course-enrollment sync.
        delete_account = submission.canvas_user_precreated is False
        course_id = submission.form.canvas_course_id

        client, token_obj = _get_canvas_client_for_user(request.user)
        if token_obj and token_obj.is_expired:
            refreshed = _maybe_refresh_canvas_token(token_obj)
            if refreshed:
                client = refreshed

        enrollment_removed = False
        account_removed = False
        errors = []

        if submission.canvas_enrollment_id and course_id:
            try:
                client.delete_enrollment(course_id, submission.canvas_enrollment_id, task="delete")
                enrollment_removed = True
            except Exception as exc:
                errors.append(f"Could not remove course enrollment: {exc}")
        else:
            errors.append("No Canvas enrollment recorded for this submission; nothing to remove from the course.")

        if delete_account:
            try:
                client.delete_user(submission.canvas_user_id)
                account_removed = True
            except Exception as exc:
                errors.append(f"Could not delete Canvas user account: {exc}")

        if not enrollment_removed and not account_removed:
            return Response({"error": " ".join(errors)}, status=502)

        submission.canvas_enrollment_id = ""
        if account_removed:
            submission.canvas_user_id = ""
            submission.canvas_user_precreated = None
        submission.canvas_sync_error = ""
        submission.save()

        try:
            audit_log(
                AuditLog.Action.SUB_USER_REMOVED,
                actor=request.user,
                target=submission,
                detail={"enrollment_removed": enrollment_removed, "account_removed": account_removed},
                request=request,
            )
        except Exception:
            logger.exception("Failed to write user-removal audit log for submission %s", submission.pk)

        data = SubmissionSerializer(submission).data
        data["warning"] = " ".join(errors) if errors else None
        data["account_removed"] = account_removed
        data["enrollment_removed"] = enrollment_removed
        return Response(data)


class SubmissionNoteCreateView(generics.CreateAPIView):
    serializer_class = SubmissionNoteSerializer
    permission_classes = [permissions.IsAuthenticated, CanReviewSubmissions]

    def perform_create(self, serializer):
        submission = Submission.objects.get(pk=self.kwargs["pk"])
        serializer.save(author=self.request.user, submission=submission)


class PublicSubmissionCreateView(generics.CreateAPIView):
    serializer_class = PublicSubmissionCreateSerializer
    permission_classes = [permissions.AllowAny]

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(
            {"message": "Your submission has been received. You will be notified once it is reviewed."},
            status=201,
        )
