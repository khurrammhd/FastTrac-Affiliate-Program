# User Management & Canvas OAuth Integration Guide

This guide explains how authenticated users can manage their profiles and how admins can manage all users in the FastTrac MIS system.

---

## Overview

After users authenticate via Canvas OAuth, they have access to two user management features:

1. **My Profile** — Authenticated users can view and edit their own profile
2. **User Management** — Admins can view all users, filter by Canvas OAuth status, and change user roles

---

## User Profile (`/admin/profile`)

### Purpose
Allows authenticated users to:
- View their Canvas LMS account information
- View their local profile (name, email, role)
- Edit their profile (first name, last name)
- See their assigned permissions
- View their Canvas credentials and integration status

### Features

#### Avatar Display
- **Canvas Avatar:** If user signed in via Canvas OAuth, their Canvas profile avatar is displayed
- **Fallback:** If no avatar available, a gradient circle with initials is shown
- **Initials:** Combines first letter of first name + last letter of last name (e.g., "KP" for Khurram Paizar)

#### Canvas Account Section
Displays read-only Canvas information:
- **Canvas ID** — Numeric ID from Canvas (e.g., `12345`)
- **Canvas Login ID** — Canvas login identifier (e.g., `npai@condado.com`)
- **Email** — Primary email address
- **Account Type** — Shows "Canvas LMS user" if signed in via Canvas OAuth, otherwise "Local account"

#### Profile Section
Displays editable user information:
- **First Name** — Editable
- **Last Name** — Editable
- **Username** — Read-only (e.g., Canvas login ID)
- **Role** — Read-only badge showing current role

#### Permissions Card
Shows all permissions granted based on the user's role:
- **Viewer/Staff:** `view_forms`, `view_submissions`
- **Reviewer:** All above + `review_submissions`
- **Admin:** All above + `manage_forms`, `sync_canvas`, `manage_users`
- **Super Admin:** All permissions

#### Edit Mode
Users can click **"Edit profile"** to enable editing:
- Edit first name and last name
- Changes are saved to the database and AuthContext
- Toast notification confirms successful save
- Cancel reverts to view mode

### Navigation
From the sidebar, click **"My Profile"** (profile icon) to access your profile page.

---

## User Management (`/admin/users`)

### Purpose (Admin Only)
Allows admins to:
- View all users in the system
- Filter users by Canvas OAuth status
- Change user roles with proper permission checks
- See user join dates and account types

### Features

#### User Table
Displays all users with columns:
| Column | Description |
|--------|-------------|
| **Name** | First and last name; shows "You" badge if it's the current user |
| **Username** | Login identifier |
| **Email** | User email address |
| **Role** | Color-coded role badge (danger=superadmin, primary=admin, info=reviewer, secondary=viewer) |
| **Canvas user** | "Yes" (green) if signed in via Canvas OAuth, "No" if local account |
| **Joined** | Account creation date |
| **Actions** | "Change role" button (disabled for current user and superadmin if not superadmin) |

#### Canvas OAuth Filter
**Button:** "Canvas users only"
- Click to toggle between **all users** and **Canvas OAuth users only**
- When toggled on, shows count: `Canvas users only (5)`
- Useful for checking how many users have signed in via Canvas

#### Role Management
Click **"Change role"** on any user to open a modal:
- Select new role from dropdown
- Options:
  - **Viewer** — Read-only access to forms and submissions
  - **Reviewer** — Can view and approve/reject submissions
  - **Admin** — Full access: create forms, review submissions, manage users, sync Canvas
  - **Super Admin** — Same as admin,  can assign other admins
- Save changes with immediate UI update
- Success notification confirms role change
- Error handling for permission issues

#### Role Definitions (Card Footer)
Shows all available roles and their permissions in an easily scannable format:
- **Super Admin** — Full system access, can assign admin roles
- **Admin** — Create/edit forms, approve submissions, sync Canvas
- **Reviewer** — View forms and submissions, approve/reject
- **Viewer** — Read-only access to forms and submissions

#### Restrictions
- You cannot change your own role
- Non-superadmins cannot assign/modify superadmin roles
- Current user has "You" badge for easy identification

### Navigation
From the sidebar, click **"Users"** (badge icon) to access the user management page.

---

## Canvas OAuth User Data

When a user signs in via Canvas OAuth, the following data is captured:

### User Table Fields
```python
canvas_user_id     # Canvas numeric user ID
canvas_login_id    # Canvas login identifier (email or username)
avatar_url         # Canvas profile avatar URL
is_canvas_user     # Boolean: True if signed in via Canvas
```

### Displayed in Serializers
All Canvas user data is included in API responses:

**MeSerializer** (returned on login & `/api/auth/me/`):
```json
{
  "id": 1,
  "username": "npai@condado.com",
  "email": "npai@condado.com",
  "first_name": "Khurram",
  "last_name": "Paizar",
  "role": "admin",
  "canvas_user_id": "12345",
  "canvas_login_id": "npai@condado.com",
  "avatar_url": "https://canvas.../avatar.png",
  "is_canvas_user": true,
  "permissions": ["view_forms", "view_submissions", "manage_forms", "sync_canvas"]
}
```

**UserSerializer** (returned in user list):
- Same fields as above (but without permissions)

---

