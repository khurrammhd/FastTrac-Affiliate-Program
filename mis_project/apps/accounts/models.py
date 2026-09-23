from django.contrib.auth.models import AbstractUser
from django.db import models


class User(AbstractUser):
    """
    Extended user model. Canvas admin users are authenticated via Canvas
    OAuth 2.0; their canvas_user_id links them back to Canvas.
    """

    class Role(models.TextChoices):
        SUPERADMIN = "superadmin", "Super Admin"
        ADMIN      = "admin",      "Admin"
        REVIEWER   = "reviewer",   "Reviewer"
        VIEWER     = "viewer",     "Viewer"

    role = models.CharField(max_length=20, choices=Role.choices, default=Role.VIEWER)
    canvas_user_id = models.CharField(max_length=64, blank=True, null=True, unique=True)
    canvas_login_id = models.CharField(max_length=128, blank=True, null=True)
    avatar_url = models.URLField(blank=True, null=True)
    is_canvas_user = models.BooleanField(default=False)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.get_full_name() or self.username} ({self.role})"

    @property
    def is_superadmin(self):
        return self.role == self.Role.SUPERADMIN

    @property
    def is_admin_or_above(self):
        return self.role in (self.Role.ADMIN, self.Role.SUPERADMIN)

    @property
    def is_reviewer_or_above(self):
        return self.role in (self.Role.REVIEWER, self.Role.ADMIN, self.Role.SUPERADMIN)

    @property
    def is_viewer_or_above(self):
        return True  # any authenticated user with a role

    @property
    def role_level(self):
        from apps.accounts.permissions import ROLE_HIERARCHY
        return ROLE_HIERARCHY.get(self.role, 0)


class CanvasOAuthToken(models.Model):
    """
    Stores Canvas OAuth 2.0 access + refresh tokens per user.
    Tokens are refreshed automatically by canvas_integration tasks.
    """

    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name="canvas_token")
    access_token = models.TextField()
    refresh_token = models.TextField(blank=True, null=True)
    token_type = models.CharField(max_length=32, default="Bearer")
    expires_at = models.DateTimeField(null=True, blank=True)
    scope = models.TextField(blank=True)
    canvas_user_id = models.CharField(max_length=64, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"CanvasToken({self.user.username})"

    @property
    def is_expired(self):
        from django.utils import timezone
        if not self.expires_at:
            return False
        return timezone.now() >= self.expires_at
