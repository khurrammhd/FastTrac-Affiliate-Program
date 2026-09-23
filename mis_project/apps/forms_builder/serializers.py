from django.contrib.auth import get_user_model
from django.conf import settings
from rest_framework import serializers
from .models import Form, FormField

User = get_user_model()


def _seed_user():
    """Return a dev fallback user. Creates it on first call."""
    user, _ = User.objects.get_or_create(
        username="devseed",
        defaults={
            "email": "devseed@example.local",
            "is_staff": True,
            "is_active": True,
        },
    )
    return user


def _actor(request):
    """Real user if we have one, otherwise the seed user."""
    if request is not None and getattr(request, "user", None) \
       and request.user.is_authenticated:
        return request.user
    return _seed_user()


class FormFieldSerializer(serializers.ModelSerializer):
    # Layout blocks (divider in particular) may legitimately have a blank label.
    # The front-end already enforces that non-layout fields have a label.
    label = serializers.CharField(max_length=255, allow_blank=True, required=False, default="")

    class Meta:
        model = FormField
        fields = [
            "id", "label", "field_type", "placeholder", "help_text",
            "is_required", "order", "field_options", "canvas_field_mapping",
        ]


class FormSerializer(serializers.ModelSerializer):
    fields = FormFieldSerializer(many=True, read_only=True)
    created_by_name = serializers.SerializerMethodField()
    public_url = serializers.ReadOnlyField()

    class Meta:
        model = Form
        fields = [
            "id", "title", "description", "slug", "public_token",
            "status", "enable_captcha", "canvas_course_id", "canvas_course_name",
            "created_by", "created_by_name", "public_url",
            "created_at", "updated_at", "published_at", "closes_at",
            "fields",
        ]
        read_only_fields = ["id", "public_token", "created_by", "created_at", "updated_at"]

    def get_created_by_name(self, obj):
        return obj.created_by.get_full_name() if obj.created_by else None


class FormWriteSerializer(serializers.ModelSerializer):
    """Used for create/update — accepts nested fields."""
    fields = FormFieldSerializer(many=True, required=False)

    class Meta:
        model = Form
        fields = [
            "id", "title", "description", "slug", "status",
            "enable_captcha", "canvas_course_id", "canvas_course_name",
            "published_at", "closes_at", "fields",
        ]
        read_only_fields = ["id"]

    def create(self, validated_data):
        fields_data = validated_data.pop("fields", [])
        validated_data['created_by'] = _actor(self.context.get("request"))
        form = Form.objects.create(**validated_data)
        for i, field_data in enumerate(fields_data):
            field_data.setdefault("order", i)
            FormField.objects.create(form=form, **field_data)
        return form

    def update(self, instance, validated_data):
        # created_by stays as-is on update — don't rewrite ownership
        fields_data = validated_data.pop("fields", None)
        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        instance.save()

        if fields_data is not None:
            instance.fields.all().delete()
            for i, field_data in enumerate(fields_data):
                field_data.setdefault("order", i)
                FormField.objects.create(form=instance, **field_data)

        return instance


class PublicFormSerializer(serializers.ModelSerializer):
    """Minimal serializer for the public form view — no internal data."""
    fields = FormFieldSerializer(many=True, read_only=True)
    captcha_enabled = serializers.SerializerMethodField()
    captcha_site_key = serializers.SerializerMethodField()

    class Meta:
        model = Form
        fields = [
            "id", "title", "description", "fields", "closes_at",
            "captcha_enabled", "captcha_site_key",
        ]

    def get_captcha_enabled(self, obj):
        return bool(obj.enable_captcha and settings.RECAPTCHA_SITE_KEY and settings.RECAPTCHA_SECRET_KEY)

    def get_captcha_site_key(self, obj):
        return settings.RECAPTCHA_SITE_KEY if self.get_captcha_enabled(obj) else ""