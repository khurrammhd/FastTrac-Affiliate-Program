from django.urls import path
from .views import CanvasCourseListView, CanvasUserSearchView

urlpatterns = [
    path("courses/",  CanvasCourseListView.as_view(),  name="canvas_courses"),
    path("users/",    CanvasUserSearchView.as_view(),   name="canvas_users"),
]
