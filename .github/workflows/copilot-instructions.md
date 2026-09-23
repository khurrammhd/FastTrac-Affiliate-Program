# Copilot Instructions — Form Builder + Canvas LMS Integration

**Workspace:** Full-stack React + Django system for form creation, submission review, and Canvas LMS sync.  
**Primary Reference:** See [CLAUDE.md](../../CLAUDE.md) for detailed frontend architecture, state management, and key views.

---

## Quick Start

### Frontend Development
```bash
npm install              # Install dependencies (root directory)
npm start                # Dev server (localhost:3000, connects to http://localhost:8000)
npm run build            # Production build
npm run compile:scss     # Regenerate CSS from SCSS
```

### Backend Development (Django)
```bash
cd mis_project
python -m venv venv                  # Create virtual environment
source venv/bin/activate             # Or: venv\Scripts\activate (Windows)
pip install -r requirements.txt      # Install backend dependencies
cp .env.example .env                 # Configure: DB, Redis, Canvas credentials
python manage.py migrate             # Apply database migrations
python manage.py runserver           # Dev server (localhost:8000)

# In separate terminal:
celery -A config worker -l info      # Start Celery worker for async Canvas tasks
```

---

## Architecture at a Glance

### Frontend (`/src`)
- **State:** Context API (no Redux) — `AuthContext`, `FormsContext`, `SubmissionsContext`
- **Routing:** React Router v5, split into public (login, form submission) + protected (`/admin/*`)
- **API:** Axios with JWT auto-inject and 401 refresh (`src/api/client.js`)
- **Components:** Light Bootstrap Dashboard UI with custom MIS components
- **Tools:** React Beautiful DnD (form builder), Chartist (charts)

### Backend (`/mis_project`)
- **Framework:** Django 4.2 + Django REST Framework
- **Apps:** `accounts` (auth/RBAC), `forms_builder` (schemas), `submissions` (workflow), `canvas_integration` (LMS sync)
- **Auth:** JWT tokens + Canvas OAuth 2.0 SSO
- **Queue:** Celery (async Canvas syncs) + Redis
- **DB:** PostgreSQL (via `settings.py`)

### Data Flow
1. **Form Creation:** Staff → FormBuilder.js → forms_builder app → `/api/forms/`
2. **Public Submission:** Public → PublicForm.js (no auth) → `/api/submissions/`
3. **Review:** Reviewer → SubmissionDetail.js → approve/reject → `/api/submissions/{id}/approve|reject/`
4. **Canvas Sync:** Approval → Celery task → canvas_integration → Canvas API

---

## Key Conventions

| Aspect | Convention | Example |
|--------|-----------|---------|
| **Imports** | Absolute (via jsconfig.json) | `import X from "context/AuthContext"` |
| **Styles** | SCSS → CSS via npm scripts | Edit `src/assets/scss/` → run `npm run compile:scss` |
| **Hooks** | Custom hooks in `src/hooks/` | `useAuth()`, `useNotification()`, `useCanvasCourses()` |
| **Forms** | React Beautiful DnD for validation | See FormBuilder.js for field schema, validators |
| **Roles** | RBAC via `hasPermission()` | `isAdmin`, `isSuperAdmin`, `isReviewer`, `viewer/staff` |
| **Notifications** | Toast via `useNotification()` hook | **Not** direct `react-notification-alert` calls |
| **API Errors** | 401 triggers auto-refresh; 401 again → logout | See `src/api/client.js` interceptors |

---

## Environment & Setup

**Frontend (`.env` in root):**
```
REACT_APP_API_URL=http://localhost:8000
GENERATE_SOURCEMAP=false
```

**Backend (`mis_project/.env`):**
```
DEBUG=True
DATABASE_URL=postgresql://user:password@localhost:5432/mis_db
REDIS_URL=redis://localhost:6379/0
CANVAS_CLIENT_ID=...
CANVAS_CLIENT_SECRET=...
CANVAS_BASE_URL=https://canvas.example.com
```

---

## Common Tasks for Agents

### Adding a Form Field Type
1. Update `forms_builder/models.py` field validation schema
2. Update frontend field component in `src/components/MIS/FormFields.js` (create if needed)
3. Add to FormBuilder.js drag-and-drop palette
4. Add backend serializer in `forms_builder/serializers.py`

### Implementing a New Review Workflow Step
1. Update `submissions/models.py` status choices
2. Add endpoint in `submissions/views.py` and `submissions/urls.py`
3. Create React component in `src/views/SubmissionDetail.js`
4. Add to `SubmissionsContext` (state + API calls)

### Debugging Canvas Integration
- Check Celery task logs: `celery -A config worker -l debug`
- Verify Canvas credentials in `.env`
- Test Canvas API directly: `python manage.py shell` → use `canvas_integration/client.py`
- See `canvas_integration/tasks.py` for sync logic

### Styling Updates
- Modify SCSS in `src/assets/scss/` (light-bootstrap-dashboard-react.scss or theme files)
- Run `npm run compile:scss` to generate CSS
- Do **not** edit CSS directly

---

## Pitfalls & Tips

⚠️ **Do not:**
- Call `react-notification-alert` directly; use `useNotification()` hook
- Edit CSS files directly; regenerate from SCSS
- Store sensitive data in localStorage (token refresh is automated)
- Assume roles without checking `hasPermission()` (RBAC is strict)

✅ **Do:**
- Use absolute imports from `jsconfig.json` configuration
- Handle 401 responses gracefully (interceptor auto-refreshes once)
- Test form field validators in both Django and React
- Check Celery logs when Canvas syncs fail silently

---

## File Highlights

| File | Purpose |
|------|---------|
| [CLAUDE.md](../../CLAUDE.md) | Frontend architecture, routing, state, API layer |
| [src/routes.js](../../src/routes.js) | Protected route definitions for `/admin/*` |
| [src/api/client.js](../../src/api/client.js) | Axios instance with JWT + 401 refresh |
| [src/context/*](../../src/context/) | AuthContext, FormsContext, SubmissionsContext |
| [mis_project/config/settings.py](../../mis_project/config/settings.py) | Django settings (env-driven) |
| [mis_project/apps/canvas_integration/tasks.py](../../mis_project/apps/canvas_integration/tasks.py) | Celery async Canvas sync tasks |

---

## Next Steps

For **detailed frontend docs**, see [CLAUDE.md](../../CLAUDE.md).  
For **backend setup** and Django app specifics, check [mis_project/README.md](../../mis_project/README.md).  
For **Canvas integration**, review `mis_project/apps/canvas_integration/client.py` and `tasks.py`.

---

**Last Updated:** April 2026 | **Edition:** 2.0 (Form Builder + Canvas LMS)