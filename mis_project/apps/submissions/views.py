from datetime import timedelta

from django.db.models import Count, Q
from django.db.models.functions import TruncDate
from django.utils import timezone
from rest_framework import generics, permissions, filters
from rest_framework.response import Response
from rest_framework.views import APIView
from django_filters.rest_framework import DjangoFilterBackend

from apps.accounts.permissions import CanReviewSubmissions, CanSyncToCanvas, IsViewerOrAbove
from apps.audit.models import AuditLog, log as audit_log
from .models import Submission, SubmissionNote
from .serializers import (
    SubmissionSerializer, PublicSubmissionCreateSerializer,
    SubmissionNoteSerializer, SubmissionApproveSerializer, SubmissionRejectSerializer,
)
from apps.canvas_integration.tasks import sync_submission_to_canvas


class SubmissionListView(generics.ListAPIView):
    serializer_class = SubmissionSerializer
    permission_classes = [permissions.IsAuthenticated, CanReviewSubmissions]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ["status", "form"]
    search_fields = ["submitter_email", "submitter_name"]
    ordering_fields = ["submitted_at", "updated_at"]

    def get_queryset(self):
        return Submission.objects.select_related("form", "reviewed_by").prefetch_related("notes")


class SubmissionDetailView(generics.RetrieveAPIView):
    queryset = Submission.objects.all()
    serializer_class = SubmissionSerializer
    permission_classes = [permissions.IsAuthenticated, CanReviewSubmissions]


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
        try:
            submission = Submission.objects.get(pk=pk, status=Submission.Status.PENDING)
        except Submission.DoesNotExist:
            return Response({"error": "Submission not found or not pending."}, status=404)

        serializer = SubmissionApproveSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        submission.status = Submission.Status.APPROVED
        submission.reviewed_by = request.user
        submission.reviewed_at = timezone.now()
        submission.save()

        note_body = serializer.validated_data.get("note", "").strip()
        if note_body:
            SubmissionNote.objects.create(submission=submission, author=request.user, body=note_body)

        try:
            sync_submission_to_canvas.delay(submission.pk)
        except Exception as exc:
            submission.canvas_sync_error = (
                "Canvas sync could not be queued right now. "
                "Use Re-sync when background workers are available. "
                f"Details: {exc}"
            )
            submission.save(update_fields=["canvas_sync_error", "updated_at"])

        audit_log(AuditLog.Action.SUB_APPROVED, actor=request.user,
                  target=submission, detail={"note": note_body}, request=request)

        return Response(SubmissionSerializer(submission).data)


class SubmissionRejectView(APIView):
    permission_classes = [permissions.IsAuthenticated, CanReviewSubmissions]

    def post(self, request, pk):
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

        audit_log(AuditLog.Action.SUB_REJECTED, actor=request.user,
                  target=submission, detail={"reason": submission.rejection_reason}, request=request)

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
            sync_submission_to_canvas.delay(submission.pk)
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
