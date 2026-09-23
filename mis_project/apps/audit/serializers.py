from rest_framework import serializers
from .models import AuditLog


class AuditLogSerializer(serializers.ModelSerializer):
    actor_name = serializers.SerializerMethodField()
    action_label = serializers.SerializerMethodField()

    class Meta:
        model = AuditLog
        fields = [
            "id", "action", "action_label", "actor", "actor_name",
            "target_type", "target_id", "target_repr",
            "detail", "ip_address", "created_at",
        ]

    def get_actor_name(self, obj):
        return obj.actor.get_full_name() or obj.actor.username if obj.actor else "System"

    def get_action_label(self, obj):
        return obj.get_action_display()
