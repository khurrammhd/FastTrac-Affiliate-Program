import React, { useEffect, useState } from "react";
import { Container, Row, Col, Card, Table, Button, Badge, Form } from "react-bootstrap";
import { useAuth } from "context/AuthContext";
import { useNotification } from "hooks/useNotification";
import { fetchUsers, updateUser } from "api/auth";
import client from "api/client";

const ROLE_VARIANT = { superadmin: "danger", admin: "primary", reviewer: "info", viewer: "secondary" };

const ROLE_OPTIONS = [
  { value: "viewer",   label: "Viewer — read only" },
  { value: "reviewer", label: "Reviewer — can approve / reject" },
  { value: "admin",    label: "Admin — full access" },
];

function UserManagement() {
  const { user: me, isSuperAdmin } = useAuth();
  const { notify } = useNotification();

  const [users, setUsers]           = useState([]);
  const [loading, setLoading]       = useState(true);
  const [roleModal, setRoleModal]   = useState({ show: false, target: null });
  const [newRole, setNewRole]       = useState("");
  const [saving, setSaving]         = useState(false);
  const [filterCanvasOnly, setFilterCanvasOnly] = useState(false);

  useEffect(() => {
    fetchUsers()
      .then(({ data }) => setUsers(data.results ?? data))
      .catch(() => notify("Failed to load users.", "danger"))
      .finally(() => setLoading(false));
  }, []);

  const displayedUsers = filterCanvasOnly 
    ? users.filter(u => u.is_canvas_user)
    : users;

  const openRoleModal = (u) => { setRoleModal({ show: true, target: u }); setNewRole(u.role); };

  const handleRoleChange = async () => {
    if (!roleModal.target || !newRole) return;
    setSaving(true);
    try {
      const { data } = await client.patch(`/api/auth/users/${roleModal.target.id}/role/`, { role: newRole });
      setUsers((prev) => prev.map((u) => u.id === data.id ? data : u));
      notify(`Role updated to ${newRole}.`, "success");
      setRoleModal({ show: false, target: null });
    } catch (err) {
      notify(err.response?.data?.error || "Failed to update role.", "danger");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Container fluid>
      <Row>
        <Col md={12}>
          <Card>
            <Card.Header>
              <div className="d-flex justify-content-between align-items-center">
                <div>
                  <Card.Title as="h4">User Management</Card.Title>
                  <p className="card-category">Manage user roles and access levels</p>
                </div>
                <Button
                  variant={filterCanvasOnly ? "info" : "outline-info"}
                  size="sm"
                  className={filterCanvasOnly ? "btn-fill" : ""}
                  onClick={() => setFilterCanvasOnly(!filterCanvasOnly)}
                >
                  <i className="nc-icon nc-cloud-upload-94 mr-1" style={{ fontSize: 11 }} />
                  Canvas users only {filterCanvasOnly && `(${displayedUsers.length})`}
                </Button>
              </div>
            </Card.Header>
            <Card.Body className="table-responsive p-0">
              {loading ? (
                <div className="text-center py-4"><div className="spinner-border text-primary" /></div>
              ) : (
                <Table striped hover>
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Username</th>
                      <th>Email</th>
                      <th>Role</th>
                      <th>Canvas user</th>
                      <th>Joined</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {displayedUsers.map((u) => (
                      <tr key={u.id}>
                        <td style={{ fontWeight: 500 }}>
                          {u.first_name} {u.last_name}
                          {u.id === me?.id && (
                            <Badge variant="light" style={{ marginLeft: 6, fontSize: 10 }}>You</Badge>
                          )}
                        </td>
                        <td>{u.username}</td>
                        <td>{u.email || "—"}</td>
                        <td>
                          <Badge variant={ROLE_VARIANT[u.role] || "secondary"}>{u.role}</Badge>
                        </td>
                        <td>
                          {u.is_canvas_user
                            ? <Badge variant="success">Yes</Badge>
                            : <Badge variant="light">No</Badge>}
                        </td>
                        <td>{u.created_at ? new Date(u.created_at).toLocaleDateString() : "—"}</td>
                        <td>
                          {u.id !== me?.id && (
                            <Button
                              variant="info"
                              size="sm"
                              className="btn-fill"
                              onClick={() => openRoleModal(u)}
                              disabled={u.role === "superadmin" && !isSuperAdmin}
                            >
                              <i className="nc-icon nc-settings-gear-64 mr-1" style={{ fontSize: 11 }} />
                              Change role
                            </Button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              )}
            </Card.Body>

            <Card.Footer>
              <div
                style={{
                  background: "#f8f9fa", borderRadius: 6, padding: "12px 16px",
                  display: "flex", flexWrap: "wrap", gap: 16, fontSize: 13,
                }}
              >
                {[
                  { role: "superadmin", label: "Super Admin",  desc: "Full system access, can assign admin roles" },
                  { role: "admin",      label: "Admin",        desc: "Create/edit forms, approve submissions, sync Canvas" },
                  { role: "reviewer",   label: "Reviewer",     desc: "View forms and submissions, approve/reject" },
                  { role: "viewer",     label: "Viewer",       desc: "Read-only access to forms and submissions" },
                ].map((r) => (
                  <div key={r.role} className="d-flex align-items-center" style={{ gap: 8 }}>
                    <Badge variant={ROLE_VARIANT[r.role]}>{r.label}</Badge>
                    <span className="text-muted" style={{ fontSize: 12 }}>{r.desc}</span>
                  </div>
                ))}
              </div>
            </Card.Footer>
          </Card>
        </Col>
      </Row>

      {/* Simple Modal without react-transition-group */}
      {roleModal.show && (
        <div style={{
          position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
          background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center",
          justifyContent: "center", zIndex: 1050,
        }} onClick={() => setRoleModal({ show: false, target: null })}>
          <div style={{
            background: "#fff", borderRadius: 8, padding: 24, maxWidth: 400,
            boxShadow: "0 10px 40px rgba(0,0,0,0.2)",
          }} onClick={(e) => e.stopPropagation()}>
            <h5 style={{ fontSize: 16, fontWeight: 600, marginBottom: 16 }}>
              Change role — {roleModal.target?.first_name || roleModal.target?.username}
            </h5>
            
            <Form.Group style={{ marginBottom: 20 }}>
              <Form.Label style={{ fontWeight: 600, fontSize: 13 }}>New role</Form.Label>
              <Form.Select value={newRole} onChange={(e) => setNewRole(e.target.value)}>
                {ROLE_OPTIONS.map((role) => (
                  <option key={role.value} value={role.value}>{role.label}</option>
                ))}
              </Form.Select>
            </Form.Group>

            <div style={{ display: "flex", gap: 12, justifyContent: "flex-end" }}>
              <button 
                onClick={() => setRoleModal({ show: false, target: null })}
                style={{
                  padding: "8px 16px", border: "1px solid #ddd", borderRadius: 6,
                  background: "#fff", cursor: "pointer", fontSize: 14,
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleRoleChange}
                disabled={saving}
                style={{
                  padding: "8px 16px", border: "none", borderRadius: 6,
                  background: "#26c6da", color: "#fff", cursor: saving ? "not-allowed" : "pointer",
                  fontSize: 14, fontWeight: 600,
                }}
              >
                {saving ? "Saving…" : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}   
      </Container>
  );
}

export default UserManagement;
