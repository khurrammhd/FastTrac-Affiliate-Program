import React, { useState, useEffect } from "react";
import { Container, Row, Col, Card, Form, Button, Badge, Alert } from "react-bootstrap";
import { useAuth } from "context/AuthContext";
import { useNotification } from "hooks/useNotification";
import client from "api/client";

const ROLE_VARIANT  = { superadmin: "danger", admin: "primary", reviewer: "info", viewer: "secondary" };
const ROLE_LABEL    = { superadmin: "Super Admin", admin: "Admin", reviewer: "Reviewer", viewer: "Viewer" };

function Avatar({ user, size = 80 }) {
  const initials = [user?.first_name?.[0], user?.last_name?.[0]]
    .filter(Boolean).join("").toUpperCase() || user?.username?.[0]?.toUpperCase() || "?";

  if (user?.avatar_url && !user.avatar_url.includes("messages/avatar")) {
    return (
      <img
        src={user.avatar_url}
        alt="avatar"
        style={{ width: size, height: size, borderRadius: "50%", objectFit: "cover", border: "3px solid #26c6da" }}
        onError={(e) => { e.target.style.display = "none"; e.target.nextSibling.style.display = "flex"; }}
      />
    );
  }

  return (
    <div style={{
      width: size, height: size, borderRadius: "50%",
      background: "linear-gradient(135deg, #f5b041, #d97028)",
      display: "flex", alignItems: "center", justifyContent: "center",
      fontSize: size * 0.35, fontWeight: 600, color: "#fff",
      border: "3px solid #ec9b1d",
    }}>
      {initials}
    </div>
  );
}

function InfoRow({ label, value, muted }) {
  return (
    <div style={{
      display: "flex", alignItems: "center",
      padding: "10px 0", borderBottom: "1px solid #f0f0f0",
    }}>
      <span style={{ width: 140, fontSize: 12, fontWeight: 600, color: "#888", textTransform: "uppercase", letterSpacing: "0.5px", flexShrink: 0 }}>
        {label}
      </span>
      <span style={{ fontSize: 14, color: muted ? "#aaa" : "#333" }}>
        {value || <em style={{ color: "#bbb" }}>Not set</em>}
      </span>
    </div>
  );
}