## API Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/auth/me/` | GET | Get current user profile |
| `/api/auth/me/` | PATCH | Update current user profile (first_name, last_name) |
| `/api/auth/users/` | GET | List all users (paginated) |
| `/api/auth/users/<id>/` | PATCH | Update user (admin only) |
| `/api/auth/users/<id>/role/` | PATCH | Change user role (requires IsAdminOrAbove permission) |

---

## User Workflow

### 1. **User Signs In via Canvas OAuth**
User clicks "Sign in with Canvas" → authorizes on Canvas → backend creates/updates local user with Canvas data → stored in database

### 2. **User Accesses My Profile**
- Navigate to `/admin/profile`
- See Canvas account info (ID, login, email, avatar)
- Edit profile (name) if needed
- See permissions based on role

### 3. **Admin Manages Users**
- Navigate to `/admin/users`
- See all users with Canvas status
- Filter to show only Canvas OAuth users
- Change user roles as needed

### 4. **User Role Changes**
- Admin changes user's role
- Role change is logged in audit log (if enabled)
- User's permissions update on next page load
- UI adjusts to show/hide role-based features

---

## Technical Implementation

### Files Modified
- [mis_project/apps/accounts/serializers.py](mis_project/apps/accounts/serializers.py)
  - Added `canvas_login_id` to UserSerializer and MeSerializer
  
- [src/views/UserProfile.js](src/views/UserProfile.js)
  - Already displays Canvas user info
  - Allows editing first/last name
  - Shows avatar, role, and permissions
  
- [src/views/UserManagement.js](src/views/UserManagement.js)
  - Added Canvas filter button
  - Shows Canvas user status in table
  - Allows role changes with modal dialog
  
- [src/context/AuthContext.js](src/context/AuthContext.js)
  - Exposed `setUser` method for profile updates
  - Handles Canvas callback with proper token storage

### Components Used
- **Bootstrap Components:** Container, Row, Col, Card, Form, Button, Badge, Modal, Table
- **Custom Avatar Component:** Displays Canvas avatar or initials fallback
- **InfoRow Component:** Displays label-value pairs with styling
- **useNotification Hook:** Toast notifications for user feedback
- **useAuth Hook:** Access current user and permissions

---

## Testing Checklist

### User Profile Tests
- [ ] Log in via Canvas OAuth
- [ ] Navigate to `/admin/profile`
- [ ] Verify Canvas account info displays (ID, login_id, email, avatar)
- [ ] Verify "Canvas LMS Account" badge appears
- [ ] Click "Edit profile"
- [ ] Change first or last name
- [ ] Click "Save changes"
- [ ] Verify success notification
- [ ] Refresh page and verify changes persisted
- [ ] Verify permissions list shows correct permissions for your role

### User Management Tests
- [ ] Log in as admin
- [ ] Navigate to `/admin/users`
- [ ] Verify all users display in table
- [ ] Verify Canvas user status column shows correctly
- [ ] Click "Canvas users only" filter
- [ ] Verify only Canvas OAuth users display
- [ ] Click filter again to show all users
- [ ] Click "Change role" for another user
- [ ] Select new role and save
- [ ] Verify success notification
- [ ] Refresh page and verify role change persisted
- [ ] Test that non-superadmin cannot change superadmin roles

### Canvas Integration Tests
- [ ] Verify users created via Canvas OAuth show `is_canvas_user = true`
- [ ] Verify Canvas avatar displays if available
- [ ] Verify Canvas login_id matches Canvas profile
- [ ] Verify Avatar falls back to initials if Canvas avatar unavailable

---

## Security Notes

⚠️ **Authorization & RBAC:**
- Only authenticated users can access `/admin/profile`
- Only admins can access `/admin/users`
- Users cannot change their own role
- Non-superadmins cannot modify superadmin roles
- All role changes are validated server-side

⚠️ **Data Protection:**
- Canvas tokens stored securely in localStorage (httpOnly recommended in production)
- Avatar URLs validated to prevent malicious images
- User data returned via MeSerializer (controlled fields)
- Sensitive data (password hashes, refresh tokens) never exposed to frontend

---

## Troubleshooting

### Issue: "Cannot see Canvas info on profile"
**Cause:** User signed in via direct Canvas login, not OAuth
**Fix:** Use OAuth flow (blue "Sign in with Canvas" button)

### Issue: "Canvas avatar not showing"
**Cause:** Invalid or expired Canvas avatar URL
**Fix:** Check Canvas profile avatar settings; fallback to initials is applied

### Issue: "Cannot change user role"
**Cause:** Browser cache or missing refresh
**Fix:** 
- Refresh the page
- Verify you have admin privileges
- Check browser DevTools for API errors

### Issue: "Users list shows zero users"
**Cause:** Database not seeded or users table empty
**Fix:** Create test users in Django admin or via sign-up flow

---

## Next Steps

1. **Add user avatar upload** — Allow users to upload custom avatars
2. **Add last login tracking** — Show when users last accessed the system
3. **Add bulk user import** — Import users from CSV
4. **Add user activity log** — Track user actions across forms and submissions
5. **Add 2FA integration** — Two-factor authentication for Canvas users

---

**Last Updated:** April 2026 | **Version:** 1.0 | User Management & Canvas Integration
