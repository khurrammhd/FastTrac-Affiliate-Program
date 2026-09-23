from datetime import timedelta, datetime as _dt, timezone as _tz
import hashlib
import json

import requests
from django.conf import settings
from django.core.cache import cache
from django.http import HttpResponseNotModified
from django.utils import timezone
from django.utils.http import http_date
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import permissions
from .client import CanvasAPIClient


def _get_service_or_admin_client():
    """
    Returns (client, token_obj).
    Tries the configured service token first. If not set, falls back to the
    most recently updated admin/superadmin Canvas OAuth token in the database.
    """
    from apps.accounts.models import CanvasOAuthToken

    if getattr(settings, "CANVAS_API_TOKEN", None):
        return CanvasAPIClient(), None

    try:
        admin_token = (
            CanvasOAuthToken.objects
            .filter(user__role__in=["admin", "superadmin"])
            .select_related("user")
            .order_by("-updated_at")
            .first()
        )
        if admin_token and admin_token.access_token:
            if admin_token.is_expired and admin_token.refresh_token:
                refreshed = _maybe_refresh_canvas_token(admin_token)
                if refreshed:
                    return refreshed, admin_token
            return CanvasAPIClient(access_token=admin_token.access_token), admin_token
    except Exception:
        pass

    return CanvasAPIClient(), None


def _get_canvas_client_for_user(user):
    """
    Prefer per-user Canvas OAuth token when available; fallback to service token,
    then to any stored admin/superadmin OAuth token.
    """
    if not user or not user.is_authenticated:
        return _get_service_or_admin_client()
    token_obj = getattr(user, "canvas_token", None)
    if token_obj and token_obj.access_token:
        return CanvasAPIClient(access_token=token_obj.access_token), token_obj
    return _get_service_or_admin_client()


def _maybe_refresh_canvas_token(token_obj):
    if not token_obj or not token_obj.refresh_token:
        return None
    if not settings.CANVAS_CLIENT_ID or not settings.CANVAS_CLIENT_SECRET:
        return None

    refreshed = CanvasAPIClient.refresh_access_token(token_obj.refresh_token)
    new_access = refreshed.get("access_token")
    if not new_access:
        return None

    expires_in = refreshed.get("expires_in")
    token_obj.access_token = new_access
    token_obj.refresh_token = refreshed.get("refresh_token") or token_obj.refresh_token
    token_obj.expires_at = (
        timezone.now() + timedelta(seconds=int(expires_in))
        if expires_in
        else token_obj.expires_at
    )
    token_obj.save(update_fields=["access_token", "refresh_token", "expires_at", "updated_at"])
    return CanvasAPIClient(access_token=token_obj.access_token)


def _parse_canvas_date(date_str):
    """Parse a Canvas ISO-8601 date string (with or without Z) into an aware datetime."""
    if not date_str:
        return None
    try:
        normalized = date_str.replace("Z", "+00:00")
        dt = _dt.fromisoformat(normalized)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=_tz.utc)
        return dt
    except (ValueError, TypeError):
        return None


def _is_course_ended(course):
    """
    Returns True if the course end date (or its term end date) has already passed.
    Canvas courses with a past end date reject new enrollments even when 'available'.
    """
    now = _dt.now(_tz.utc)

    # Course-level end date takes priority when set.
    end_dt = _parse_canvas_date(course.get("end_at"))
    if end_dt and end_dt < now:
        return True

    # Fall back to term end date (included via include[]=term).
    term = course.get("term") or {}
    term_end_dt = _parse_canvas_date(term.get("end_at"))
    if term_end_dt and term_end_dt < now:
        return True

    return False


def _serialize_courses(courses):
    data = []
    for course in courses:
        course_id = course.get("id")
        if course_id in (None, ""):
            continue
        if _is_course_ended(course):
            continue
        data.append(
            {
                "id": str(course_id),
                "name": course.get("name", "") or course.get("course_code", "Untitled course"),
                "course_code": course.get("course_code", ""),
            }
        )
    data.sort(key=lambda c: (c["name"] or "").lower())
    return data


def _fetch_courses_with_client(client):
    return _serialize_courses(client.list_courses())


def _courses_cache_headers(courses):
    payload = json.dumps(courses, sort_keys=True, separators=(",", ":")).encode("utf-8")
    digest = hashlib.sha256(payload).hexdigest()
    etag = f'W/"{digest}"'

    last_mod_key = f"canvas_courses:last_modified:{digest}"
    last_modified = cache.get(last_mod_key)
    if not last_modified:
        last_modified = http_date()
        cache.set(last_mod_key, last_modified, 60 * 60 * 24 * 30)

    return etag, last_modified


def _is_not_modified(request, etag, last_modified):
    request_etag = request.headers.get("If-None-Match", "")
    request_last_modified = request.headers.get("If-Modified-Since", "")
    if request_etag and etag in [v.strip() for v in request_etag.split(",")]:
        return True
    if request_last_modified and request_last_modified == last_modified:
        return True
    return False


class CanvasCourseListView(APIView):
    """
    Returns Canvas courses so the admin can link a form to a course
    when building it in the form builder.
    """
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        data = None
        token_obj = None
        try:
            client, token_obj = _get_canvas_client_for_user(request.user)

            if token_obj and token_obj.is_expired:
                refreshed_client = _maybe_refresh_canvas_token(token_obj)
                if refreshed_client:
                    client = refreshed_client

            data = _fetch_courses_with_client(client)
        except requests.HTTPError as exc:
            if exc.response is not None and exc.response.status_code == 401 and token_obj:
                try:
                    refreshed_client = _maybe_refresh_canvas_token(token_obj)
                    if refreshed_client:
                        data = _fetch_courses_with_client(refreshed_client)
                        exc = None
                except requests.HTTPError:
                    pass

            # If user token auth fails, try the configured server token before failing.
            if data is None and settings.CANVAS_API_TOKEN:
                try:
                    data = _fetch_courses_with_client(CanvasAPIClient())
                    exc = None
                except requests.HTTPError:
                    pass

            if data is None and exc.response is not None and exc.response.status_code == 401:
                return Response(
                    {
                        "error": "Canvas authorization failed. Please reconnect Canvas login or update CANVAS_API_TOKEN with course-list permission."
                    },
                    status=401,
                )
            if data is None:
                return Response({"error": str(exc)}, status=502)
        except Exception as exc:
            return Response({"error": str(exc)}, status=502)

        etag, last_modified = _courses_cache_headers(data)
        if _is_not_modified(request, etag, last_modified):
            response = HttpResponseNotModified()
            response["ETag"] = etag
            response["Last-Modified"] = last_modified
            return response

        response = Response(data)
        response["ETag"] = etag
        response["Last-Modified"] = last_modified
        return response


class CanvasUserSearchView(APIView):
    """Search Canvas users by name or email."""
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        query = request.query_params.get("q", "")
        if not query:
            return Response([])
        token_obj = None
        try:
            client, token_obj = _get_canvas_client_for_user(request.user)

            if token_obj and token_obj.is_expired:
                refreshed_client = _maybe_refresh_canvas_token(token_obj)
                if refreshed_client:
                    client = refreshed_client

            users = client.list_users(search_term=query)
            return Response(users)
        except requests.HTTPError as exc:
            if exc.response is not None and exc.response.status_code == 401:
                return Response(
                    {
                        "error": "Canvas authorization failed. Please reconnect Canvas login or update CANVAS_API_TOKEN permissions."
                    },
                    status=401,
                )
            return Response({"error": str(exc)}, status=502)
        except Exception as exc:
            return Response({"error": str(exc)}, status=502)