function UserProfile() {
  const { user, setUser, loading } = useAuth();
  const { notify } = useNotification();

  const [editing, setEditing]       = useState(false);
  const [firstName, setFirstName]   = useState(user?.first_name || "");
  const [lastName, setLastName]     = useState(user?.last_name  || "");
  const [saving, setSaving]         = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  if (loading) {
    return (
      <Container fluid style={{ textAlign: "center", padding: "40px 20px" }}>
        <p>Loading profile...</p>
      </Container>
    );
  }

  if (!user) {
    return (
      <Container fluid>
        <Alert variant="warning" style={{ marginTop: 20 }}>
          <Alert.Heading>No User Data</Alert.Heading>
          <p>Your profile information is not loaded. Please log out and log in again.</p>
        </Alert>
      </Container>
    );
  }

  // Sync form state when user data changes
  useEffect(() => {
    setFirstName(user?.first_name || "");
    setLastName(user?.last_name || "");
  }, [user?.id]);

  // Refresh user data from server
  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      const { data } = await client.get("/api/auth/me/");
      console.log("✅ Profile refreshed:", data);
      setUser?.(data);
      setFirstName(data?.first_name || "");
      setLastName(data?.last_name || "");
      notify("Profile refreshed.", "success");
    } catch (err) {
      console.error("❌ Failed to refresh profile:", err);
      notify("Failed to refresh profile.", "danger");
    } finally {
      setRefreshing(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const { data } = await client.patch("/api/auth/me/", {
        first_name: firstName,
        last_name:  lastName,
      });
      setUser?.(data);
      notify("Profile updated.", "success");
      setEditing(false);
    } catch {
      notify("Failed to update profile.", "danger");
    } finally {
      setSaving(false);
    }
  };

  const permissions = user.permissions || [];

  return (
    <Container fluid>
      <Row>

        {/* Left — Avatar + identity */}
        <Col md={4} lg={3}>
          <Card>
            <Card.Body style={{ textAlign: "center", padding: "32px 20px" }}>
              <div style={{ display: "flex", justifyContent: "center", marginBottom: 16 }}>
                <Avatar user={user} size={90} />
              </div>

              <h5 style={{ margin: "0 0 4px", fontWeight: 600, fontSize: 17 }}>
                {user.first_name || user.last_name
                  ? `${user.first_name} ${user.last_name}`.trim()
                  : user.username}
              </h5>
              <p style={{ color: "#888", fontSize: 13, margin: "0 0 12px" }}>
                {user.email || user.canvas_login_id || "—"}
              </p>

              <Badge
                variant={ROLE_VARIANT[user.role] || "secondary"}
                style={{ fontSize: 12, padding: "5px 14px", borderRadius: 20 }}
              >
                {ROLE_LABEL[user.role] || user.role}
              </Badge>

              {user.is_canvas_user && (
                <div style={{
                  marginTop: 16, padding: "8px 12px",
                  background: "#e3f2fd", borderRadius: 8,
                  fontSize: 12, color: "#1565c0",
                  display: "flex", alignItems: "center", gap: 6, justifyContent: "center",
                }}>
                  <i className="nc-icon nc-send" style={{ fontSize: 12 }} />
                  Canvas LMS Account
                </div>
              )}
            </Card.Body>
          </Card>

          {/* Permissions card */}
          <Card style={{ marginTop: 16 }}>
            <Card.Header style={{ padding: "12px 16px" }}>
              <Card.Title as="h5" style={{ fontSize: 13, margin: 0 }}>
                <i className="nc-icon nc-settings-gear-64 mr-1" style={{ fontSize: 12, color: "#26c6da" }} />
                Your permissions
              </Card.Title>
            </Card.Header>
            <Card.Body style={{ padding: "8px 16px 16px" }}>
              {permissions.length === 0 ? (
                <p style={{ color: "#bbb", fontSize: 13 }}>No permissions assigned.</p>
              ) : (
                permissions.map((perm) => (
                  <div key={perm} style={{
                    display: "flex", alignItems: "center", gap: 8,
                    padding: "5px 0", fontSize: 13, color: "#555",
                    borderBottom: "1px solid #f5f5f5",
                  }}>
                    <i className="nc-icon nc-check-2" style={{ fontSize: 11, color: "#43a047" }} />
                    {perm.replace(/_/g, " ")}
                  </div>
                ))
              )}
            </Card.Body>
          </Card>
        </Col>

        {/* Right — Profile details */}
        <Col md={8} lg={9}>
          <Card>
            <Card.Header>
              <div className="d-flex justify-content-between align-items-center">
                <div>
                  <Card.Title as="h4">My Profile</Card.Title>
                  <p className="card-category">Canvas LMS account details</p>
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <Button 
                    variant="secondary" 
                    size="sm" 
                    onClick={handleRefresh}
                    disabled={refreshing}
                    title="Refresh profile data from server"
                  >
                    <i className="nc-icon nc-refresh-69" style={{ fontSize: 11, marginRight: 4 }} />
                    {refreshing ? "Refreshing…" : "Refresh"}
                  </Button>
                  {!editing ? (
                    <Button variant="info" size="sm" className="btn-fill" onClick={() => setEditing(true)}>
                      <i className="nc-icon nc-ruler-pencil mr-1" style={{ fontSize: 11 }} />
                      Edit profile
                    </Button>
                  ) : (
                    <>
                      <Button variant="default" size="sm" onClick={() => setEditing(false)}>Cancel</Button>
                      <Button variant="success" size="sm" className="btn-fill" onClick={handleSave} disabled={saving}>
                        {saving ? "Saving…" : "Save changes"}
                      </Button>
                    </>
                  )}
                </div>
              </div>
            </Card.Header>

            <Card.Body>
              {/* Canvas account info (read-only) */}
              <div style={{ marginBottom: 24 }}>
                <p style={{ fontSize: 11, fontWeight: 600, color: "#888", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 4 }}>
                  Canvas account
                </p>
                <InfoRow label="Canvas ID"    value={user.canvas_user_id} />
                <InfoRow label="Login ID"     value={user.canvas_login_id} />
                <InfoRow label="Email"        value={user.email} />
                <InfoRow label="Account type" value={user.is_canvas_user ? "Canvas LMS user" : "Local account"} />
              </div>

              {/* Editable fields */}
              <div>
                <p style={{ fontSize: 11, fontWeight: 600, color: "#888", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 4 }}>
                  Profile
                </p>
                {editing ? (
                  <Row>
                    <Col md={6}>
                      <Form.Group>
                        <Form.Label style={{ fontSize: 12, fontWeight: 600 }}>First name</Form.Label>
                        <Form.Control
                          value={firstName}
                          onChange={(e) => setFirstName(e.target.value)}
                          placeholder="First name"
                        />
                      </Form.Group>
                    </Col>
                    <Col md={6}>
                      <Form.Group>
                        <Form.Label style={{ fontSize: 12, fontWeight: 600 }}>Last name</Form.Label>
                        <Form.Control
                          value={lastName}
                          onChange={(e) => setLastName(e.target.value)}
                          placeholder="Last name"
                        />
                      </Form.Group>
                    </Col>
                  </Row>
                ) : (
                  <>
                    <InfoRow label="First name" value={user.first_name} />
                    <InfoRow label="Last name"  value={user.last_name} />
                    <InfoRow label="Username"   value={user.username} />
                    <InfoRow label="Role"       value={ROLE_LABEL[user.role] || user.role} />
                  </>
                )}
              </div>

              {/* Session info */}
              <div style={{ marginTop: 24 }}>
                <p style={{ fontSize: 11, fontWeight: 600, color: "#888", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 4 }}>
                  Session
                </p>
                <div style={{
                  background: "#f8f9fa", borderRadius: 8, padding: "12px 16px",
                  fontSize: 13, color: "#555",
                }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                    <i className="nc-icon nc-check-2" style={{ color: "#43a047", fontSize: 13 }} />
                    <span>Authenticated via Canvas LMS</span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <i className="nc-icon nc-time-alarm" style={{ color: "#fb8c00", fontSize: 13 }} />
                    <span>Session active — token refreshes automatically</span>
                  </div>
                </div>
              </div>
            </Card.Body>
          </Card>
        </Col>
      </Row>
    </Container>
  );
}

export default UserProfile;
