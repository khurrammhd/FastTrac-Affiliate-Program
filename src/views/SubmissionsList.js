import React, { useEffect, useState } from "react";
import { useHistory, useLocation } from "react-router-dom";
import {
  Container, Row, Col, Card, Table, Button, Badge,
  Modal, Form,
} from "react-bootstrap";
import { useSubmissions } from "context/SubmissionsContext";
import { useNotification } from "hooks/useNotification";

const STATUS_VARIANT = { pending: "warning", approved: "info", rejected: "danger", synced: "success", failed: "danger" };

function useQuery() {
  return new URLSearchParams(useLocation().search);
}

function SubmissionsList() {
  const history = useHistory();
  const query = useQuery();
  const { submissions, loading, loadSubmissions, approve, reject } = useSubmissions();
  const { notify } = useNotification();
  const [statusFilter, setStatusFilter] = useState(query.get("status") || "");
  const [rejectModal, setRejectModal] = useState({ show: false, id: null });
  const [rejectReason, setRejectReason] = useState("");
  const [actionId, setActionId] = useState(null);

  const getSubmissionRank = (submission) => {
    const submittedAt = Date.parse(submission?.submitted_at || "");
    if (!Number.isNaN(submittedAt)) return submittedAt;
    return Number(submission?.id) || 0;
  };

  const groupedByForm = submissions.reduce((acc, submission) => {
    const formTitle = submission.form_title || "Untitled form";
    if (!acc[formTitle]) {
      acc[formTitle] = [];
    }
    acc[formTitle].push(submission);
    return acc;
  }, {});

  const groupedEntries = Object.entries(groupedByForm)
    .map(([formTitle, rows]) => {
      const sortedRows = [...rows].sort(
        (a, b) => getSubmissionRank(b) - getSubmissionRank(a)
      );
      const latestRank = sortedRows[0] ? getSubmissionRank(sortedRows[0]) : 0;
      return [formTitle, sortedRows, latestRank];
    })
    .sort((a, b) => b[2] - a[2])
    .map(([formTitle, rows]) => [formTitle, rows]);

  useEffect(() => {
    const params = {};
    if (statusFilter) params.status = statusFilter;
    if (query.get("form")) params.form = query.get("form");
    loadSubmissions(params);
  }, [statusFilter]);

  const handleApprove = async (id) => {
    setActionId(id);
    try {
      await approve(id);
      notify("Approved. Canvas sync will run in the background when available.", "success");
    } catch { notify("Approval failed.", "danger"); }
    setActionId(null);
  };

  const handleReject = async () => {
    if (!rejectReason.trim()) return;
    setActionId(rejectModal.id);
    try {
      await reject(rejectModal.id, rejectReason);
      notify("Submission rejected.", "warning");
      setRejectModal({ show: false, id: null });
      setRejectReason("");
    } catch { notify("Rejection failed.", "danger"); }
    setActionId(null);
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
                  {groupedEntries.map(([formTitle, rows]) => (
                    <Card key={formTitle} className="mb-3" style={{ border: "1px solid #e6ecf5", boxShadow: "none" }}>
                      <Card.Header>
                        <div className="d-flex justify-content-between align-items-center">
                          <strong>{formTitle}</strong>
                          <Badge variant="primary" style={{ fontSize: 12 }}>{rows.length} submission{rows.length !== 1 ? "s" : ""}</Badge>
                        </div>
                      </Card.Header>
                      <Card.Body className="table-responsive p-0">
                        <Table striped hover className="mb-0">
                          <thead>
                            <tr>
                              <th>#</th>
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
                                <td style={{ fontWeight: 500 }}>{s.submitter_name || "—"}</td>
                                <td>{s.submitter_email || "—"}</td>
                                <td><Badge variant={STATUS_VARIANT[s.status] || "secondary"}>{s.status}</Badge></td>
                                <td><small className={s.canvas_user_id ? "text-success" : "text-muted"}>{s.canvas_user_id || "—"}</small></td>
                                <td>{new Date(s.submitted_at).toLocaleDateString()}</td>
                                <td>
                                  <Button variant="info" size="sm" className="btn-fill mr-1" onClick={() => history.push(`/admin/submissions/${s.id}`)} title="View">
                                    <i className="nc-icon nc-alert-circle-i" />
                                  </Button>
                                  {s.status === "pending" && (
                                    <>
                                      <Button variant="success" size="sm" className="btn-fill mr-1" onClick={() => handleApprove(s.id)} disabled={actionId === s.id} title="Approve">
                                        {actionId === s.id ? <span className="spinner-border spinner-border-sm" /> : <i className="nc-icon nc-check-2" />}
                                      </Button>
                                      <Button variant="danger" size="sm" className="btn-fill" onClick={() => setRejectModal({ show: true, id: s.id })} title="Reject">
                                        <i className="nc-icon nc-simple-remove" />
                                      </Button>
                                    </>
                                  )}
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

      <Modal show={rejectModal.show} onHide={() => setRejectModal({ show: false, id: null })}>
        <Modal.Header closeButton><Modal.Title>Reject Submission</Modal.Title></Modal.Header>
        <Modal.Body>
          <Form.Group>
            <Form.Label>Reason for rejection</Form.Label>
            <Form.Control as="textarea" rows={3} value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} placeholder="Please explain why this submission is being rejected…" />
          </Form.Group>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="default" onClick={() => setRejectModal({ show: false, id: null })}>Cancel</Button>
          <Button variant="danger" className="btn-fill" onClick={handleReject} disabled={!rejectReason.trim() || !!actionId}>Reject</Button>
        </Modal.Footer>
      </Modal>
    </Container>
  );
}

export default SubmissionsList;
