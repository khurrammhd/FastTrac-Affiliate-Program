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

    class Meta:
        model = Submission
        fields = [
            "id", "form", "form_title", "data", "status",
            "submitter_email", "submitter_name",
            "reviewed_by", "reviewed_by_name", "reviewed_at", "rejection_reason",
            "canvas_user_id", "canvas_enrollment_id", "canvas_sync_error", "canvas_synced_at",
            "submitted_at", "updated_at",
            "notes",
        ]
        read_only_fields = [
            "id", "status", "reviewed_by", "reviewed_at",
            "canvas_user_id", "canvas_enrollment_id", "canvas_sync_error",
            "canvas_synced_at", "submitted_at", "updated_at",
        ]

    def get_reviewed_by_name(self, obj):
        return obj.reviewed_by.get_full_name() if obj.reviewed_by else None

    def get_form_title(self, obj):
        return obj.form.title


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
        return super().create(validated_data)


class SubmissionApproveSerializer(serializers.Serializer):
    """Payload for approving a submission."""
    note = serializers.CharField(required=False, allow_blank=True)


class SubmissionRejectSerializer(serializers.Serializer):
    """Payload for rejecting a submission."""
    reason = serializers.CharField(required=True)
