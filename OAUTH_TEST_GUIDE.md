# Canvas OAuth2 Testing Guide

This guide walks you through testing the complete Canvas OAuth2 authentication flow for the FastTrac MIS application.

---

## Prerequisites

✅ **Already Configured:**
- Canvas OAuth app registered (Client ID: `197770000000000204`)
- Client Secret configured in `.env`
- API Token configured for server-to-server Canvas calls
- Backend endpoint: `/api/auth/canvas/callback/`
- Frontend redirect: `https://widely-console-feminize.ngrok-free.dev/auth/canvas/callback`

---

## Environment Setup

### 1. Backend (.env in `/mis_project/`)

```env
CANVAS_BASE_URL=https://fasttrac.test.instructure.com
CANVAS_API_TOKEN=8NCNZQvWxUkMM2tRnJGCPmWDvDfR2QxPZvkzC6nt3LvvAQBG3KveWyzDakmBGXGh
CANVAS_CLIENT_ID=197770000000000204
CANVAS_CLIENT_SECRET=ukiQDL7aiTcflDCHpxAUbG5RM1wktiUV5cMT3AOcOdfo3YAxHmAkRd64Wymzq5wY
CANVAS_REDIRECT_URI=https://widely-console-feminize.ngrok-free.dev/api/auth/canvas/callback/
CORS_ALLOWED_ORIGINS=http://localhost:3000,https://widely-console-feminize.ngrok-free.dev
ALLOWED_HOSTS=localhost,127.0.0.1,widely-console-feminize.ngrok-free.dev
```

### 2. Frontend (.env in root `/`)

```env
GENERATE_SOURCEMAP=false
REACT_APP_API_URL=https://widely-console-feminize.ngrok-free.dev
# For local dev: http://localhost:8000
```

### 3. Start ngrok tunnel

If testing with ngrok:

```bash
ngrok http 8000
# Copy the forwarding URL: https://widely-console-feminize.ngrok-free.dev
```

Update `.env` with the correct ngrok URL before starting the backend.

---

## Step-by-Step Test Flow

### Step 1: Start Backend

```bash
cd mis_project
python -m venv venv
source venv/bin/activate  # or: venv\Scripts\activate (Windows)
pip install -r requirements.txt
python manage.py migrate
python manage.py runserver
```

**Expected:** Backend running at `http://localhost:8000` (or your ngrok URL)

---

### Step 2: Start Frontend

```bash
npm install
npm start
```

**Expected:** Frontend running at `http://localhost:3000` with ngrok proxying available at `https://widely-console-feminize.ngrok-free.dev`

---

### Step 3: Navigate to Login Page

1. Open: `https://widely-console-feminize.ngrok-free.dev/` (or `http://localhost:3000` locally)
2. You should see the **FastTrac MIS** login page
3. Click **"Sign in with Canvas"** button (blue button with cloud icon)

**Expected:** You're redirected to Canvas OAuth authorize page

---

### Step 4: Canvas OAuth Authorize

On the Canvas OAuth page:

1. You may be prompted to log in if not already logged in Canvas
2. Canvas shows app permissions ("sign in with your Canvas credentials")
3. Review the scope / permissions requested
4. Click **"Allow"** or **"Authorize"**

**Expected:** Canvas redirects to `https://widely-console-feminize.ngrok-free.dev/api/auth/canvas/callback/?code=...&state=...`

---

### Step 5: Backend Processes OAuth Callback

The backend endpoint (`/api/auth/canvas/callback/`) receives the authorization code and:

1. ✅ Exchanges the code for an access token
2. ✅ Fetches your Canvas user profile using the access token
3. ✅ Creates or updates your local user account
4. ✅ Stores Canvas OAuth tokens in the database
5. ✅ Returns JWT tokens (access + refresh)

**Monitor backend logs** for:
```
POST /api/auth/canvas/callback/?code=... HTTP/1.1
```

If successful, you should see:
```json
{
  "user": {
    "id": 1,
    "username": "npai@condado.com",
    "email": "npai@condado.com",
    "first_name": "Khurram",
    "last_name": "Paizar",
    "role": "admin",
    "canvas_user_id": "12345",
    "avatar_url": "https://..."
  },
  "tokens": {
    "access": "eyJ0eX...",
    "refresh": "eyJ0eX..."
  },
  "canvas": {
    "access_token": "Canvas OAuth token here",
    "canvas_user_id": "12345"
  }
}
```

---

### Step 6: Frontend Receives Tokens & Redirects

The React [CanvasCallback.js](src/views/CanvasCallback.js) component:

1. ✅ Calls `/api/auth/canvas/callback/?code=...` from the URL
2. ✅ Receives JWT tokens + user data
3. ✅ Stores tokens in localStorage via `handleCanvasCallback()`
4. ✅ Redirects to `/admin/dashboard`

**Expected:** You're now logged in as an admin and see the MIS dashboard.

---

### Step 7: Verify Login

Once logged in:

1. Navigate to `/admin/users/` or `/admin/mis-dashboard`
2. Click the profile icon in the top-right corner
3. Verify your name, email, and role are displayed
4. Check browser DevTools **Application** → **Local Storage**:
   - `access_token` (JWT)
   - `refresh_token` (JWT)
   - `canvas_token` (Canvas OAuth token)

