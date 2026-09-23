from django.conf import settings
from rest_framework import serializers
from .models import Submission, SubmissionNote
from .captcha import verify_recaptcha_token


class SubmissionNoteSerializer(serializers.ModelSerializer):
    author_name = serializers.SerializerMethodField()

    class Meta:
        model = SubmissionNote
        fields = ["id", "author", "author_name", "body", "created_at"]
        read_only_fields = ["id", "author", "created_at"]

    def get_author_name(self, obj):
        return obj.author.get_full_name() if obj.author else None


class SubmissionSerializer(serializers.ModelSerializer):
    notes = SubmissionNoteSerializer(many=True, read_only=True)
    reviewed_by_name = serializers.SerializerMethodField()
    form_title = serializers.SerializerMethodField()
    canvas_course_name = serializers.SerializerMethodField()
    submitter_name = serializers.SerializerMethodField()
    submitter_email = serializers.SerializerMethodField()
    field_labels = serializers.SerializerMethodField()

    class Meta:
        model = Submission
        fields = [
            "id", "form", "form_title", "canvas_course_name", "data", "status",
            "submitter_email", "submitter_name",
            "reviewed_by", "reviewed_by_name", "reviewed_at", "rejection_reason",
            "canvas_user_id", "canvas_enrollment_id", "canvas_sync_error", "canvas_synced_at",
            "canvas_user_precreated",
            "submitted_at", "updated_at",
            "field_labels",
            "notes",
        ]
        read_only_fields = [
            "id", "status", "reviewed_by", "reviewed_at",
            "canvas_user_id", "canvas_enrollment_id", "canvas_sync_error",
            "canvas_synced_at", "canvas_user_precreated", "submitted_at", "updated_at",
        ]

    def get_reviewed_by_name(self, obj):
        return obj.reviewed_by.get_full_name() if obj.reviewed_by else None

    def get_form_title(self, obj):
        return obj.form.title

    def get_canvas_course_name(self, obj):
        return obj.form.canvas_course_name or None

    def _resolve_from_data(self, obj, mapping_key, fallback_field_type=None, fallback_label_kw=None):
        """Return the stored value or derive it from the submission's data dict."""
        stored = getattr(obj, mapping_key, "")
        if stored:
            return stored
        raw_data = obj.data or {}
        for field in obj.form.fields.all():
            val = raw_data.get(str(field.id)) or raw_data.get(field.id, "")
            val = str(val).strip() if val else ""
            if not val:
                continue
            if field.canvas_field_mapping == mapping_key.replace("submitter_", ""):
                return val
            if fallback_field_type and field.field_type == fallback_field_type:
                return val
            if fallback_label_kw and fallback_label_kw.lower() in field.label.lower():
                return val
        return ""

    def get_submitter_name(self, obj):
        return self._resolve_from_data(obj, "submitter_name", fallback_label_kw="name")

    def get_submitter_email(self, obj):
        return self._resolve_from_data(obj, "submitter_email", fallback_field_type="email", fallback_label_kw="email")

    def get_field_labels(self, obj):
        # Frontend stores values keyed by field id; return a map so UI can show labels.
        return {str(field.id): field.label for field in obj.form.fields.all()}


class PublicSubmissionCreateSerializer(serializers.ModelSerializer):
    """Used by anonymous public users to submit a form."""
    captcha_token = serializers.CharField(write_only=True, required=False, allow_blank=True)

    class Meta:
        model = Submission
        fields = ["form", "data", "submitter_email", "submitter_name", "captcha_token"]

    def validate(self, attrs):
        form = attrs.get("form")
        if form.status != "published":
            raise serializers.ValidationError("This form is not accepting submissions.")

        captcha_enabled = bool(
            getattr(form, "enable_captcha", False)
            and settings.RECAPTCHA_SITE_KEY
            and settings.RECAPTCHA_SECRET_KEY
        )
        if captcha_enabled:
            token = attrs.get("captcha_token", "").strip()
            if not token:
                raise serializers.ValidationError({"captcha_token": "Captcha verification is required."})

            request = self.context.get("request")
            remote_ip = request.META.get("REMOTE_ADDR") if request else None
            verified, message = verify_recaptcha_token(token, remote_ip=remote_ip)
            if not verified:
                raise serializers.ValidationError({"captcha_token": message})
        return attrs

    def create(self, validated_data):
        validated_data.pop("captcha_token", None)
        instance = super().create(validated_data)
        # Auto-populate submitter contact from form field data when not provided explicitly.
        if not instance.submitter_email or not instance.submitter_name:
            raw_data = instance.data or {}
            update_fields = []
            for field in instance.form.fields.all():
                val = raw_data.get(str(field.id)) or raw_data.get(field.id, "")
                val = str(val).strip() if val else ""
                if not val:
                    continue
                if not instance.submitter_email:
                    if field.canvas_field_mapping == "email" or field.field_type == "email":
                        instance.submitter_email = val
                        update_fields.append("submitter_email")
                if not instance.submitter_name:
                    if field.canvas_field_mapping == "name" or "name" in field.label.lower():
                        instance.submitter_name = val
                        update_fields.append("submitter_name")
            if update_fields:
                instance.save(update_fields=update_fields)
        return instance


class SubmissionApproveSerializer(serializers.Serializer):
    """Payload for approving a submission."""
    note = serializers.CharField(required=False, allow_blank=True)
    existing_canvas_user_id = serializers.CharField(required=False, allow_blank=False)


class SubmissionRejectSerializer(serializers.Serializer):
    """Payload for rejecting a submission."""
    reason = serializers.CharField(required=True)
