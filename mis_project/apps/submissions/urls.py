from django.urls import path
from .views import (
    SubmissionListView, SubmissionDetailView,
    SubmissionApproveView, SubmissionRejectView,
    SubmissionResyncView, SubmissionNoteCreateView,
    PublicSubmissionCreateView, SubmissionDashboardSummaryView,
)

urlpatterns = [
    path("summary/",                 SubmissionDashboardSummaryView.as_view(), name="submission_summary"),
    path("",                        SubmissionListView.as_view(),       name="submission_list"),
    path("<int:pk>/",               SubmissionDetailView.as_view(),     name="submission_detail"),
    path("<int:pk>/approve/",       SubmissionApproveView.as_view(),    name="submission_approve"),
    path("<int:pk>/reject/",        SubmissionRejectView.as_view(),     name="submission_reject"),
    path("<int:pk>/resync/",        SubmissionResyncView.as_view(),     name="submission_resync"),
    path("<int:pk>/notes/",         SubmissionNoteCreateView.as_view(), name="submission_note"),
    path("submit/",                 PublicSubmissionCreateView.as_view(), name="public_submit"),
]
