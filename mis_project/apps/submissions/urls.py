from django.urls import path
from .views import (
    SubmissionListView, SubmissionDetailView,
    SubmissionApproveView, SubmissionRejectView, SubmissionUnrejectView,
    SubmissionResyncView, SubmissionNoteCreateView, SubmissionCanvasUserMatchesView,
    SubmissionRemoveUserView,
    PublicSubmissionCreateView, SubmissionDashboardSummaryView, SubmissionExportView,
)

urlpatterns = [
    path("summary/",                 SubmissionDashboardSummaryView.as_view(), name="submission_summary"),
    path("export/",                 SubmissionExportView.as_view(),          name="submission_export"),
    path("",                        SubmissionListView.as_view(),       name="submission_list"),
    path("<int:pk>/",               SubmissionDetailView.as_view(),     name="submission_detail"),
    path("<int:pk>/canvas-user-matches/", SubmissionCanvasUserMatchesView.as_view(), name="submission_canvas_user_matches"),
    path("<int:pk>/approve/",       SubmissionApproveView.as_view(),    name="submission_approve"),
    path("<int:pk>/reject/",        SubmissionRejectView.as_view(),     name="submission_reject"),
    path("<int:pk>/unreject/",      SubmissionUnrejectView.as_view(),   name="submission_unreject"),
    path("<int:pk>/resync/",        SubmissionResyncView.as_view(),     name="submission_resync"),
    path("<int:pk>/remove-user/",   SubmissionRemoveUserView.as_view(), name="submission_remove_user"),
    path("<int:pk>/notes/",         SubmissionNoteCreateView.as_view(), name="submission_note"),
    path("submit/",                 PublicSubmissionCreateView.as_view(), name="public_submit"),
]
