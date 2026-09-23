import requests
from django.conf import settings
from rest_framework import generics, permissions
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.tokens import RefreshToken
from apps.accounts.permissions import IsAdminOrAbove, CanManageUsers
from .models import User, CanvasOAuthToken
from .serializers import UserSerializer, UserCreateSerializer, MeSerializer

def get_tokens(user):
    refresh = RefreshToken.for_user(user)
    return {"refresh": str(refresh), "access": str(refresh.access_token)}

class MeView(APIView):
    permission_classes = [permissions.IsAuthenticated]
    def get(self, request):
        return Response(MeSerializer(request.user).data)
    def patch(self, request):
        s = MeSerializer(request.user, data=request.data, partial=True)
        s.is_valid(raise_exception=True)
        s.save()
        return Response(s.data)


class CanvasOAuthCallbackView(APIView):
    """
    GET /api/auth/canvas/callback/?code=...&state=...
    
    Handles Canvas OAuth2 authorization callback.
    Exchanges the authorization code for an access token, fetches the user's
    profile from Canvas, creates/updates the local user, and returns JWT tokens.
    """
    permission_classes = [permissions.AllowAny]

    def get(self, request):
        code = request.query_params.get("code", "").strip()
        error = request.query_params.get("error", "").strip()

        # Check for OAuth errors
        if error:
            error_desc = request.query_params.get("error_description", "Authorization denied or cancelled")
            return Response(
                {"error": f"Canvas OAuth error: {error_desc}"},
                status=400
            )

        if not code:
            return Response({"error": "Missing authorization code."}, status=400)

        # Verify configuration
        if not all([
            settings.CANVAS_BASE_URL,
            settings.CANVAS_CLIENT_ID,
            settings.CANVAS_CLIENT_SECRET,
        ]):
            return Response(
                {"error": "Canvas OAuth is not configured. Check CANVAS_* env vars."},
                status=500
            )

        # Step 1: Exchange authorization code for access token
        token_url = f"{settings.CANVAS_BASE_URL.rstrip('/')}/login/oauth2/token"
        token_payload = {
            "client_id": settings.CANVAS_CLIENT_ID,
            "client_secret": settings.CANVAS_CLIENT_SECRET,
            "code": code,
            "grant_type": "authorization_code",
            "redirect_uri": settings.CANVAS_REDIRECT_URI,
        }

        try:
            token_response = requests.post(
                token_url,
                data=token_payload,
                timeout=15,
            )
            token_response.raise_for_status()
            token_data = token_response.json()
        except requests.exceptions.RequestException as e:
            return Response(
                {"error": f"Failed to exchange authorization code: {str(e)}"},
                status=502
            )

        access_token = token_data.get("access_token")
        refresh_token = token_data.get("refresh_token", "")
        expires_in = token_data.get("expires_in", 3600)

        if not access_token:
            return Response(
                {"error": "No access token received from Canvas."},
                status=502
            )

        # Step 2: Fetch user profile from Canvas using the access token
        headers = {"Authorization": f"Bearer {access_token}"}

        try:
            profile_resp = requests.get(
                f"{settings.CANVAS_BASE_URL.rstrip('/')}/api/v1/users/self/profile",
                headers=headers,
                timeout=15,
            )
            profile_resp.raise_for_status()
            profile = profile_resp.json()
        except requests.exceptions.RequestException as e:
            return Response(
                {"error": f"Failed to fetch Canvas user profile: {str(e)}"},
                status=502
            )

        # Step 3: Extract user data from Canvas profile
        canvas_user_id = str(profile.get("id", ""))
        login_id = profile.get("login_id", "")
        name = profile.get("name", "")
        email = profile.get("primary_email") or profile.get("email", "")
        avatar_url = profile.get("avatar_url", "")

        if not canvas_user_id:
            return Response(
                {"error": "Canvas profile missing ID."},
                status=502
            )

        # Step 4: Create or update local user
        name_parts = name.split(" ", 1) if name else ["", ""]
        user, created = User.objects.get_or_create(
            canvas_user_id=canvas_user_id,
            defaults={
                "username": login_id or f"canvas_{canvas_user_id}",
                "email": email,
                "first_name": name_parts[0] if name_parts else "",
                "last_name": name_parts[1] if len(name_parts) > 1 else "",
                "role": User.Role.ADMIN,  # Default role for OAuth users
                "is_canvas_user": True,
                "canvas_login_id": login_id,
                "avatar_url": avatar_url,
            },
        )

        if not created:
            # Update existing user with fresh Canvas data
            changed = False
            if email and user.email != email:
                user.email = email
                changed = True
            if avatar_url and user.avatar_url != avatar_url:
                user.avatar_url = avatar_url
                changed = True
            if changed:
                user.save()

        # Step 5: Store or update Canvas OAuth tokens
        from django.utils import timezone
        from datetime import timedelta

        expires_at = timezone.now() + timedelta(seconds=expires_in) if expires_in else None

        CanvasOAuthToken.objects.update_or_create(
            user=user,
            defaults={
                "access_token": access_token,
                "refresh_token": refresh_token,
                "token_type": "Bearer",
                "expires_at": expires_at,
                "canvas_user_id": canvas_user_id,
            },
        )

        # Step 6: Return JWT tokens and user data
        jwt_tokens = get_tokens(user)
        return Response({
            "user": MeSerializer(user).data,
            "tokens": jwt_tokens,
            "canvas": {
                "access_token": access_token,
                "canvas_user_id": canvas_user_id,
            },
        })


