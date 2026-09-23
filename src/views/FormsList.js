import React, { useEffect, useState, useMemo } from "react";
import { Link, useHistory } from "react-router-dom";
import { Container, Row, Col, Card, Table, Button, Badge, Dropdown, Form } from "react-bootstrap";
import { useForms } from "context/FormsContext";
import { useNotification } from "hooks/useNotification";
import { fetchFormGroups } from "api/forms";

const STATUS_VARIANT = { draft: "secondary", published: "success", closed: "danger" };

function FormsList() {
  const history = useHistory();
  const { forms, loading, loadForms, publish, close, removeForm, clone } = useForms();
  const { notify } = useNotification();
  const [groups, setGroups] = useState([]);
  const [filterGroup, setFilterGroup] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");

  useEffect(() => { loadForms(); }, []);

  useEffect(() => {
    fetchFormGroups()
      .then(({ data }) => setGroups(Array.isArray(data) ? data : data?.results || []))
      .catch(() => setGroups([]));
  }, []);

  const handlePublish = async (id) => {
    try {
      await publish(id);
      notify("Form published successfully.", "success");
    } catch { notify("Failed to publish form.", "danger"); }
  };

  const handleClose = async (id) => {
    try {
      await close(id);
      notify("Form closed.", "warning");
    } catch { notify("Failed to close form.", "danger"); }
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Delete this form? This cannot be undone.")) return;
    try {
      await removeForm(id);
      notify("Form deleted.", "warning");
    } catch { notify("Failed to delete form.", "danger"); }
  };

  const handleClone = async (id) => {
    try {
      const cloned = await clone(id);
      notify(`"${cloned.title}" created as a draft.`, "success");
    } catch { notify("Failed to clone form.", "danger"); }
  };

  const copyLink = (publicUrl) => {
    navigator.clipboard.writeText(window.location.origin + publicUrl);
    notify("Public link copied to clipboard.", "info");
  };

  // Filter forms
  const filtered = useMemo(() => forms.filter((f) => {
    const groupMatch = filterGroup === "all"
      ? true
      : filterGroup === "none"
        ? !f.group
        : String(f.group) === filterGroup;
    const statusMatch = filterStatus === "all" || f.status === filterStatus;
    return groupMatch && statusMatch;
  }), [forms, filterGroup, filterStatus]);

  // Group filtered forms into sections
  const sections = useMemo(() => {
    if (filterGroup !== "all") {
      return [{ key: filterGroup, label: null, forms: filtered }];
    }
    // Build group map
    const groupMap = {};
    groups.forEach((g) => { groupMap[g.id] = g.name; });
    const buckets = {};
    filtered.forEach((f) => {
      const key = f.group ? String(f.group) : "__none__";
      if (!buckets[key]) buckets[key] = [];
      buckets[key].push(f);
    });
    // Order: named groups first (sorted), then ungrouped
    const result = groups
      .filter((g) => buckets[String(g.id)])
      .map((g) => ({ key: String(g.id), label: g.name, forms: buckets[String(g.id)] }));
    if (buckets["__none__"]) {
      result.push({ key: "__none__", label: "Ungrouped", forms: buckets["__none__"] });
    }
    return result;
  }, [filtered, groups, filterGroup]);

  const totalFiltered = filtered.length;

  return (
    <Container fluid>
      <Row>
        <Col md={12}>
          <Card>
            <Card.Header>
              <div className="d-flex justify-content-between align-items-center flex-wrap" style={{ gap: 10 }}>
                <div>
                  <Card.Title as="h4" style={{ marginBottom: 2 }}>Forms</Card.Title>
                  <p className="card-category" style={{ marginBottom: 0 }}>Manage your registration forms</p>
                </div>
                <div className="d-flex align-items-center flex-wrap" style={{ gap: 8 }}>
                  {/* Group filter */}
                  <Form.Control
                    as="select"
                    size="sm"
                    value={filterGroup}
                    onChange={(e) => setFilterGroup(e.target.value)}
                    style={{ width: "auto" }}
                  >
                    <option value="all">All groups</option>
                    <option value="none">Ungrouped</option>
                    {groups.map((g) => (
                      <option key={g.id} value={String(g.id)}>{g.name}</option>
                    ))}
                  </Form.Control>
                  {/* Status filter */}
                  <Form.Control
                    as="select"
                    size="sm"
                    value={filterStatus}
                    onChange={(e) => setFilterStatus(e.target.value)}
                    style={{ width: "auto" }}
                  >
                    <option value="all">All statuses</option>
                    <option value="draft">Draft</option>
                    <option value="published">Published</option>
                    <option value="closed">Closed</option>
                  </Form.Control>
                  <Button
                    variant="primary"
                    size="sm"
                    className="btn-fill"
                    onClick={() => history.push("/admin/forms/new")}
                  >
                    <i className="nc-icon nc-simple-add" style={{ marginRight: 6 }} />
                    New Form
                  </Button>
                </div>
              </div>
            </Card.Header>
            <Card.Body
              className="p-0"
              style={{
                overflowY: "auto",
                overflowX: "hidden",
                height: "min(760px, calc(100vh - 220px))",
                minHeight: 620,
              }}
            >
              {loading ? (
                <div className="text-center py-4">
                  <div className="spinner-border text-primary" />
                </div>
              ) : totalFiltered === 0 ? (
                <div className="text-center text-muted py-4">No forms match the selected filters.</div>
              ) : (
                sections.map((section) => (
                  <div key={section.key}>
                    {/* Section header — shown when grouped */}
                    {filterGroup === "all" && (
                      <div style={{
                        background: "#f8f9fa",
                        borderBottom: "1px solid #e9ecef",
                        borderTop: section.key !== sections[0].key ? "2px solid #e9ecef" : undefined,
                        padding: "8px 18px",
                        display: "flex",
                        alignItems: "center",
                        gap: 10,
                      }}>
                        <i
                          className="nc-icon nc-tag-content"
                          style={{ color: section.key === "__none__" ? "#aaa" : "#43a047", fontSize: 14 }}
                        />
                        <span style={{ fontWeight: 700, fontSize: 13, color: "#444" }}>{section.label}</span>
                        <Badge style={{ background: "#e8f5e9", color: "#2e7d32", border: "1px solid #a5d6a7", fontSize: 11 }}>
                          {section.forms.length} form{section.forms.length !== 1 ? "s" : ""}
                        </Badge>
                      </div>
                    )}
                    <div>
                      <Table striped hover style={{ marginBottom: 0 }}>
                        <thead>
                          <tr>
                            <th>Title</th>
                            <th>Status</th>
                            {filterGroup === "all" && <th>Group</th>}
                            <th>Canvas Course</th>
                            <th>Created</th>
                            <th>Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {section.forms.map((form) => (
                            <tr key={form.id}>
                              <td>
                                <Link
                                  to={`/admin/submissions?form=${form.id}`}
                                  style={{ fontWeight: 500, color: "#26a6d1" }}
                                >
                                  {form.title}
                                </Link>
                                {form.enable_captcha && (
                                  <Badge
                                    style={{ marginTop: 4, background: "#e3f2fd", color: "#1565c0", border: "1px solid #90caf9", fontSize: 10 }}
                                  >
                                    Captcha
                                  </Badge>
                                )}
                              </td>
                              <td>
                                <Badge variant={STATUS_VARIANT[form.status] || "secondary"}>
                                  {form.status}
                                </Badge>
                              </td>
                              {filterGroup === "all" && (
                                <td>
                                  {form.group_name
                                    ? <Badge style={{ background: "#e8f5e9", color: "#2e7d32", border: "1px solid #a5d6a7" }}>{form.group_name}</Badge>
                                    : <span className="text-muted">—</span>}
                                </td>
                              )}
                              <td>{form.canvas_course_name || (form.canvas_course_id ? `Course ${form.canvas_course_id}` : "—")}</td>
                              <td>{new Date(form.created_at).toLocaleDateString()}</td>
                              <td>
                                <Dropdown alignRight>
                                  <Dropdown.Toggle
                                    variant="default"
                                    size="sm"
                                    id={`form-actions-${form.id}`}
                                    style={{ background: "#f5f5f5", border: "1px solid #ddd", padding: "4px 10px" }}
                                  >
                                    <i className="nc-icon nc-settings" />
                                  </Dropdown.Toggle>
                                  <Dropdown.Menu style={{ minWidth: "12rem" }}>
                                    <Dropdown.Item onClick={() => history.push(`/admin/forms/${form.id}/edit`)}>
                                      <i className="nc-icon nc-ruler-pencil mr-2" style={{ color: "#00bcd4" }} />Edit
                                    </Dropdown.Item>

                                    {form.status === "draft" && (
                                      <Dropdown.Item onClick={() => handlePublish(form.id)}>
                                        <i className="nc-icon nc-send mr-2" style={{ color: "#4caf50" }} />Publish
                                      </Dropdown.Item>
                                    )}

                                    {form.status === "published" && (
                                      <>
                                        <Dropdown.Item onClick={() => handleClose(form.id)}>
                                          <i className="nc-icon nc-lock-circle-open mr-2" style={{ color: "#ff9800" }} />Close form
                                        </Dropdown.Item>
                                        <Dropdown.Item onClick={() => copyLink(form.public_url)}>
                                          <i className="nc-icon nc-single-copy-04 mr-2" style={{ color: "#607d8b" }} />Copy public link
                                        </Dropdown.Item>
                                      </>
                                    )}

                                    <Dropdown.Item onClick={() => handleClone(form.id)}>
                                      <i className="nc-icon nc-paper-2 mr-2" style={{ color: "#fb8c00" }} />Clone
                                    </Dropdown.Item>

                                    <Dropdown.Divider />

                                    <Dropdown.Item onClick={() => handleDelete(form.id)} style={{ color: "#e53935" }}>
                                      <i className="nc-icon nc-simple-remove mr-2" />Delete
                                    </Dropdown.Item>
                                  </Dropdown.Menu>
                                </Dropdown>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </Table>
                    </div>
                  </div>
                ))
              )}
            </Card.Body>
          </Card>
        </Col>
      </Row>
    </Container>
  );
}

export default FormsList;
