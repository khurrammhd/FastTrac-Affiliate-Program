/**
 * ProfilePage.jsx — hardened against the backend/frontend shape mismatch that
 * was causing the page to look "broken" after enabling the /api/auth/me/ fetch.
 *
 * Backend MeSerializer actually returns:
 *   id, username, email, first_name, last_name, role,
 *   canvas_user_id, canvas_login_id, avatar_url, is_canvas_user, permissions
 *
 * It does NOT return: full_name, date_joined, last_login, is_staff,
 * is_superuser, is_active, groups, canvas_avatar_url, canvas_name.
 *
 * This component now:
 *  - uses AuthContext.user as the single source of truth (AuthContext already
 *    calls /api/auth/me/ on mount — no need to fetch it again here),
 *  - exposes a "Refresh" button that re-fetches on demand,
 *  - sends PATCH { first_name, last_name } (not full_name) so saves actually
 *    persist,
 *  - computes display values in the UI from the real fields.
 */

import { useState, useRef } from "react";
import { Card, Row, Col, Spinner, Badge } from "react-bootstrap";
import { useAuth } from "context/AuthContext";
import { fetchMe, updateMe } from "api/auth";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getInitials(name = "") {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join("");
}

function splitFullName(full) {
  const parts = (full || "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { first_name: "", last_name: "" };
  if (parts.length === 1) return { first_name: parts[0], last_name: "" };
  return {
    first_name: parts[0],
    last_name:  parts.slice(1).join(" "),
  };
}

const ROLE_VARIANT = {
  superadmin: "danger",
  admin:      "primary",
  reviewer:   "info",
  viewer:     "secondary",
};

// ─── Info Row ─────────────────────────────────────────────────────────────────

function InfoRow({ icon, label, value }) {
  return (
    <div className="d-flex align-items-start py-2 border-bottom">
      <div
        className="d-flex align-items-center justify-content-center rounded-circle mr-3 flex-shrink-0"
        style={{ width: 36, height: 36, background: "rgba(35,188,188,0.12)", minWidth: 36 }}
      >
        <i className={`${icon} text-info`} style={{ fontSize: 14 }} />
      </div>
      <div>
        <div className="text-muted" style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.05em" }}>
          {label}
        </div>
        <div className="font-weight-bold" style={{ fontSize: 14, wordBreak: "break-all" }}>
          {value || "—"}
        </div>
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

function ProfilePage() {
  const { user, setUser, loading: authLoading } = useAuth();

  const [refreshing, setRefreshing] = useState(false);
  const [error, setError]           = useState(null);
  const [saving, setSaving]         = useState(false);
  const [saveError, setSaveError]   = useState(null);
  const [editing, setEditing]       = useState(false);
  const [editName, setEditName]     = useState("");
  const nameInputRef                = useRef(null);

  // ── While AuthContext is still fetching /api/auth/me/ on mount ────────────
  if (authLoading) {
    return (
      <div className="content d-flex align-items-center justify-content-center" style={{ minHeight: "60vh" }}>
        <Spinner animation="border" variant="info" />
      </div>
    );
  }

  // ── AuthContext finished but we have no user — fetch failed or logged out ─
  if (!user) {
    return (
      <div className="content">
        <Row className="justify-content-center">
          <Col md={6}>
            <Card className="text-center shadow-sm">
              <Card.Body className="py-5">
                <i className="fas fa-exclamation-triangle text-danger mb-3" style={{ fontSize: 36 }} />
                <h5 className="text-danger">Not signed in</h5>
                <p className="text-muted">
                  {error || "We couldn't load your profile. Please sign in again."}
                </p>
                <a className="btn btn-outline-info btn-sm" href="/login">
                  <i className="fas fa-sign-in-alt mr-1" /> Back to login
                </a>
              </Card.Body>
            </Card>
          </Col>
        </Row>
      </div>
    );
  }

  // ── Derived values from the REAL serializer fields ────────────────────────
  const displayName =
    [user.first_name, user.last_name].filter(Boolean).join(" ") ||
    user.username ||
    "User";

  const initials  = getInitials(displayName);
  const roleLabel = user.role || "viewer";
  const roleBadge = ROLE_VARIANT[roleLabel?.toLowerCase()] || "secondary";

  // Canvas avatar lives under `avatar_url` on the serializer (not canvas_avatar_url).
  const avatarUrl = user.avatar_url || null;

  // ── Actions ───────────────────────────────────────────────────────────────
  async function handleRefresh() {
    setRefreshing(true);
    setError(null);
    try {
      const { data } = await fetchMe();
      setUser?.(data);
    } catch (err) {
      setError(err?.response?.data?.detail || err?.message || "Could not refresh profile.");
    } finally {
      setRefreshing(false);
    }
  }

  function handleEditStart() {
    setEditName(displayName);
    setEditing(true);
    setSaveError(null);
    setTimeout(() => nameInputRef.current?.focus(), 50);
  }

  function handleEditCancel() {
    setEditing(false);
    setSaveError(null);
  }

  async function handleSaveName() {
    if (!editName.trim()) return;
    try {
      setSaving(true);
      setSaveError(null);
      // MeSerializer only exposes first_name / last_name — split the input.
      const { first_name, last_name } = splitFullName(editName);
      const { data } = await updateMe({ first_name, last_name });
      setUser?.(data);
      setEditing(false);
    } catch (err) {
      setSaveError(
        err?.response?.data?.first_name?.[0] ||
        err?.response?.data?.last_name?.[0] ||
        err?.response?.data?.detail ||
        "Could not save. Please try again."
      );
    } finally {
      setSaving(false);
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="content">

      {error && (
        <Row>
          <Col md={12}>
            <div className="alert alert-warning d-flex justify-content-between align-items-center">
              <span><i className="fas fa-exclamation-circle mr-2" />{error}</span>
              <button className="btn btn-sm btn-link p-0" onClick={() => setError(null)}>
                <i className="fas fa-times" />
              </button>
            </div>
          </Col>
        </Row>
      )}

      {/* ── Header card ── */}
      <Row>
        <Col md={12}>
          <Card className="shadow-sm mb-4">
            <div style={{
              height: 110,
              background: "linear-gradient(135deg, #23bcbc 0%, #00838f 100%)",
              borderRadius: "4px 4px 0 0",
            }} />

            <Card.Body className="pt-0">
              <div className="d-flex align-items-end" style={{ marginTop: -48 }}>

                {/* Avatar */}
                <div
                  className="d-flex align-items-center justify-content-center rounded-circle shadow"
                  style={{
                    width: 90, height: 90,
                    background: avatarUrl ? "transparent" : "#23bcbc",
                    border: "4px solid #fff",
                    overflow: "hidden",
                    flexShrink: 0,
                  }}
                >
                  {avatarUrl ? (
                    <img
                      src={avatarUrl}
                      alt={displayName}
                      style={{ width: "100%", height: "100%", objectFit: "cover" }}
                      onError={(e) => { e.target.style.display = "none"; }}
                    />
                  ) : (
                    <span style={{ color: "#fff", fontSize: 28, fontWeight: 700, lineHeight: 1 }}>
                      {initials}
                    </span>
                  )}
                </div>

                {/* Name + role */}
                <div className="ml-3 pb-1 flex-grow-1">
                  <div className="d-flex align-items-center flex-wrap" style={{ gap: 6 }}>
                    {editing ? (
                      <div className="d-flex align-items-center">
                        <input
                          ref={nameInputRef}
                          className="form-control form-control-sm mr-2"
                          style={{ maxWidth: 220, fontWeight: 700 }}
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter")  handleSaveName();
                            if (e.key === "Escape") handleEditCancel();
                          }}
                        />
                        <button
                          className="btn btn-sm btn-info mr-1"
                          onClick={handleSaveName}
                          disabled={saving}
                          title="Save"
                        >
                          {saving
                            ? <Spinner animation="border" size="sm" />
                            : <i className="fas fa-check" />}
                        </button>
                        <button
                          className="btn btn-sm btn-light"
                          onClick={handleEditCancel}
                          title="Cancel"
                        >
                          <i className="fas fa-times" />
                        </button>
                      </div>
                    ) : (
                      <>
                        <h4 className="mb-0 mr-1" style={{ fontWeight: 700 }}>{displayName}</h4>
                        <button
                          className="btn btn-link btn-sm p-0 text-muted"
                          onClick={handleEditStart}
                          title="Edit name"
                        >
                          <i className="fas fa-pencil-alt" style={{ fontSize: 13 }} />
                        </button>
                      </>
                    )}

                    <Badge
                      variant={roleBadge}
                      style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.05em" }}
                    >
                      {roleLabel}
                    </Badge>
                  </div>

                  {saveError && <small className="text-danger d-block mt-1">{saveError}</small>}
                  <small className="text-muted">@{user.username}</small>
                </div>

                {/* Refresh button */}
                <button
                  className="btn btn-sm btn-outline-info ml-auto"
                  onClick={handleRefresh}
                  disabled={refreshing}
                  title="Reload from server"
                >
                  {refreshing
                    ? <Spinner animation="border" size="sm" />
                    : <><i className="fas fa-sync-alt mr-1" /> Refresh</>}
                </button>
              </div>
            </Card.Body>
          </Card>
        </Col>
      </Row>

      {/* ── Detail cards ── */}
      <Row>

        {/* Account Information */}
        <Col md={6}>
          <Card className="shadow-sm mb-4">
            <Card.Header>
              <Card.Title as="h5" className="mb-0">
                <i className="fas fa-user-circle text-info mr-2" />
                Account Information
              </Card.Title>
            </Card.Header>
            <Card.Body>
              <InfoRow icon="fas fa-user"     label="First Name" value={user.first_name} />
              <InfoRow icon="fas fa-user"     label="Last Name"  value={user.last_name} />
              <InfoRow icon="fas fa-envelope" label="Email"      value={user.email} />
              <InfoRow icon="fas fa-id-badge" label="Username"   value={user.username} />
              <InfoRow icon="fas fa-user-tag" label="Role"       value={roleLabel} />
            </Card.Body>
          </Card>
        </Col>

        {/* Canvas LMS */}
        <Col md={6}>
          <Card className="shadow-sm mb-4">
            <Card.Header>
              <Card.Title as="h5" className="mb-0">
                <i className="fas fa-graduation-cap text-info mr-2" />
                Canvas LMS
              </Card.Title>
            </Card.Header>
            <Card.Body>
              {user.is_canvas_user || user.canvas_user_id ? (
                <>
                  <InfoRow icon="fas fa-fingerprint" label="Canvas User ID" value={user.canvas_user_id} />
                  <InfoRow icon="fas fa-sign-in-alt" label="Canvas Login"   value={user.canvas_login_id || user.email} />
                  {avatarUrl && (
                    <div className="d-flex align-items-start py-2 border-bottom">
                      <div
                        className="d-flex align-items-center justify-content-center rounded-circle mr-3 flex-shrink-0"
                        style={{ width: 36, height: 36, background: "rgba(35,188,188,0.12)", minWidth: 36 }}
                      >
                        <i className="fas fa-link text-info" style={{ fontSize: 14 }} />
                      </div>
                      <div>
                        <div className="text-muted" style={{ fontSize: 11, textTransform: "uppercase" }}>Avatar</div>
                        <a href={avatarUrl} target="_blank" rel="noreferrer" className="text-info" style={{ fontSize: 13 }}>
                          View avatar <i className="fas fa-external-link-alt" style={{ fontSize: 10 }} />
                        </a>
                      </div>
                    </div>
                  )}
                  <div className="mt-3">
                    <Badge variant="info" style={{ fontSize: 11, padding: "5px 10px" }}>
                      <i className="fas fa-check-circle mr-1" />
                      Connected via Canvas OAuth
                    </Badge>
                  </div>
                </>
              ) : (
                <div className="text-center text-muted py-5">
                  <i className="fas fa-graduation-cap mb-2"
                    style={{ fontSize: 36, opacity: 0.3, display: "block" }} />
                  Not connected to Canvas LMS
                </div>
              )}
            </Card.Body>
          </Card>
        </Col>
      </Row>

      {/* ── Permissions ── */}
      {Array.isArray(user.permissions) && user.permissions.length > 0 && (
        <Row>
          <Col md={12}>
            <Card className="shadow-sm">
              <Card.Header>
                <Card.Title as="h5" className="mb-0">
                  <i className="fas fa-shield-alt text-info mr-2" />
                  Permissions
                </Card.Title>
              </Card.Header>
              <Card.Body>
                <div className="d-flex flex-wrap" style={{ gap: 8 }}>
                  {user.permissions.map((perm) => (
                    <Badge key={perm} variant="secondary" style={{ fontSize: 12, padding: "6px 12px" }}>
                      {String(perm).replace(/_/g, " ")}
                    </Badge>
                  ))}
                </div>
              </Card.Body>
            </Card>
          </Col>
        </Row>
      )}

    </div>
  );
}

export default ProfilePage;
