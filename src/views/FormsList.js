import React, { useEffect } from "react";
import { useHistory } from "react-router-dom";
import { Container, Row, Col, Card, Table, Button, Badge } from "react-bootstrap";
import { useForms } from "context/FormsContext";
import { useNotification } from "hooks/useNotification";

const STATUS_VARIANT = { draft: "secondary", published: "success", closed: "danger" };

function FormsList() {
  const history = useHistory();
  const { forms, loading, loadForms, publish, close, removeForm } = useForms();
  const { notify } = useNotification();

  useEffect(() => { loadForms(); }, []);

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

  const copyLink = (publicUrl) => {
    navigator.clipboard.writeText(window.location.origin + publicUrl);
    notify("Public link copied to clipboard.", "info");
  };

  return (
    <Container fluid>
      <Row>
        <Col md={12}>
          <Card>
            <Card.Header>
              <div className="d-flex justify-content-between align-items-center">
                <div>
                  <Card.Title as="h4">Forms</Card.Title>
                  <p className="card-category">Manage your registration forms</p>
                </div>
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
            </Card.Header>
            <Card.Body className="table-responsive p-0">
              {loading ? (
                <div className="text-center py-4">
                  <div className="spinner-border text-primary" />
                </div>
              ) : (
                <Table striped hover>
                  <thead>
                    <tr>
                      <th>Title</th>
                      <th>Status</th>
                      <th>Canvas Course</th>
                      <th>Created</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {forms.length === 0 && (
                      <tr>
                        <td colSpan={5} className="text-center text-muted py-3">
                          No forms yet. Create your first one!
                        </td>
                      </tr>
                    )}
                    {forms.map((form) => (
                      <tr key={form.id}>
                        <td>
                          <div style={{ fontWeight: 500 }}>{form.title}</div>
                          {form.enable_captcha && (
                            <Badge
                              variant="info"
                              style={{ marginTop: 6, background: "#e8f5e9", color: "#2e7d32", border: "1px solid #a5d6a7" }}
                            >
                              Captcha enabled
                            </Badge>
                          )}
                        </td>
                        <td>
                          <Badge variant={STATUS_VARIANT[form.status] || "secondary"}>
                            {form.status}
                          </Badge>
                        </td>
                        <td>{form.canvas_course_name || "—"}</td>
                        <td>{new Date(form.created_at).toLocaleDateString()}</td>
                        <td>
                          <Button
                            variant="info"
                            size="sm"
                            className="btn-fill mr-1"
                            onClick={() => history.push(`/admin/forms/${form.id}/edit`)}
                            title="Edit"
                          >
                            <i className="nc-icon nc-ruler-pencil" />
                          </Button>

                          {form.status === "draft" && (
                            <Button
                              variant="success"
                              size="sm"
                              className="btn-fill mr-1"
                              onClick={() => handlePublish(form.id)}
                              title="Publish"
                            >
                              <i className="nc-icon nc-send" />
                            </Button>
                          )}

                          {form.status === "published" && (
                            <>
                              <Button
                                variant="warning"
                                size="sm"
                                className="btn-fill mr-1"
                                onClick={() => handleClose(form.id)}
                                title="Close form"
                              >
                                <i className="nc-icon nc-lock-circle-open" />
                              </Button>
                              <Button
                                variant="default"
                                size="sm"
                                className="btn-fill mr-1"
                                onClick={() => copyLink(form.public_url)}
                                title="Copy public link"
                              >
                                <i className="nc-icon nc-single-copy-04" />
                              </Button>
                            </>
                          )}

                          <Button
                            variant="danger"
                            size="sm"
                            className="btn-fill"
                            onClick={() => handleDelete(form.id)}
                            title="Delete"
                          >
                            <i className="nc-icon nc-simple-remove" />
                          </Button>
                        </td>
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

export default FormsList;
