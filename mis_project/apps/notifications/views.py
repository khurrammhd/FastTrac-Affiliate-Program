from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import permissions

from .models import Notification
from .serializers import NotificationSerializer


class NotificationListView(APIView):
    """GET /api/notifications/ — returns the 50 most recent notifications for the logged-in user."""
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        qs = Notification.objects.filter(recipient=request.user).select_related("submission")[:50]
        unread_count = Notification.objects.filter(recipient=request.user, is_read=False).count()
        return Response({
            "results": NotificationSerializer(qs, many=True).data,
            "unread_count": unread_count,
        })


class NotificationMarkReadView(APIView):
    """POST /api/notifications/<pk>/read/ — marks a single notification as read."""
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, pk):
        Notification.objects.filter(recipient=request.user, pk=pk).update(is_read=True)
        return Response({"status": "ok"})


class NotificationMarkAllReadView(APIView):
    """POST /api/notifications/read-all/ — marks all notifications as read."""
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        Notification.objects.filter(recipient=request.user, is_read=False).update(is_read=True)
        return Response({"status": "ok"})
