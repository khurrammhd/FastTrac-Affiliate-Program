import json
from urllib import error, parse, request

from django.conf import settings


def verify_recaptcha_token(token, remote_ip=None):
    if not settings.RECAPTCHA_SECRET_KEY:
        return True, ""

    payload = {
        "secret": settings.RECAPTCHA_SECRET_KEY,
        "response": token,
    }
    if remote_ip:
        payload["remoteip"] = remote_ip

    encoded = parse.urlencode(payload).encode("utf-8")
    req = request.Request(settings.RECAPTCHA_VERIFY_URL, data=encoded, method="POST")

    try:
        with request.urlopen(req, timeout=10) as response:
            body = json.loads(response.read().decode("utf-8"))
    except (error.URLError, TimeoutError, ValueError):
        return False, "Captcha verification failed. Please try again."

    if body.get("success"):
        return True, ""

    return False, "Captcha verification failed. Please try again."