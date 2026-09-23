# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This App Is

A full-stack **Form Builder + Submission Management System** with Canvas LMS integration. Staff create forms, the public submits them, reviewers approve/reject submissions, and approved submissions are synced to Canvas LMS.

**Stack:** React 16.8+ (frontend) + Django 4.2 + DRF (backend, in `/mis_project/`) + PostgreSQL + Celery/Redis.

## Frontend Commands

```bash
npm start               # Dev server (localhost:3000)
npm run build           # Production build (CI=false to ignore warnings)
npm test                # Run tests (CRA/Jest)
npm run compile:scss    # Compile SCSS → CSS
npm run build:scss      # Compile + minify SCSS
npm run install:clean   # Full clean reinstall + start
```

## Frontend Architecture

**Entry:** `src/index.js` — wraps the app in three Context providers, then renders routes.

**Routing:** React Router v5. Two top-level areas:
- Public: `/login`, `/auth/canvas/callback`, `/f/:token` (public form submission)
- Protected: `/admin/*` — rendered by `src/layouts/Admin.js` (Sidebar + Navbar + Footer wrapper). Route definitions live in `src/routes.js`.

**State Management:** React Context API — no Redux. Three providers:
- `AuthContext` — user, JWT tokens, role helpers (`isAdmin`, `isSuperAdmin`, `isReviewer`, `hasPermission()`), auto-refresh on 401
- `FormsContext` — forms list, CRUD, publish/close
- `SubmissionsContext` — submissions list/detail, approve/reject/notes

**API Layer:** `src/api/client.js` — Axios instance that auto-attaches JWT Bearer token and refreshes on 401. Individual modules: `auth.js`, `forms.js`, `submissions.js`, `canvas.js`. Base URL from `REACT_APP_API_URL` env var (defaults to `http://localhost:8000`).

**Absolute imports** are configured via `jsconfig.json` — use `import X from "context/AuthContext"` not relative paths.

## Key Views

| File | Route | Purpose |
|------|-------|---------|
| `src/views/FormBuilder.js` | `/admin/forms/new`, `/admin/forms/:id/edit` | Drag-and-drop form editor (react-beautiful-dnd) with 10 field types |
| `src/views/SubmissionDetail.js` | `/admin/submissions/:id` | Approve/reject with notes, trigger Canvas sync |
| `src/views/PublicForm.js` | `/f/:token` | Public-facing form submission (no auth) |
| `src/views/CanvasCallback.js` | `/auth/canvas/callback` | Canvas OAuth2 callback handler |

## Auth & RBAC

Roles (ascending): `viewer/staff` → `reviewer` → `admin` → `superadmin`. Tokens stored in localStorage. `useAuth()` hook exposes role booleans and `hasPermission(perm)`. On 401 the Axios interceptor auto-refreshes; on refresh failure it clears storage and redirects to `/login`.

## Backend (mis_project/)

Django project lives in `/mis_project/`. Apps: `accounts`, `forms_builder`, `submissions`, `canvas_integration`. Celery handles async Canvas sync tasks. Copy `/mis_project/.env.example` to `.env` and fill in DB, Redis, and Canvas credentials before running the backend.

## Environment Variables

Frontend (`.env` in project root):
- `REACT_APP_API_URL` — backend base URL (default: `http://localhost:8000`)
- `GENERATE_SOURCEMAP=false` — already set, reduces build size

## Notifications

Use the `useNotification()` hook (`src/hooks/useNotification.js`) to show toast alerts — do not call `react-notification-alert` directly from views.
