# MIS — Management Information System

Django + React MIS with Form Builder, Submission Approval Workflow, and Canvas LMS Integration.

---

## Stack

| Layer | Tech |
|---|---|
| Backend | Django 4.2, Django REST Framework |
| Auth | JWT (SimpleJWT) + Canvas OAuth 2.0 |
| Task Queue | Celery + Redis |
| Database | PostgreSQL |
| Canvas | Canvas LMS REST API |

---

## Project Structure

```
mis_project/
├── config/
│   ├── settings.py       # All settings, env-driven
│   ├── urls.py           # Root URL config
│   ├── celery.py         # Celery app
│   └── wsgi.py
├── apps/
│   ├── accounts/         # Users, Canvas OAuth SSO
│   ├── forms_builder/    # Form schema + field definitions
│   ├── submissions/      # Public submissions + approval queue
│   └── canvas_integration/ # Canvas API client + Celery tasks
├── manage.py
├── requirements.txt
└── .env.example
```

---

## Setup

### 1. Clone and create virtualenv

```bash
python -m venv venv
source venv/bin/activate   # Windows: venv\Scripts\activate
pip install -r requirements.txt
```

### 2. Configure environment

```bash
cp .env.example .env
# Edit .env with your DB, Redis, and Canvas credentials
```

### 3. Database

```bash
createdb mis_db
python manage.py migrate
python manage.py createsuperuser
```

### 4. Run Django

```bash
python manage.py runserver
```

### 5. Run Celery worker (separate terminal)

```bash
celery -A config worker -l info
```

---

## API Endpoints

| Method | URL | Description | Auth |
|---|---|---|---|
| POST | `/api/auth/login/` | Local JWT login | Public |
| GET | `/api/auth/canvas/` | Get Canvas OAuth URL | Public |
| GET | `/api/auth/canvas/callback/` | Canvas OAuth callback | Public |
| GET | `/api/auth/me/` | Current user profile | JWT |
| GET/POST | `/api/forms/` | List / create forms | JWT |
| GET/PUT/DELETE | `/api/forms/{id}/` | Form detail | JWT |
| POST | `/api/forms/{id}/publish/` | Publish a form | JWT |
| POST | `/api/forms/{id}/close/` | Close a form | JWT |
| GET | `/f/{token}/` | Public form by token | Public |
| POST | `/api/submissions/submit/` | Submit a form | Public |
| GET | `/api/submissions/` | List all submissions | JWT |
| POST | `/api/submissions/{id}/approve/` | Approve submission | JWT |
| POST | `/api/submissions/{id}/reject/` | Reject submission | JWT |
| GET | `/api/canvas/courses/` | List Canvas courses | JWT |
| GET | `/api/docs/` | Swagger UI | Public |

---

## Canvas OAuth Flow

1. Frontend calls `GET /api/auth/canvas/` → receives `auth_url`
2. Frontend redirects the user to `auth_url` (Canvas login page)
3. Canvas redirects back to `/api/auth/canvas/callback/?code=...`
4. Backend exchanges the code, fetches the Canvas user profile
5. Backend creates/updates the local `User` and `CanvasOAuthToken`
6. Backend returns `{ user, tokens: { access, refresh } }`
7. Frontend stores the JWT and uses it for all subsequent requests

---

## Submission → Canvas Sync Flow

1. Public user fills out form at `/f/{token}/`
2. POST to `/api/submissions/submit/` — status: `pending`
3. Admin reviews in the approval queue
4. POST to `/api/submissions/{id}/approve/` — status: `approved`
5. Celery task `sync_submission_to_canvas` fires asynchronously
6. Canvas user created → optionally enrolled in linked course
7. Submission status updated to `synced` (or `failed` with error detail)
