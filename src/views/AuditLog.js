import React, { useEffect, useState } from "react";
import { Container, Row, Col, Card, Table, Badge, Form } from "react-bootstrap";
import { useNotification } from "hooks/useNotification";
import client from "api/client";

const ACTION_VARIANT = {
  form_created: "info",   form_updated: "info",   form_published: "success",
  form_closed:  "warning", form_deleted: "danger",
  sub_approved: "success", sub_rejected: "danger", sub_resynced: "warning",
  canvas_synced:"success", canvas_failed:"danger",
  role_changed: "primary", user_created: "info",
};

const ACTION_ICON = {
  form_created: "nc-icon nc-paper-2",     form_published: "nc-icon nc-send",
  form_closed:  "nc-icon nc-lock-circle-open", form_deleted: "nc-icon nc-simple-remove",
  sub_approved: "nc-icon nc-check-2",     sub_rejected: "nc-icon nc-simple-remove",
  sub_resynced: "nc-icon nc-refresh-69",  canvas_synced: "nc-icon nc-send",
  canvas_failed:"nc-icon nc-simple-remove", role_changed: "nc-icon nc-settings-gear-64",
  user_created: "nc-icon nc-circle-09",
};

function AuditLog() {
  const { notify } = useNotification();
  const [logs, setLogs]       = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter]   = useState("");

  const load = (action = "") => {
    setLoading(true);
    const params = action ? `?action=${action}` : "";
    client.get(`/api/audit/${params}`)
      .then(({ data }) => setLogs(data.results ?? data))
      .catch(() => notify("Failed to load audit log.", "danger"))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  return (
    <Container fluid>
      <Row>
        <Col md={12}>
          <Card>
            <Card.Header>
              <div className="d-flex justify-content-between align-items-center flex-wrap" style={{ gap: 8 }}>
                <div>
                  <Card.Title as="h4">Audit Log</Card.Title>
                  <p className="card-category">Full history of admin actions</p>
                </div>
                <Form.Control
                  as="select" size="sm" style={{ width: 200 }}
                  value={filter}
                  onChange={(e) => { setFilter(e.target.value); load(e.target.value); }}
                >
                  <option value="">All actions</option>
                  <optgroup label="Forms">
                    <option value="form_created">Form created</option>
                    <option value="form_published">Form published</option>
                    <option value="form_closed">Form closed</option>
                    <option value="form_deleted">Form deleted</option>
                  </optgroup>
                  <optgroup label="Submissions">
                    <option value="sub_approved">Submission approved</option>
                    <option value="sub_rejected">Submission rejected</option>
                    <option value="sub_resynced">Re-synced to Canvas</option>
                  </optgroup>
                  <optgroup label="Canvas">
                    <option value="canvas_synced">Canvas sync succeeded</option>
                    <option value="canvas_failed">Canvas sync failed</option>
                  </optgroup>
                  <optgroup label="Users">
                    <option value="role_changed">Role changed</option>
                    <option value="user_created">User created</option>
                  </optgroup>
                </Form.Control>
              </div>
            </Card.Header>
            <Card.Body className="table-responsive p-0">
              {loading ? (
                <div className="text-center py-4"><div className="spinner-border text-primary" /></div>
              ) : (
                <Table hover style={{ fontSize: 13 }}>
                  <thead>
                    <tr>
                      <th style={{ width: 160 }}>When</th>
                      <th style={{ width: 130 }}>Who</th>
                      <th style={{ width: 180 }}>Action</th>
                      <th>Target</th>
                      <th>Detail</th>
                      <th style={{ width: 120 }}>IP</th>
                    </tr>
                  </thead>
                  <tbody>
                    {logs.length === 0 && (
                      <tr><td colSpan={6} className="text-center text-muted py-4">No audit entries yet.</td></tr>
                    )}
                    {logs.map((entry) => (
                      <tr key={entry.id}>
                        <td style={{ color: "#888", fontSize: 12 }}>
                          {new Date(entry.created_at).toLocaleString()}
                        </td>
                        <td style={{ fontWeight: 500 }}>{entry.actor_name}</td>
                        <td>
                          <Badge
                            variant={ACTION_VARIANT[entry.action] || "secondary"}
                            style={{ fontSize: 11 }}
                          >
                            <i className={`${ACTION_ICON[entry.action] || "nc-icon nc-bell-55"} mr-1`}
                              style={{ fontSize: 10 }} />
                            {entry.action_label}
                          </Badge>
                        </td>
                        <td>
                          <span style={{ fontSize: 12, color: "#555" }}>
                            {entry.target_type && (
                              <Badge variant="light" style={{ marginRight: 4, fontSize: 10 }}>
                                {entry.target_type}
                              </Badge>
                            )}
                            {entry.target_repr}
                          </span>
                        </td>
                        <td>
                          {Object.keys(entry.detail || {}).length > 0 && (
                            <span style={{ fontSize: 11, color: "#888", fontFamily: "monospace" }}>
                              {Object.entries(entry.detail)
                                .map(([k, v]) => `${k}: ${v}`)
                                .join(" · ")}
                            </span>
                          )}
                        </td>
                        <td style={{ fontSize: 11, color: "#aaa" }}>{entry.ip_address || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              )}
            </Card.Body>
          </Card>
        </Col>
      </Row>
    </Container>
  );
}

export default AuditLog;
