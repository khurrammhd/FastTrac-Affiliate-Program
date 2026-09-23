"""
Role-Based Access Control for MIS.

Three roles — highest to lowest privilege:

  superadmin  Full access. Can manage users, roles, everything.
  admin       Can create/edit/publish forms, approve/reject submissions,
              trigger Canvas sync, manage their own users.
  reviewer    Can view forms and submissions, approve/reject submissions.
              Cannot create or edit forms, cannot manage users.
  viewer      Read-only across forms and submissions. No write access.

Role hierarchy:  superadmin > admin > reviewer > viewer

Usage on any DRF view or viewset:
    permission_classes = [IsAuthenticated, IsAdminOrAbove]
"""

from rest_framework.permissions import BasePermission, IsAuthenticated  # noqa: F401

ROLE_HIERARCHY = {
    "superadmin": 4,
    "admin":      3,
    "reviewer":   2,
    "viewer":     1,
    "staff":      1,   # legacy alias → viewer level
}


def _level(user):
    return ROLE_HIERARCHY.get(getattr(user, "role", ""), 0)


class IsSuperAdmin(BasePermission):
    """Only superadmin."""
    message = "Superadmin access required."

    def has_permission(self, request, view):
        return request.user.is_authenticated and _level(request.user) >= 4


class IsAdminOrAbove(BasePermission):
    """Admin or superadmin."""
    message = "Admin access required."

    def has_permission(self, request, view):
        return request.user.is_authenticated and _level(request.user) >= 3


class IsReviewerOrAbove(BasePermission):
    """Reviewer, admin, or superadmin."""
    message = "Reviewer access required."

    def has_permission(self, request, view):
        return request.user.is_authenticated and _level(request.user) >= 2


class IsViewerOrAbove(BasePermission):
    """Any authenticated user with a valid role (viewer+)."""
    message = "Viewer access required."

    def has_permission(self, request, view):
        return request.user.is_authenticated and _level(request.user) >= 1


class IsAdminOrReadOnly(BasePermission):
    """
    Safe methods (GET, HEAD, OPTIONS) → reviewer/viewer allowed.
    Write methods → admin+ required.
    """
    message = "Admin access required for write operations."

    def has_permission(self, request, view):
        if not request.user.is_authenticated:
            return False
        if request.method in ("GET", "HEAD", "OPTIONS"):
            return _level(request.user) >= 1
        return _level(request.user) >= 3


class CanManageForms(BasePermission):
    """Create / edit / delete / publish forms → admin+."""
    message = "You do not have permission to manage forms."

    def has_permission(self, request, view):
        if not request.user.is_authenticated:
            return False
        if request.method in ("GET", "HEAD", "OPTIONS"):
            return _level(request.user) >= 2   # reviewer can read
        return _level(request.user) >= 3        # admin+ can write


class CanReviewSubmissions(BasePermission):
    """
    View submissions → reviewer+.
    Approve / reject → reviewer+.
    """
    message = "Reviewer access required to manage submissions."

    def has_permission(self, request, view):
        return request.user.is_authenticated and _level(request.user) >= 2


class CanSyncToCanvas(BasePermission):
    """Trigger Canvas sync → admin+."""
    message = "Admin access required to sync to Canvas."

    def has_permission(self, request, view):
        return request.user.is_authenticated and _level(request.user) >= 3


class CanManageUsers(BasePermission):
    """Create / update / delete users → admin+."""
    message = "Admin access required to manage users."

    def has_permission(self, request, view):
        if not request.user.is_authenticated:
            return False
        if request.method in ("GET", "HEAD", "OPTIONS"):
            return _level(request.user) >= 3
        return _level(request.user) >= 3