class LocalLoginView(APIView):
    """
    POST /api/auth/local-login/
    Body: { "username": "admin", "password": "admin123" }
    
    Local authentication without Canvas.
    For development and local testing.
    """
    permission_classes = [permissions.AllowAny]

    def post(self, request):
        username = request.data.get("username", "").strip()
        password = request.data.get("password", "").strip()

        if not username or not password:
            return Response({"error": "Username and password are required."}, status=400)

        try:
            user = User.objects.get(username=username)
        except User.DoesNotExist:
            return Response({"error": "Invalid username or password."}, status=401)

        # Check password
        if not user.check_password(password):
            return Response({"error": "Invalid username or password."}, status=401)

        if not user.is_active:
            return Response({"error": "User account is inactive."}, status=403)

        # Generate JWT tokens
        tokens = get_tokens(user)
        return Response({
            "user": MeSerializer(user).data,
            "tokens": tokens,
        })


class CanvasLoginView(APIView):
    """
    POST /api/auth/login/
    Body: { "username": "npai@condado.com", "password": "..." }
    
    Authenticates via Canvas username/password (server-to-server).
    Django calls Canvas API with server API token, finds the user,
    creates a local account, returns JWT.
    
    NOTE: For OAuth2 flow, use CanvasOAuthCallbackView instead.
    """
    permission_classes = [permissions.AllowAny]

    def post(self, request):
        username = request.data.get("username", "").strip()
        password = request.data.get("password", "").strip()

        if not username or not password:
            return Response({"error": "Username and password are required."}, status=400)

        if not settings.CANVAS_API_TOKEN:
            return Response(
                {"error": "Canvas API token not configured."},
                status=500
            )

        headers = {"Authorization": f"Bearer {settings.CANVAS_API_TOKEN}"}

        # Search Canvas for the user by login_id
        try:
            resp = requests.get(
                f"{settings.CANVAS_BASE_URL.rstrip('/')}/api/v1/accounts/1/users",
                headers=headers,
                params={"search_term": username, "per_page": 10},
                timeout=10,
            )
            if resp.status_code != 200:
                return Response({"error": "Cannot reach Canvas. Please try again."}, status=502)

            users = resp.json()
        except Exception:
            return Response({"error": "Cannot reach Canvas. Please try again."}, status=502)

        # Find exact match
        match = None
        for u in users:
            if (u.get("login_id", "").lower() == username.lower() or
                    u.get("name", "").lower() == username.lower()):
                match = u
                break

        if not match:
            return Response({"error": "User not found. Please check your username."}, status=401)

        # Get full profile
        try:
            profile_resp = requests.get(
                f"{settings.CANVAS_BASE_URL.rstrip('/')}/api/v1/users/{match['id']}/profile",
                headers=headers,
                timeout=10,
            )
            profile = profile_resp.json() if profile_resp.status_code == 200 else match
        except Exception:
            profile = match

        # Build user data
        canvas_user_id = str(profile.get("id") or match.get("id"))
        login_id       = profile.get("login_id") or match.get("login_id") or username
        name           = profile.get("name") or match.get("name") or ""
        name_parts     = name.split(" ", 1)
        email          = profile.get("primary_email") or match.get("email") or username
        avatar_url     = profile.get("avatar_url") or ""

        # Create or update local user
        user, created = User.objects.get_or_create(
            canvas_user_id=canvas_user_id,
            defaults={
                "username":        login_id or f"canvas_{canvas_user_id}",
                "email":           email,
                "first_name":      name_parts[0] if name_parts else "",
                "last_name":       name_parts[1] if len(name_parts) > 1 else "",
                "role":            User.Role.ADMIN,
                "is_canvas_user":  True,
                "canvas_login_id": login_id,
                "avatar_url":      avatar_url,
            },
        )

        if not created:
            changed = False
            if email and user.email != email:       user.email = email; changed = True
            if avatar_url and user.avatar_url != avatar_url: user.avatar_url = avatar_url; changed = True
            if changed:
                user.save()

        CanvasOAuthToken.objects.update_or_create(
            user=user,
            defaults={"access_token": settings.CANVAS_API_TOKEN, "canvas_user_id": canvas_user_id},
        )

        return Response({"user": MeSerializer(user).data, "tokens": get_tokens(user)})


class UserListCreateView(generics.ListCreateAPIView):
    queryset = User.objects.all()
    permission_classes = [permissions.IsAuthenticated, CanManageUsers]
    def get_serializer_class(self):
        return UserCreateSerializer if self.request.method == "POST" else UserSerializer

class UserDetailView(generics.RetrieveUpdateDestroyAPIView):
    queryset = User.objects.all()
    serializer_class = UserSerializer
    permission_classes = [permissions.IsAuthenticated, CanManageUsers]

class UserRoleUpdateView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsAdminOrAbove]
    def patch(self, request, pk):
        try:
            target = User.objects.get(pk=pk)
        except User.DoesNotExist:
            return Response({"error": "User not found."}, status=404)
        new_role = request.data.get("role", "").lower()
        allowed  = [r[0] for r in User.Role.choices]
        if new_role not in allowed:
            return Response({"error": f"Invalid role."}, status=400)
        if new_role in ("admin","superadmin") and not request.user.is_superadmin:
            return Response({"error": "Only superadmin can assign admin roles."}, status=403)
        old_role = target.role
        target.role = new_role
        target.save()
        try:
            from apps.audit.models import AuditLog, log as audit_log
            audit_log(AuditLog.Action.ROLE_CHANGED, actor=request.user,
                      target=target, detail={"old_role": old_role, "new_role": new_role}, request=request)
        except Exception:
            pass
        return Response(UserSerializer(target).data)
