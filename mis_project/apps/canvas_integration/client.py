import requests
from django.conf import settings


class CanvasAPIClient:
    """
    Thin wrapper around the Canvas LMS REST API.
    Uses the server-side API token from settings for admin-level operations
    (creating users, enrolling them in courses, etc.)
    """

    def __init__(self):
        self.base_url = settings.CANVAS_BASE_URL.rstrip("/")
        self.headers = {
            "Authorization": f"Bearer {settings.CANVAS_API_TOKEN}",
            "Content-Type": "application/json",
        }

    def _url(self, path):
        return f"{self.base_url}/api/v1{path}"

    def _get(self, path, params=None):
        resp = requests.get(self._url(path), headers=self.headers, params=params, timeout=15)
        resp.raise_for_status()
        return resp.json()

    def _post(self, path, data):
        resp = requests.post(self._url(path), headers=self.headers, json=data, timeout=15)
        resp.raise_for_status()
        return resp.json()

    def _put(self, path, data):
        resp = requests.put(self._url(path), headers=self.headers, json=data, timeout=15)
        resp.raise_for_status()
        return resp.json()

    # ── Users ────────────────────────────────────────────────────────────

    def create_user(self, name, email, login_id=None):
        """
        Creates a Canvas user account.
        login_id defaults to the email address if not provided.
        """
        payload = {
            "user": {
                "name": name,
                "skip_registration": True,
            },
            "pseudonym": {
                "unique_id": login_id or email,
                "send_confirmation": False,
            },
            "communication_channel": {
                "type": "email",
                "address": email,
                "skip_confirmation": True,
            },
        }
        return self._post("/accounts/self/users", payload)

    def get_user(self, canvas_user_id):
        return self._get(f"/users/{canvas_user_id}/profile")

    def list_users(self, search_term=None):
        params = {"search_term": search_term} if search_term else {}
        return self._get("/accounts/self/users", params=params)

    # ── Courses ──────────────────────────────────────────────────────────

    def list_courses(self):
        return self._get("/courses")

    def get_course(self, course_id):
        return self._get(f"/courses/{course_id}")

    # ── Enrollments ──────────────────────────────────────────────────────

    def enroll_user(self, course_id, canvas_user_id, role="StudentEnrollment"):
        """Enrolls an existing Canvas user into a course."""
        payload = {
            "enrollment": {
                "user_id": canvas_user_id,
                "type": role,
                "enrollment_state": "active",
                "notify": True,
            }
        }
        return self._post(f"/courses/{course_id}/enrollments", payload)

    def list_enrollments(self, course_id):
        return self._get(f"/courses/{course_id}/enrollments")
