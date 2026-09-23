from django.urls import path
from .views import NotificationListView, NotificationMarkReadView, NotificationMarkAllReadView

urlpatterns = [
    path("",              NotificationListView.as_view(),       name="notifications_list"),
    path("read-all/",     NotificationMarkAllReadView.as_view(), name="notifications_read_all"),
    path("<int:pk>/read/", NotificationMarkReadView.as_view(),  name="notification_read"),
]
