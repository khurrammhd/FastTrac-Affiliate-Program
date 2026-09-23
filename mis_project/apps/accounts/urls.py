from django.urls import path
from rest_framework_simplejwt.views import TokenRefreshView
from .views import MeView, LocalLoginView, CanvasLoginView, CanvasOAuthCallbackView, UserListCreateView, UserDetailView, UserRoleUpdateView

urlpatterns = [
    path("local-login/",                LocalLoginView.as_view(),               name="local_login"),
    path("login/",                      CanvasLoginView.as_view(),              name="canvas_login"),
    path("canvas/callback/",            CanvasOAuthCallbackView.as_view(),      name="canvas_oauth_callback"),
    path("token/refresh/",              TokenRefreshView.as_view(),             name="token_refresh"),
    path("me/",                         MeView.as_view(),                       name="me"),
    path("users/",                      UserListCreateView.as_view(),           name="user_list"),
    path("users/<int:pk>/",             UserDetailView.as_view(),               name="user_detail"),
    path("users/<int:pk>/role/",        UserRoleUpdateView.as_view(),           name="user_role"),
]
