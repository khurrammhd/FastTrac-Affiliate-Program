import React, { useEffect, useState } from "react";
import { useHistory, useLocation } from "react-router-dom";
import {
  Container, Row, Col, Card, Table, Button, Badge, Form, Dropdown,
} from "react-bootstrap";
import { useAuth } from "context/AuthContext";
import { useSubmissions } from "context/SubmissionsContext";
import { useNotification } from "hooks/useNotification";
import { exportFormSubmissions } from "api/submissions";

const STATUS_VARIANT = { pending: "warning", approved: "info", rejected: "danger", synced: "success", failed: "danger" };

function useQuery() {
  return new URLSearchParams(useLocation().search);
}

function SubmissionsList() {
  const history = useHistory();
  const query = useQuery();
  const { submissions, loading, loadSubmissions, approve, reject, unreject, removeSubmission, removeCanvasUser } = useSubmissions();
  const { isAdmin, isSuperAdmin } = useAuth();
  const { notify } = useNotification();
  const [statusFilter, setStatusFilter] = useState(query.get("status") || "");
  const [actionId, setActionId] = useState(null);
  const [exportingFormId, setExportingFormId] = useState(null);

  const getCurrentParams = () => {
    const params = {};
    if (statusFilter) params.status = statusFilter;
    if (query.get("form")) params.form = query.get("form");
    return params;
  };

  const getSubmissionRank = (submission) => {
    const submittedAt = Date.parse(submission?.submitted_at || "");
    if (!Number.isNaN(submittedAt)) return submittedAt;
    return Number(submission?.id) || 0;
  };

  const groupedByForm = submissions.reduce((acc, submission) => {
    const formId = String(submission.form);
    if (!acc[formId]) {
      acc[formId] = {
        title: submission.form_title || "Untitled form",
        rows: [],
      };
    }
    acc[formId].rows.push(submission);
    return acc;
  }, {});

  const groupedEntries = Object.entries(groupedByForm)
    .map(([formId, group]) => {
      const { title: formTitle, rows } = group;
      const sortedRows = [...rows].sort(
        (a, b) => getSubmissionRank(b) - getSubmissionRank(a)
      );
      const latestRank = sortedRows[0] ? getSubmissionRank(sortedRows[0]) : 0;
      return [formId, formTitle, sortedRows, latestRank];
    })
    .sort((a, b) => b[3] - a[3])
    .map(([formId, formTitle, rows]) => [formId, formTitle, rows]);

  useEffect(() => {
    loadSubmissions(getCurrentParams());
  }, [statusFilter]);

  const handleApprove = async (id) => {
    setActionId(id);
    try {
      await approve(id);
      await loadSubmissions(getCurrentParams());
      notify("Approved. Canvas sync will run in the background when available.", "success");
    } catch { notify("Approval failed.", "danger"); }
    setActionId(null);
  };

  const handleReject = async (id) => {
    const reason = window.prompt("Reason for rejection:", "");
    if (reason === null) return;
    const trimmed = reason.trim();
    if (!trimmed) {
      notify("Rejection reason is required.", "danger");
      return;
    }

    setActionId(id);
    try {
      await reject(id, trimmed);
      await loadSubmissions(getCurrentParams());
      notify("Submission rejected.", "warning");
    } catch { notify("Rejection failed.", "danger"); }
    setActionId(null);
  };

  const handleDelete = async (id) => {
    const ok = window.confirm("Delete this submission permanently? This action cannot be undone.");
    if (!ok) return;
    setActionId(id);
    try {
      await removeSubmission(id);
      await loadSubmissions(getCurrentParams());
      notify("Submission deleted.", "warning");
    } catch {
      notify("Failed to delete submission.", "danger");
    }
    setActionId(null);
  };

  const handleUnreject = async (id) => {
    setActionId(id);
    try {
      await unreject(id);
      await loadSubmissions(getCurrentParams());
      notify("Rejection reverted. Submission is pending again.", "info");
    } catch {
      notify("Failed to undo rejection.", "danger");
    }
    setActionId(null);
  };

  const handleRemoveUser = async (s) => {
    const willDeleteAccount = s.canvas_user_precreated === false;
    const message = willDeleteAccount
      ? "This user's Canvas account was created during this course's enrollment process.\n\n" +
        "Removing them will REMOVE them from this course AND PERMANENTLY DELETE their Canvas user account.\n\n" +
        "This cannot be undone. Continue?"
      : "This user already had a Canvas account before this course.\n\n" +
        "Removing them will remove them from this course only. Their Canvas user account will remain active.\n\n" +
        "Continue?";
    const ok = window.confirm(message);
    if (!ok) return;

    setActionId(s.id);
    try {
      const result = await removeCanvasUser(s.id);
      await loadSubmissions(getCurrentParams());
      if (result?.warning) {
        notify(result.warning, "warning");
      } else if (result?.account_removed) {
        notify("User removed from course and Canvas account deleted.", "success");
      } else {
        notify("User removed from course. Canvas account kept active.", "success");
      }
    } catch (err) {
      notify(err?.response?.data?.error || "Failed to remove user.", "danger");
    }
    setActionId(null);
  };

  const handleExport = async (formId, formTitle) => {
    setExportingFormId(formId);
    try {
      const { data } = await exportFormSubmissions(formId);
      const url = window.URL.createObjectURL(new Blob([data], { type: "text/csv;charset=utf-8" }));
      const link = document.createElement("a");
      link.href = url;
      link.download = `${formTitle.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "") || "form"}-submissions.csv`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      notify("Submissions exported.", "success");
    } catch {
      notify("Failed to export submissions.", "danger");
    } finally {
      setExportingFormId(null);
    }
  };

  return (
    <Container fluid>
      <Row>
        <Col md={12}>
          <Card>
            <Card.Header>
              <div className="d-flex justify-content-between align-items-center flex-wrap" style={{ gap: 8 }}>
                <div>
                  <Card.Title as="h4">Submissions</Card.Title>
                  <p className="card-category">Review and approve registrations</p>
                </div>
                <Form.Control
                  as="select"
                  size="sm"
                  style={{ width: 160 }}
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                >
                  <option value="">All statuses</option>
                  <option value="pending">Pending</option>
                  <option value="approved">Approved</option>
                  <option value="rejected">Rejected</option>
                  <option value="synced">Synced</option>
                  <option value="failed">Failed</option>
                </Form.Control>
              </div>
            </Card.Header>
            <Card.Body className="table-responsive p-0">
              {loading ? (
                <div className="text-center py-4"><div className="spinner-border text-primary" /></div>
              ) : (
                <div className="p-3">
                  {groupedEntries.length === 0 && (
                    <div className="text-center text-muted py-3">No submissions found.</div>
                  )}
                  {groupedEntries.map(([formId, formTitle, rows]) => (
                    <Card key={formId} className="mb-3" style={{ border: "1px solid #e6ecf5", boxShadow: "none" }}>
                      <Card.Header>
                        <div className="d-flex justify-content-between align-items-center">
                          <strong>{formTitle}</strong>
                          <div className="d-flex align-items-center" style={{ gap: 8 }}>
                            <Badge variant="primary" style={{ fontSize: 12 }}>{rows.length} submission{rows.length !== 1 ? "s" : ""}</Badge>
                            <Button
                              variant="outline-primary"
                              size="sm"
                              onClick={() => handleExport(formId, formTitle)}
                              disabled={exportingFormId === formId}
                              title="Export submissions as CSV"
                            >
                              {exportingFormId === formId
                                ? <span className="spinner-border spinner-border-sm" />
                                : <i className="nc-icon nc-cloud-download-93" />}
                              <span className="ml-1">Export</span>
                            </Button>
                          </div>
                        </div>
                      </Card.Header>
                      <Card.Body className="table-responsive p-0">
                        <Table striped hover className="mb-0">
                          <thead>
                            <tr>
                              <th>#</th>
                              <th>Course</th>
                              <th>Name</th>
                              <th>Email</th>
                              <th>Status</th>
                              <th>Canvas ID</th>
                              <th>Submitted</th>
                              <th>Actions</th>
                            </tr>
                          </thead>
                          <tbody>
                            {rows.map((s) => (
                              <tr key={s.id}>
                                <td>{s.id}</td>
                                <td style={{ fontSize: 13 }}>{s.canvas_course_name || "—"}</td>
                                <td style={{ fontWeight: 500 }}>{s.submitter_name || "—"}</td>
                                <td>{s.submitter_email || "—"}</td>
                                <td><Badge variant={STATUS_VARIANT[s.status] || "secondary"}>{s.status}</Badge></td>
                                <td><small className={s.canvas_user_id ? "text-success" : "text-muted"}>{s.canvas_user_id || "—"}</small></td>
                                <td>{new Date(s.submitted_at).toLocaleDateString()}</td>
                                <td>
                                  <Dropdown alignRight>
                                    <Dropdown.Toggle
                                      variant="default"
                                      size="sm"
                                      id={`sub-actions-${s.id}`}
                                      style={{ background: "#f5f5f5", border: "1px solid #ddd", padding: "4px 10px" }}
                                    >
                                      {actionId === s.id
                                        ? <span className="spinner-border spinner-border-sm" />
                                        : <i className="nc-icon nc-settings" />}
                                    </Dropdown.Toggle>
                                    <Dropdown.Menu>
                                      <Dropdown.Item onClick={() => history.push(`/admin/submissions/${s.id}`)}>
                                        <i className="nc-icon nc-alert-circle-i mr-2" style={{ color: "#00bcd4" }} />View detail
                                      </Dropdown.Item>

                                      {s.status === "pending" && (
                                        <>
                                          <Dropdown.Item onClick={() => handleApprove(s.id)} disabled={actionId === s.id}>
                                            <i className="nc-icon nc-check-2 mr-2" style={{ color: "#4caf50" }} />Approve
                                          </Dropdown.Item>
                                          <Dropdown.Item onClick={() => handleReject(s.id)} disabled={actionId === s.id}>
                                            <i className="nc-icon nc-simple-remove mr-2" style={{ color: "#ff9800" }} />Reject
                                          </Dropdown.Item>
                                        </>
                                      )}

                                      {s.status === "rejected" && (
                                        <Dropdown.Item onClick={() => handleUnreject(s.id)} disabled={actionId === s.id}>
                                          <i className="nc-icon nc-refresh-69 mr-2" style={{ color: "#607d8b" }} />Undo rejection
                                        </Dropdown.Item>
                                      )}

                                      {(isAdmin || isSuperAdmin) && (
                                        <>
                                          <Dropdown.Divider />
                                          {s.canvas_user_id && (
                                            <Dropdown.Item onClick={() => handleRemoveUser(s)} disabled={actionId === s.id} style={{ color: "#e53935" }}>
                                              <i className="nc-icon nc-badge mr-2" />Remove User
                                            </Dropdown.Item>
                                          )}
                                          <Dropdown.Item onClick={() => handleDelete(s.id)} disabled={actionId === s.id} style={{ color: "#e53935" }}>
                                            <i className="nc-icon nc-simple-delete mr-2" />Delete
                                          </Dropdown.Item>
                                        </>
                                      )}
                                    </Dropdown.Menu>
                                  </Dropdown>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </Table>
                      </Card.Body>
                    </Card>
                  ))}
                </div>
              )}
            </Card.Body>
          </Card>
        </Col>
      </Row>

    </Container>
  );
}

export default SubmissionsList;
