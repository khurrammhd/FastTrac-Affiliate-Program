from rest_framework import serializers
from .models import User


class UserSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = [
            "id", "username", "email", "first_name", "last_name",
            "role", "canvas_user_id", "canvas_login_id", "avatar_url", "is_canvas_user",
            "is_active", "created_at",
        ]
        read_only_fields = ["id", "canvas_user_id", "canvas_login_id", "is_canvas_user", "created_at"]


class UserCreateSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, min_length=8)

    class Meta:
        model = User
        fields = ["username", "email", "first_name", "last_name", "role", "password"]

    def create(self, validated_data):
        password = validated_data.pop("password")
        user = User(**validated_data)
        user.set_password(password)
        user.save()
        return user


class MeSerializer(serializers.ModelSerializer):
    """Returned on login and /me/. Includes role so frontend can gate UI."""
    permissions = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = [
            "id", "username", "email", "first_name", "last_name",
            "role", "canvas_user_id", "canvas_login_id", "avatar_url", "is_canvas_user",
            "permissions",
        ]

    def get_permissions(self, obj):
        """Return a flat list of string permissions the frontend can check."""
        from apps.accounts.permissions import ROLE_HIERARCHY
        level = ROLE_HIERARCHY.get(obj.role, 0)
        perms = []
        if level >= 1: perms += ["view_forms", "view_submissions"]
        if level >= 2: perms += ["review_submissions"]
        if level >= 3: perms += ["manage_forms", "sync_canvas", "manage_users"]
        if level >= 4: perms += ["manage_roles", "superadmin"]
        return perms
