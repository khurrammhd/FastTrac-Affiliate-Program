from django.contrib.auth import get_user_model
from django.conf import settings
from rest_framework import serializers
from .models import Form, FormField, FormConfigurationList, FormGroup

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


def _resolve_canvas_course_name(course_id, provided_name):
    """
    If `provided_name` is non-empty, return it as-is.
    Otherwise attempt to look up the course name from Canvas using the
    server API token.  Swallows all errors so a Canvas outage never
    breaks a form save.
    """
    if provided_name:
        return provided_name
    if not course_id:
        return ""
    try:
        from apps.canvas_integration.client import CanvasAPIClient
        client = CanvasAPIClient()
        course = client.get_course(course_id)
        return course.get("name") or course.get("course_code") or str(course_id)
    except Exception:
        return str(course_id)


class FormFieldSerializer(serializers.ModelSerializer):
    # Layout blocks (divider in particular) may legitimately have a blank label.
    # The front-end already enforces that non-layout fields have a label.
    label = serializers.CharField(max_length=255, allow_blank=True, required=False, default="")

    class Meta:
        model = FormField
        fields = [
            "id", "label", "field_type", "placeholder", "help_text",
            "is_required", "order", "field_options", "canvas_field_mapping", "global_list",
        ]


class FormConfigurationListSerializer(serializers.ModelSerializer):
    created_by_name = serializers.SerializerMethodField(read_only=True)

    class Meta:
        model = FormConfigurationList
        fields = ["id", "name", "options", "created_by", "created_by_name", "created_at", "updated_at"]
        read_only_fields = ["id", "created_by", "created_by_name", "created_at", "updated_at"]

    def get_created_by_name(self, obj):
        return obj.created_by.get_full_name() if obj.created_by else None

    def validate_options(self, value):
        if not isinstance(value, list):
            raise serializers.ValidationError("Options must be a list of strings.")
        normalized = [str(v).strip() for v in value if str(v).strip()]
        # De-duplicate while preserving order.
        deduped = []
        seen = set()
        for item in normalized:
            low = item.lower()
            if low in seen:
                continue
            seen.add(low)
            deduped.append(item)
        return deduped

    def create(self, validated_data):
        request = self.context.get("request")
        if request and request.user and request.user.is_authenticated:
            validated_data["created_by"] = request.user
            validated_data["updated_by"] = request.user
        return super().create(validated_data)

    def update(self, instance, validated_data):
        request = self.context.get("request")
        if request and request.user and request.user.is_authenticated:
            instance.updated_by = request.user
        return super().update(instance, validated_data)


class FormGroupSerializer(serializers.ModelSerializer):
    form_count = serializers.SerializerMethodField(read_only=True)

    class Meta:
        model = FormGroup
        fields = ["id", "name", "description", "form_count", "created_at", "updated_at"]
        read_only_fields = ["id", "created_at", "updated_at"]

    def get_form_count(self, obj):
        return obj.forms.count()

    def create(self, validated_data):
        request = self.context.get("request")
        if request and request.user and request.user.is_authenticated:
            validated_data["created_by"] = request.user
        return super().create(validated_data)


class FormSerializer(serializers.ModelSerializer):
    fields = FormFieldSerializer(many=True, read_only=True)
    created_by_name = serializers.SerializerMethodField()
    public_url = serializers.ReadOnlyField()
    group_name = serializers.SerializerMethodField()

    class Meta:
        model = Form
        fields = [
            "id", "title", "description", "slug", "public_token",
            "status", "enable_captcha", "canvas_course_id", "canvas_course_name",
            "group", "group_name",
            "created_by", "created_by_name", "public_url",
            "created_at", "updated_at", "published_at", "closes_at",
            "fields",
        ]
        read_only_fields = ["id", "public_token", "created_by", "created_at", "updated_at"]

    def get_created_by_name(self, obj):
        return obj.created_by.get_full_name() if obj.created_by else None

    def get_group_name(self, obj):
        return obj.group.name if obj.group else None


class FormWriteSerializer(serializers.ModelSerializer):
    """Used for create/update — accepts nested fields."""
    fields = FormFieldSerializer(many=True, required=False)

    class Meta:
        model = Form
        fields = [
            "id", "title", "description", "slug", "status",
            "enable_captcha", "canvas_course_id", "canvas_course_name",
            "group", "published_at", "closes_at", "fields",
        ]
        read_only_fields = ["id"]

    def create(self, validated_data):
        fields_data = validated_data.pop("fields", [])
        validated_data['created_by'] = _actor(self.context.get("request"))
        validated_data['canvas_course_name'] = _resolve_canvas_course_name(
            validated_data.get("canvas_course_id"),
            validated_data.get("canvas_course_name", ""),
        )
        form = Form.objects.create(**validated_data)
        for i, field_data in enumerate(fields_data):
            field_data.setdefault("order", i)
            FormField.objects.create(form=form, **field_data)
        return form

    def update(self, instance, validated_data):
        # created_by stays as-is on update — don't rewrite ownership
        fields_data = validated_data.pop("fields", None)
        validated_data['canvas_course_name'] = _resolve_canvas_course_name(
            validated_data.get("canvas_course_id", instance.canvas_course_id),
            validated_data.get("canvas_course_name", ""),
        )
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