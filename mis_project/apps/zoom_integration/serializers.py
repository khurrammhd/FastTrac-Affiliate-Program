from rest_framework import serializers
from .models import ZoomMeeting, ZoomRegistrant


class ZoomMeetingSerializer(serializers.ModelSerializer):
    class Meta:
        model = ZoomMeeting
        fields = [
            "id", "form", "zoom_meeting_id", "topic",
            "join_url", "start_url", "schedule_days", "created_at", "updated_at",
        ]
        read_only_fields = ["id", "zoom_meeting_id", "join_url", "start_url", "created_at", "updated_at"]


class ZoomRegistrantSerializer(serializers.ModelSerializer):
    class Meta:
        model = ZoomRegistrant
        fields = [
            "id", "submission", "zoom_meeting", "registrant_id",
            "join_url", "status", "error_message", "registered_at", "updated_at",
        ]
        read_only_fields = fields