**Expected:** All tokens present and user data matches Canvas profile.

---

## Troubleshooting

### Issue: "No authorization code received"

**Cause:** Canvas didn't redirect with a code.

**Fix:**
- Check Canvas OAuth app configuration
- Verify `CANVAS_REDIRECT_URI` matches exactly in Canvas Developer Keys
- Check ngrok tunnel is forwarding correctly

---

### Issue: "Canvas authentication failed"

**Cause:** Code exchange failed or invalid credentials.

**Check:**
- `CANVAS_CLIENT_ID` matches what's in Canvas
- `CANVAS_CLIENT_SECRET` is correct (copy-paste carefully)
- `CANVAS_BASE_URL` is correct and without trailing slashes

**Debug:**
Monitor backend logs:
```bash
# In another terminal, watch Django logs
tail -f /path/to/mis_project/logs/django.log
```

---

### Issue: "Cannot reach Canvas" / 502 error

**Cause:** Backend can't reach Canvas API.

**Check:**
- VPN/firewall isn't blocking `fasttrac.test.instructure.com`
- `CANVAS_API_TOKEN` is valid and not expired
- Network connectivity to Canvas

---

### Issue: "CORS error" in browser console

**Cause:** Frontend can't call backend API.

**Fix:**
- Verify `REACT_APP_API_URL` is correct in `.env`
- Verify `CORS_ALLOWED_ORIGINS` includes your frontend URL in Django `.env`
- Restart backend after changing CORS settings

---

## Next Steps After OAuth Works

Once OAuth login is successful:

### 1. Test Token Refresh
- Let an access token expire (default 8 hours)
- Make an API call
- Backend should automatically refresh the token silently
- Verify no re-login required

### 2. Test Form Submission Workflow
- Create a form as an admin
- Get the public form link (no auth required)
- Submit the form as a public user
- Log back in as admin
- Review and approve the submission

### 3. Test Canvas Enrollment Sync
- When approving a submission, trigger Canvas enrollment
- Verify the student is synced to Canvas course
- Check Canvas course for new enrollment

### 4. Test Different Roles
- In Django admin, change the test user's role from `admin` to `reviewer`
- Log out and log back in via OAuth
- Verify role-based UI changes (fewer permissions)

---

## API Reference

### Canvas OAuth Callback Endpoint

**Request:**
```
GET /api/auth/canvas/callback/?code=...&state=...
```

**Response (Success):**
```json
{
  "user": { /* User object from MeSerializer */ },
  "tokens": {
    "access": "JWT access token",
    "refresh": "JWT refresh token"
  },
  "canvas": {
    "access_token": "Canvas OAuth access token",
    "canvas_user_id": "Canvas user ID"
  }
}
```

**Response (Error):**
```json
{
  "error": "Error message describing what went wrong"
}
```

**Status Codes:**
- `200` — Success
- `400` — Bad request (missing code, Canvas error)
- `502` — Cannot reach Canvas or token exchange failed
- `500` — Server misconfiguration (missing env vars)

---

## Files Changed

- [mis_project/.env](mis_project/.env) — Canvas credentials
- [mis_project/apps/accounts/views.py](mis_project/apps/accounts/views.py) — CanvasOAuthCallbackView
- [mis_project/apps/accounts/urls.py](mis_project/apps/accounts/urls.py) — Added canvas/callback/ route
- [src/views/Login.js](src/views/Login.js) — Added Canvas OAuth button
- [src/context/AuthContext.js](src/context/AuthContext.js) — Added handleCanvasCallback method
- [src/views/CanvasCallback.js](src/views/CanvasCallback.js) — Already configured, no changes needed

---

## Quick Reference: Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/auth/canvas/callback/` | GET | OAuth callback (Canvas redirects here) |
| `/api/auth/login/` | POST | Direct Canvas API login (fallback) |
| `/api/auth/me/` | GET | Get current user profile |
| `/api/auth/token/refresh/` | POST | Refresh JWT tokens |
| `/api/canvas/courses/` | GET | List Canvas courses |
| `/api/canvas/users/` | GET | Search Canvas users |

---

## Security Notes

⚠️ **Before Production:**

1. **Remove hardcoded Canvas credentials** — Use environment variables only
2. **Use HTTPS everywhere** — OAuth tokens are sensitive
3. **Never log tokens** — Even in debug mode, be careful with token output
4. **Rotate Client Secret** — If accidentally exposed
5. **Set Django `DEBUG=False`** — Hides sensitive info in 500 errors
6. **Use strong `SECRET_KEY`** — Django secret key for JWT signing

---

## Need Help?

Check these files for configuration:

- [CLAUDE.md](CLAUDE.md) — Full project overview
- [.github/workflows/copilot-instructions.md](.github/workflows/copilot-instructions.md) — Workspace commands
- [mis_project/README.md](mis_project/README.md) — Backend setup
- [mis_project/config/settings.py](mis_project/config/settings.py) — Django config

---

**Last Updated:** April 2026 | **Version:** 1.0 | Canvas OAuth2
