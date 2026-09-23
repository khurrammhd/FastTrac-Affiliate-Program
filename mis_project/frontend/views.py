# frontend/views.py
import os
from django.conf import settings
from django.http import HttpResponse, HttpResponseNotFound

INDEX_FILE = os.path.join(settings.BASE_DIR, "..", "build", "index.html")

def react_index(request):
    try:
        with open(INDEX_FILE, "rb") as f:
            response = HttpResponse(f.read(), content_type="text/html")
            response["Cache-Control"] = "no-cache, no-store, must-revalidate"
            response["Pragma"] = "no-cache"
            response["Expires"] = "0"
            return response
    except FileNotFoundError:
        return HttpResponseNotFound(
            "build/index.html not found — run `npm run build` first."
        )