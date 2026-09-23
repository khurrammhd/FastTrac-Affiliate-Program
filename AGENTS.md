# AGENTS.md

This file helps coding agents be productive quickly in this repository.

## Project Scope

- Full-stack Form Builder + Submission Management app with Canvas LMS integration.
- Frontend: React (root workspace).
- Backend: Django/DRF under [mis_project/README.md](mis_project/README.md).

## Commands You Will Use Often

Frontend (repo root):

- `npm start` - run React dev server on port 3000
- `npm run build` - production build (`CI=false` in script)
- `npm test` - run Jest tests
- `npm run build:scss` - compile and minify SCSS assets

Backend (from `mis_project/`):

- `python -m venv venv` then activate env
- `pip install -r requirements.txt`
- `python manage.py migrate`
- `python manage.py runserver` (port 8000)
- `celery -A config worker -l info` (separate terminal when testing async jobs)

## Architecture Map

- Frontend entry: [src/index.js](src/index.js)
- Frontend routes: [src/routes.js](src/routes.js)
- Protected admin layout: [src/layouts/Admin.js](src/layouts/Admin.js)
- API client + token refresh: [src/api/client.js](src/api/client.js)
- State providers: [src/context/AuthContext.js](src/context/AuthContext.js), [src/context/FormsContext.js](src/context/FormsContext.js), [src/context/SubmissionsContext.js](src/context/SubmissionsContext.js)
- Backend settings: [mis_project/config/settings.py](mis_project/config/settings.py)
- Backend URL config: [mis_project/config/urls.py](mis_project/config/urls.py)

## Conventions To Follow

- Use absolute frontend imports from `src` (see [jsconfig.json](jsconfig.json)).
- Use `useNotification()` from [src/hooks/useNotification.js](src/hooks/useNotification.js) for toast UI notifications.
- Keep JWT/refresh behavior in sync with [src/api/client.js](src/api/client.js); do not bypass token handling.
- Preserve role-based access model (`viewer/staff`, `reviewer`, `admin`, `superadmin`) used by auth and submissions flows.
- Prefer small targeted changes; do not refactor unrelated areas.

## Known Pitfalls

- Route matching order matters in [src/routes.js](src/routes.js) for detail/new pages vs list pages.
- Frontend dev API calls depend on proxy behavior in [src/setupProxy.js](src/setupProxy.js).
- Public form endpoint behavior differs by `Accept` header (`HTML` page render vs JSON API response) in [mis_project/apps/forms_builder/views.py](mis_project/apps/forms_builder/views.py).
- Django admin is mounted at `/django-admin/`; `/admin/` is reserved for the React app shell.
- `collectstatic` copies assets into static roots; it does not rebuild frontend bundles.
- Canvas sync is asynchronous only when Redis/Celery worker is running.

## Documentation Index

- High-level project guidance: [CLAUDE.md](CLAUDE.md)
- Backend setup and endpoints: [mis_project/README.md](mis_project/README.md)
- Canvas OAuth testing: [OAUTH_TEST_GUIDE.md](OAUTH_TEST_GUIDE.md)
- User/role management behavior: [USER_MANAGEMENT_GUIDE.md](USER_MANAGEMENT_GUIDE.md)

## Agent Workflow Hint

- Before coding: inspect related context/provider/api files, then implement.
- After coding: run the smallest relevant validation commands.
- If backend + frontend are both touched, validate both sides and note any unrun checks.

## Validation Quick Picks

- Frontend UI/compile confidence: `npm run build`
- Frontend tests: `npm test -- --watchAll=false`
- Backend checks: `python manage.py check`
- Backend tests (targeted first): `python manage.py test <app_name>`