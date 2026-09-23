from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import permissions
from .client import CanvasAPIClient


class CanvasCourseListView(APIView):
    """
    Returns Canvas courses so the admin can link a form to a course
    when building it in the form builder.
    """
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        try:
            client = CanvasAPIClient()
            courses = client.list_courses()
            data = [
                {"id": str(c["id"]), "name": c.get("name", ""), "course_code": c.get("course_code", "")}
                for c in courses
            ]
            return Response(data)
        except Exception as exc:
            return Response({"error": str(exc)}, status=502)


class CanvasUserSearchView(APIView):
    """Search Canvas users by name or email."""
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        query = request.query_params.get("q", "")
        if not query:
            return Response([])
        try:
            client = CanvasAPIClient()
            users = client.list_users(search_term=query)
            return Response(users)
        except Exception as exc:
            return Response({"error": str(exc)}, status=502)
