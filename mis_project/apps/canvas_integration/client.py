import requests
from django.conf import settings
import logging
import re


logger = logging.getLogger(__name__)


class CanvasAPIClient:
    """
    Thin wrapper around the Canvas LMS REST API.
    Uses the server-side API token from settings for admin-level operations
    (creating users, enrolling them in courses, etc.)
    """

    def __init__(self, access_token=None):
        self.base_url = settings.CANVAS_BASE_URL.rstrip("/")
        token = access_token or settings.CANVAS_API_TOKEN
        self.headers = {
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
        }
        self._cached_account_ids = None

    @staticmethod
    def refresh_access_token(refresh_token):
        """
        Exchanges a Canvas refresh token for a new access token.
        """
        token_url = f"{settings.CANVAS_BASE_URL.rstrip('/')}/login/oauth2/token"
        payload = {
            "grant_type": "refresh_token",
            "refresh_token": refresh_token,
            "client_id": settings.CANVAS_CLIENT_ID,
            "client_secret": settings.CANVAS_CLIENT_SECRET,
        }
        resp = requests.post(token_url, data=payload, timeout=15)
        resp.raise_for_status()
        return resp.json()

    def _url(self, path):
        return f"{self.base_url}/api/v1{path}"

    def _get(self, path, params=None):
        resp = requests.get(self._url(path), headers=self.headers, params=params, timeout=15)
        resp.raise_for_status()
        return resp.json()

    def _get_paginated(self, path, params=None, max_pages=50):
        """
        Fetches all pages from a Canvas list endpoint using Link headers.
        """
        url = self._url(path)
        next_params = params
        page_count = 0
        items = []

        while url and page_count < max_pages:
            resp = requests.get(url, headers=self.headers, params=next_params, timeout=15)
            resp.raise_for_status()
            payload = resp.json()
            if isinstance(payload, list):
                items.extend(payload)
            else:
                break

            page_count += 1
            next_params = None
            url = resp.links.get("next", {}).get("url")

        return items

    def _post(self, path, data):
        resp = requests.post(self._url(path), headers=self.headers, json=data, timeout=15)
        if not resp.ok:
            try:
                detail = resp.json()
            except Exception:
                detail = resp.text[:300]
            error = requests.HTTPError(
                f"{resp.status_code} {resp.reason} for url: {resp.url} — Canvas detail: {detail}",
                response=resp,
            )
            raise error
        return resp.json()

    def _put(self, path, data):
        resp = requests.put(self._url(path), headers=self.headers, json=data, timeout=15)
        if not resp.ok:
            try:
                detail = resp.json()
            except Exception:
                detail = resp.text[:300]
            error = requests.HTTPError(
                f"{resp.status_code} {resp.reason} for url: {resp.url} — Canvas detail: {detail}",
                response=resp,
            )
            raise error
        return resp.json()

    def _accounts_users_paths(self):
        """
        Returns candidate account-user endpoints in priority order.
        """
        account_ids = self._candidate_account_ids()
        paths = []
        for account_id in account_ids:
            paths.append(f"/accounts/{account_id}/users")
        paths.append("/accounts/self/users")
        return paths

    def _candidate_account_ids(self):
        if self._cached_account_ids is not None:
            return self._cached_account_ids

        candidate_ids = []

        configured = [
            getattr(settings, "CANVAS_ACCOUNT_ID", None),
            getattr(settings, "CANVAS_ROOT_ACCOUNT_ID", None),
        ]
        for account_id in configured:
            if account_id is None:
                continue
            account_str = str(account_id).strip()
            if account_str and account_str not in candidate_ids:
                candidate_ids.append(account_str)

        # Attempt account discovery; some Canvas tokens permit this even when /accounts/self is blocked.
        try:
            for account in self._get_paginated("/accounts", params={"per_page": 100}):
                account_id = str(account.get("id") or "").strip()
                if account_id and account_id not in candidate_ids:
                    candidate_ids.append(account_id)
        except requests.HTTPError:
            pass

        # Common Canvas root account id fallback.
        if "1" not in candidate_ids:
            candidate_ids.append("1")

        self._cached_account_ids = candidate_ids
        return candidate_ids

    # ── Users ────────────────────────────────────────────────────────────

    def create_user(self, name, email, login_id=None):
        """
        Creates a fully active Canvas user account (no registration email sent).
        Used only when an admin explicitly forces user creation.
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
        last_error = None
        for users_path in self._accounts_users_paths():
            try:
                return self._post(users_path, payload)
            except requests.HTTPError as exc:
                last_error = exc
                continue

        if last_error:
            raise last_error
        raise RuntimeError("Failed to create Canvas user.")

    def invite_user(self, name, email):
        """
        Creates an unregistered (pending) Canvas user and triggers a Canvas
        self-registration invitation email to the user.  The user clicks the
        link in that email to set their password and activate their account.

        This is the preferred path when the submitter has no existing Canvas
        account: we assign them to the course and Canvas handles onboarding.
        """
        payload = {
            "user": {
                "name": name,
                "skip_registration": False,
            },
            "pseudonym": {
                "unique_id": email,
                "send_confirmation": True,
            },
            "communication_channel": {
                "type": "email",
                "address": email,
                "skip_confirmation": False,
            },
        }
        last_error = None
        for users_path in self._accounts_users_paths():
            try:
                return self._post(users_path, payload)
            except requests.HTTPError as exc:
                last_error = exc
                continue

        if last_error:
            raise last_error
        raise RuntimeError("Failed to invite Canvas user.")

    def get_user(self, canvas_user_id):
        return self._get(f"/users/{canvas_user_id}/profile")

    def list_users(self, search_term=None):
        params = {"search_term": search_term} if search_term else {}

        # Prefer account-scoped lookup for admin/service tokens.
        for users_path in self._accounts_users_paths():
            try:
                return self._get_paginated(users_path, params=params)
            except requests.HTTPError:
                continue

        # Fallback: global users endpoint may be available for some token scopes.
        try:
            return self._get_paginated("/users", params=params)
        except requests.HTTPError as exc:
            logger.warning("Canvas list_users lookup unavailable for current token/scopes: %s", exc)
            return []

    def find_user_by_email(self, email):
        """
        Looks up an existing Canvas user by email/login id.
        Returns None if not found.
        """
        target = (email or "").strip().lower()
        if not target:
            return None

        candidates = self.list_users(search_term=target)
        for user in candidates:
            # Canvas may return either login_id or primary_email depending on scopes/settings.
            login_id = str(user.get("login_id") or "").strip().lower()
            primary_email = str(user.get("primary_email") or user.get("email") or "").strip().lower()
            if target and (login_id == target or primary_email == target):
                return user
        return None

    def ensure_user(self, name, email, login_id=None):
        """
        Returns an existing Canvas user by email or creates one if absent.
        """
        existing = self.find_user_by_email(email)
        if existing:
            return existing
        return self.create_user(name=name, email=email, login_id=login_id)

    @staticmethod
    def _normalize_name(value):
        normalized = re.sub(r"[^a-z0-9]+", " ", str(value or "").strip().lower())
        normalized = re.sub(r"\s+", " ", normalized).strip()
        return normalized

    @classmethod
    def _tokenize_name(cls, value):
        normalized = cls._normalize_name(value)
        if not normalized:
            return []
        return [token for token in normalized.split(" ") if token]

    @staticmethod
    def _email_local_tokens(email):
        """
        Extracts name-relevant tokens from an email address local part.

        Examples:
          juliesamuellamberd@gmail.com  → ({"juliesamuellamberd"}, "juliesamuellamberd")
          j.samuel-lamberd@kauffman.org → ({"j","samuel","lamberd","samuellamberd",
                                            "jsamuellamberd"}, "j.samuel-lamberd")
          jsamuellamberd@kauffman.org   → ({"jsamuellamberd"}, "jsamuellamberd")

        Returns (set_of_tokens, raw_local_string).
        """
        if not email:
            return set(), ""
        raw_local = email.strip().lower().split("@")[0]
        # Strip to alphanumeric + separators only
        local = re.sub(r"[^a-z0-9._+\-]", "", raw_local)
        # Split on common email separators
        parts = [p for p in re.split(r"[._+\-]+", local) if len(p) >= 2]
        tokens = set(parts)
        tokens.add(local.replace(".", "").replace("-", "").replace("_", "").replace("+", ""))
        tokens.add(local)
        if len(parts) > 1:
            tokens.add("".join(parts))
        return tokens, local.replace(".", "").replace("-", "").replace("_", "").replace("+", "")

    @classmethod
    def _name_queries_from_email(cls, email, input_name=None):
        """
        Derives extra Canvas search queries from an email local part.

        Strategy:
          1. If the local part contains separators (. _ - +), split and use each segment.
          2. If the local part is a single run (no separators), strip any known first-name
             prefix supplied by *input_name* and use the remainder as a query.

        This ensures that juliesamuellamberd@gmail.com generates a "samuellamberd"
        search query which can surface "Samuel-Lamberd, Julie" in Canvas results.
        """
        if not email:
            return []
        raw_local = email.strip().lower().split("@")[0]
        local = re.sub(r"[^a-z0-9._+\-]", "", raw_local)
        queries = []

        parts = [p for p in re.split(r"[._+\-]+", local) if len(p) >= 3]
        for p in parts:
            if p not in queries:
                queries.append(p)

        # No separators — try stripping the known first-name token(s) to find a family name
        if not parts and input_name:
            plain_local = re.sub(r"[._+\-]", "", local)
            remaining = plain_local
            for token in cls._tokenize_name(input_name):
                if remaining.startswith(token):
                    remaining = remaining[len(token):]
            if remaining and len(remaining) >= 4 and remaining not in queries:
                queries.append(remaining)

        return queries

    @classmethod
    def _expanded_name_queries(cls, name):
        raw_name = str(name or "").strip()
        queries = []

        def add_query(value):
            query = str(value or "").strip()
            if query and query not in queries:
                queries.append(query)

        add_query(raw_name)

        tokens = cls._tokenize_name(raw_name)
        if tokens:
            add_query(" ".join(tokens))

            if len(tokens) >= 2:
                add_query(f"{tokens[0]} {tokens[-1]}")
                add_query(f"{tokens[-1]} {tokens[0]}")

            for token in tokens:
                if len(token) >= 3:
                    add_query(token)

        if "," in raw_name:
            parts = [part.strip() for part in raw_name.split(",", 1) if part.strip()]
            if len(parts) == 2:
                add_query(f"{parts[1]} {parts[0]}")
                add_query(f"{parts[0]} {parts[1]}")

        return queries

    def find_potential_users(self, email=None, name=None, max_results=10):
        """
        Returns probable user matches for admin-side compare/confirm flows.
        """
        seen = {}
        queries = []
        if email:
            queries.append(email.strip())
        if name:
            queries.extend(self._expanded_name_queries(name))
        # Derive extra name queries from the input email local part so that
        # e.g. "juliesamuellamberd@gmail.com" + name "Julie" also searches
        # Canvas for "samuellamberd", surfacing "Samuel-Lamberd, Julie".
        if email:
            queries.extend(self._name_queries_from_email(email, input_name=name))

        for query in queries:
            if not query:
                continue
            for user in self.list_users(search_term=query):
                user_id = str(user.get("id") or "")
                if not user_id:
                    continue
                seen[user_id] = user

        email_lc = str(email or "").strip().lower()
        name_norm = self._normalize_name(name)
        name_tokens = set(self._tokenize_name(name))

        reversed_name_norm = ""
        if len(name_tokens) >= 2:
            reversed_name_norm = " ".join(reversed(self._tokenize_name(name)))

        # Pre-compute input-email signals once, outside the per-candidate loop
        input_email_tokens, input_email_local = self._email_local_tokens(email)

        ranked = []
        for user in seen.values():
            login_id = str(user.get("login_id") or "").strip().lower()
            primary_email = str(user.get("primary_email") or user.get("email") or "").strip().lower()
            user_name_raw = str(user.get("name") or "")
            sortable_name_raw = str(user.get("sortable_name") or "")

            user_name_norm = self._normalize_name(user_name_raw)
            sortable_name_norm = self._normalize_name(sortable_name_raw)

            # Build candidate token set, expanding hyphenated names so that
            # "Samuel-Lamberd" yields {"samuel", "lamberd", "samuellamberd"}.
            candidate_tokens = (
                set(self._tokenize_name(user_name_raw))
                | set(self._tokenize_name(sortable_name_raw))
            )
            for raw in (user_name_raw, sortable_name_raw):
                for segment in re.split(r"[\s,]+", raw.lower()):
                    clean = re.sub(r"[^a-z0-9\-]", "", segment)
                    if "-" in clean:
                        bits = [b for b in clean.split("-") if b]
                        candidate_tokens.update(bits)
                        candidate_tokens.add("".join(bits))

            score = 0
            reasons = []

            # ── Exact email match ──────────────────────────────────────────
            if email_lc and (email_lc == login_id or email_lc == primary_email):
                score += 100
                reasons.append("Exact email match")

            # ── Name match (full / reordered / partial / token) ───────────
            if name_norm and (user_name_norm == name_norm or sortable_name_norm == name_norm):
                score += 70
                reasons.append("Exact name match")
            elif reversed_name_norm and (
                user_name_norm == reversed_name_norm
                or sortable_name_norm == reversed_name_norm
            ):
                score += 65
                reasons.append("Reordered name match")
            elif name_norm and (
                (user_name_norm and name_norm in user_name_norm)
                or (sortable_name_norm and name_norm in sortable_name_norm)
            ):
                score += 30
                reasons.append("Partial name match")
            elif name_tokens and candidate_tokens:
                overlap = name_tokens & candidate_tokens
                if overlap and len(overlap) >= min(2, len(name_tokens)):
                    score += 30
                    reasons.append("Token name match")

            # ── Email-derived name signal scoring ─────────────────────────
            # Signal A: how many of the *candidate's* name tokens are
            # embedded inside the *input* email local part?
            # e.g. input email "juliesamuellamberd" contains "samuel" + "lamberd"
            # → strong evidence this candidate is the right person.
            email_derived_score = 0
            if input_email_local:
                hits = sum(
                    1 for t in candidate_tokens
                    if len(t) >= 4 and t in input_email_local
                )
                if hits >= 2:
                    email_derived_score = max(email_derived_score, 50)
                    reasons.append("Candidate name embedded in input email")
                elif hits == 1:
                    email_derived_score = max(email_derived_score, 15)
                    reasons.append("Partial candidate name in input email")

            # Signal B: how many of the *input* name/email tokens are
            # embedded in the *candidate's* email local part?
            # e.g. candidate email "jsamuellamberd" contains "samuel" + "lamberd"
            # which are also present in the input email "juliesamuellamberd".
            _, cand_email_local = self._email_local_tokens(primary_email or login_id)
            if cand_email_local:
                all_input_tokens = name_tokens | input_email_tokens
                hits_b = sum(
                    1 for t in all_input_tokens
                    if len(t) >= 4 and t in cand_email_local
                )
                if hits_b >= 2:
                    email_derived_score = max(email_derived_score, 40)
                    reasons.append("Input tokens embedded in candidate email")
                elif hits_b == 1:
                    email_derived_score = max(email_derived_score, 10)

            score += email_derived_score

            if score <= 0:
                continue

            # ── First-name-only penalty ───────────────────────────────────
            # Suppress candidates that match only on a single common first
            # name with no supporting family-name or email evidence.
            is_single_token = len(name_tokens) == 1
            no_exact_email = not (email_lc and (email_lc == login_id or email_lc == primary_email))
            weak_email_signal = email_derived_score < 30
            if is_single_token and no_exact_email and weak_email_signal:
                score = max(1, int(score * 0.4))
                reasons.append("First-name-only penalty applied")

            ranked.append(
                {
                    "id": user.get("id"),
                    "name": user.get("name") or "",
                    "sortable_name": user.get("sortable_name") or "",
                    "login_id": user.get("login_id") or "",
                    "primary_email": user.get("primary_email") or user.get("email") or "",
                    "sis_user_id": user.get("sis_user_id") or "",
                    "score": score,
                    "match_reasons": reasons,
                }
            )

        ranked.sort(key=lambda item: item.get("score", 0), reverse=True)
        return ranked[:max_results]

    # ── Courses ──────────────────────────────────────────────────────────

    def list_courses(self):
        params = {
            "per_page": 100,
            "include[]": "term",
            "state[]": ["available"],
        }
        try:
            # Account-scoped endpoint is more reliable for admin/service tokens.
            return self._get_paginated("/accounts/self/courses", params=params)
        except requests.HTTPError:
            # Fallback for environments where account-level scope is restricted.
            return self._get_paginated("/courses", params=params)

    def get_course(self, course_id):
        return self._get(f"/courses/{course_id}")

    # ── Enrollments ──────────────────────────────────────────────────────

    def enroll_user(
        self,
        course_id,
        canvas_user_id,
        role="StudentEnrollment",
        role_name=None,
        enrollment_state="invited",
    ):
        """Enrolls an existing Canvas user into a course."""
        payload = {
            "enrollment": {
                "user_id": canvas_user_id,
                "type": role,
                "enrollment_state": enrollment_state,
                "notify": True,
            }
        }
        if role_name:
            payload["enrollment"]["role"] = role_name

        try:
            return self._post(f"/courses/{course_id}/enrollments", payload)
        except requests.HTTPError as exc:
            # If Canvas rejects the custom role name (400), retry without it.
            if role_name and exc.response is not None and exc.response.status_code == 400:
                logger.warning(
                    "Enrollment with role_name=%r failed (400) — retrying without custom role. Detail: %s",
                    role_name, exc,
                )
                payload["enrollment"].pop("role", None)
                return self._post(f"/courses/{course_id}/enrollments", payload)
            raise

    def list_enrollments(self, course_id):
        return self._get_paginated(f"/courses/{course_id}/enrollments", params={"per_page": 100})

    def get_enrollment_for_user(self, course_id, canvas_user_id):
        target_user_id = str(canvas_user_id)
        try:
            enrollments = self.list_enrollments(course_id)
        except requests.HTTPError as exc:
            # 404 means the course doesn't exist or the token can't list enrollments.
            # Return None so ensure_enrollment can proceed to the POST attempt,
            # which will produce the definitive error if the course truly doesn't exist.
            logger.warning(
                "list_enrollments failed for course %s (will attempt enrollment anyway): %s",
                course_id, exc,
            )
            return None
        for enrollment in enrollments:
            user = enrollment.get("user") or {}
            enrollment_user_id = enrollment.get("user_id") or user.get("id")
            if str(enrollment_user_id) == target_user_id:
                return enrollment
        return None

    def ensure_enrollment(
        self,
        course_id,
        canvas_user_id,
        role="StudentEnrollment",
        role_name=None,
        enrollment_state="invited",
    ):
        """
        Enrolls a user if needed; if already enrolled, returns existing enrollment.
        """
        existing = self.get_enrollment_for_user(course_id, canvas_user_id)
        if existing:
            return existing

        try:
            return self.enroll_user(
                course_id,
                canvas_user_id,
                role=role,
                role_name=role_name,
                enrollment_state=enrollment_state,
            )
        except requests.HTTPError:
            # Common case: race condition or enrollment already exists.
            existing_after_error = self.get_enrollment_for_user(course_id, canvas_user_id)
            if existing_after_error:
                return existing_after_error
            raise

    def delete_enrollment(self, course_id, enrollment_id, task="delete"):
        """
        Removes a single enrollment from a course.
        task: "delete" fully removes the enrollment record, "conclude" ends it,
        "deactivate" temporarily deactivates it. Does not affect the Canvas
        user account itself — only their membership in this course.
        """
        resp = requests.delete(
            self._url(f"/courses/{course_id}/enrollments/{enrollment_id}"),
            headers=self.headers,
            params={"task": task},
            timeout=15,
        )
        if not resp.ok:
            try:
                detail = resp.json()
            except Exception:
                detail = resp.text[:300]
            raise requests.HTTPError(
                f"{resp.status_code} {resp.reason} for url: {resp.url} — Canvas detail: {detail}",
                response=resp,
            )
        return resp.json()

    def delete_user(self, canvas_user_id):
        """
        Permanently deletes a Canvas user account. Only call this for accounts
        confirmed to have been created as part of a course-enrollment sync —
        never for accounts that pre-existed in Canvas.
        """
        last_error = None
        for account_id in self._candidate_account_ids():
            resp = requests.delete(
                self._url(f"/accounts/{account_id}/users/{canvas_user_id}"),
                headers=self.headers,
                timeout=15,
            )
            if resp.ok:
                return resp.json()
            try:
                detail = resp.json()
            except Exception:
                detail = resp.text[:300]
            last_error = requests.HTTPError(
                f"{resp.status_code} {resp.reason} for url: {resp.url} — Canvas detail: {detail}",
                response=resp,
            )

        if last_error:
            raise last_error
        raise RuntimeError("Failed to delete Canvas user account.")
