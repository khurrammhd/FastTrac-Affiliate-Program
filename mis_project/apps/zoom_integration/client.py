"""
Zoom Server-to-Server OAuth API client.

Uses the credentials in settings:
    ZOOM_ACCOUNT_ID, ZOOM_CLIENT_ID, ZOOM_CLIENT_SECRET, ZOOM_HOST_EMAIL

Set ZOOM_MOCK=True in .env to skip real API calls and return fake data.
"""
import time
import uuid
import logging
from base64 import b64encode

import requests
from django.conf import settings

logger = logging.getLogger(__name__)

_TOKEN_CACHE = {"access_token": None, "expires_at": 0}


def clear_token_cache():
    """Force re-fetch of the access token on the next API call."""
    _TOKEN_CACHE["access_token"] = None
    _TOKEN_CACHE["expires_at"] = 0


class ZoomAPIError(Exception):
    def __init__(self, message, status_code=None, data=None):
        super().__init__(message)
        self.status_code = status_code
        self.data = data


class ZoomAPIClient:
    BASE_URL = "https://api.zoom.us/v2"
    TOKEN_URL = "https://zoom.us/oauth/token"

    def __init__(self):
        self.account_id    = settings.ZOOM_ACCOUNT_ID
        self.client_id     = settings.ZOOM_CLIENT_ID
        self.client_secret = settings.ZOOM_CLIENT_SECRET
        self.host_email    = settings.ZOOM_HOST_EMAIL
        self._mock         = getattr(settings, "ZOOM_MOCK", False)

    # ── Mock helpers ─────────────────────────────────────────────────────

    def _mock_meeting_id(self):
        # 9-digit numeric string that looks like a Zoom meeting ID
        return str(uuid.uuid4().int)[:9]

    def _mock_registrant_id(self):
        return uuid.uuid4().hex[:16]

    # ── OAuth token ──────────────────────────────────────────────────────

    def _get_access_token(self):
        now = time.time()
        if _TOKEN_CACHE["access_token"] and now < _TOKEN_CACHE["expires_at"] - 30:
            return _TOKEN_CACHE["access_token"]

        credentials = b64encode(
            f"{self.client_id}:{self.client_secret}".encode()
        ).decode()

        resp = requests.post(
            self.TOKEN_URL,
            headers={"Authorization": f"Basic {credentials}"},
            params={
                "grant_type": "account_credentials",
                "account_id": self.account_id,
            },
            timeout=15,
        )
        resp.raise_for_status()
        data = resp.json()
        _TOKEN_CACHE["access_token"] = data["access_token"]
        _TOKEN_CACHE["expires_at"]   = now + int(data.get("expires_in", 3600))
        return _TOKEN_CACHE["access_token"]

    def _headers(self):
        return {
            "Authorization": f"Bearer {self._get_access_token()}",
            "Content-Type": "application/json",
        }

    def _request(self, method, path, **kwargs):
        url = f"{self.BASE_URL}{path}"
        resp = requests.request(method, url, headers=self._headers(), timeout=20, **kwargs)
        if resp.status_code == 204:
            return {}
        try:
            data = resp.json()
        except Exception:
            data = {}
        if not resp.ok:
            raise ZoomAPIError(
                data.get("message", f"Zoom API error {resp.status_code}"),
                status_code=resp.status_code,
                data=data,
            )
        return data

    # ── Meetings ─────────────────────────────────────────────────────────

    def create_meeting(self, topic, agenda="", duration_minutes=60, start_time=None):
        """
        Create a scheduled meeting (type 2) — compatible with free Zoom plan.
        Registration is NOT required; all participants share the same join URL.
        """
        if self._mock:
            mid = self._mock_meeting_id()
            logger.info("[ZOOM MOCK] create_meeting topic=%r id=%s", topic, mid)
            return {
                "id": mid,
                "topic": topic,
                "join_url": f"https://zoom.us/j/{mid}",
                "start_url": f"https://zoom.us/s/{mid}?zak=MOCK_ZAK",
                "duration": duration_minutes,
                "type": 2,
            }

        import datetime
        if not start_time:
            # Default: tomorrow at 09:00 UTC — host can reschedule in the Zoom dashboard.
            tomorrow = datetime.datetime.utcnow() + datetime.timedelta(days=1)
            start_time = tomorrow.strftime("%Y-%m-%dT09:00:00Z")

        payload = {
            "topic": topic,
            "agenda": agenda,
            "type": 2,                          # scheduled — works on free plan
            "start_time": start_time,
            "duration": duration_minutes,
            "settings": {
                "host_video": True,
                "participant_video": False,
                "waiting_room": False,
                "join_before_host": True,
            },
        }

        user_id = self.host_email if self.host_email else "me"
        return self._request("POST", f"/users/{user_id}/meetings", json=payload)

    def delete_meeting(self, meeting_id):
        if self._mock:
            logger.info("[ZOOM MOCK] delete_meeting id=%s", meeting_id)
            return {}
        return self._request("DELETE", f"/meetings/{meeting_id}")

    def get_meeting(self, meeting_id):
        if self._mock:
            logger.info("[ZOOM MOCK] get_meeting id=%s", meeting_id)
            return {
                "id": meeting_id,
                "topic": "Mock Meeting",
                "join_url": f"https://zoom.us/j/{meeting_id}",
                "start_url": f"https://zoom.us/s/{meeting_id}?zak=MOCK_ZAK",
                "type": 3,
            }
        return self._request("GET", f"/meetings/{meeting_id}")

    # ── Registrants ──────────────────────────────────────────────────────

    def add_registrant(self, meeting_id, email, first_name, last_name=""):
        if self._mock:
            rid = self._mock_registrant_id()
            logger.info("[ZOOM MOCK] add_registrant meeting=%s email=%s id=%s", meeting_id, email, rid)
            return {
                "registrant_id": rid,
                "join_url": f"https://zoom.us/w/{meeting_id}?tk=MOCK_{rid}",
                "topic": "Mock Meeting",
            }
        payload = {
            "email": email,
            "first_name": first_name or "Participant",
            "last_name": last_name,
        }
        return self._request("POST", f"/meetings/{meeting_id}/registrants", json=payload)

    def remove_registrant(self, meeting_id, registrant_id):
        """Cancel (remove) a single registrant."""
        if self._mock:
            logger.info("[ZOOM MOCK] remove_registrant meeting=%s registrant=%s", meeting_id, registrant_id)
            return {}
        payload = {"registrants": [{"id": registrant_id}]}
        return self._request("PUT", f"/meetings/{meeting_id}/registrants/status",
                             json={"action": "cancel", **payload})

    def list_registrants(self, meeting_id, status="approved"):
        if self._mock:
            logger.info("[ZOOM MOCK] list_registrants meeting=%s status=%s", meeting_id, status)
            return []
        params = {"status": status, "page_size": 300}
        results = []
        next_token = None
        while True:
            if next_token:
                params["next_page_token"] = next_token
            data = self._request("GET", f"/meetings/{meeting_id}/registrants", params=params)
            results.extend(data.get("registrants", []))
            next_token = data.get("next_page_token")
            if not next_token:
                break
        return results
