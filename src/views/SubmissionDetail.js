import React, { useEffect, useState } from "react";
import { useParams, useHistory } from "react-router-dom";
import {
  Container, Row, Col, Card, Button, Badge,
  Modal, Form,
} from "react-bootstrap";
import { useSubmissions } from "context/SubmissionsContext";
import { resyncSubmission } from "api/submissions";
import { useNotification } from "hooks/useNotification";

const STATUS_VARIANT = { pending: "warning", approved: "info", rejected: "danger", synced: "success", failed: "danger" };

function SubmissionDetail() {
  const { id } = useParams();
  const history = useHistory();
  const { current, loadSubmission, approve, reject, addNote } = useSubmissions();
  const { notify } = useNotification();

  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(null);
  const [rejectModal, setRejectModal] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [noteText, setNoteText] = useState("");
  const [addingNote, setAddingNote] = useState(false);

  useEffect(() => {
    loadSubmission(id)
      .catch(() => notify("Failed to load submission.", "danger"))
      .finally(() => setLoading(false));
  }, [id]);

  const handleApprove = async () => {
    setActionLoading("approve");
    try {
      await approve(id);
      notify("Approved! Canvas sync triggered.", "success");
    } catch { notify("Approval failed.", "danger"); }
    setActionLoading(null);
  };

  const handleReject = async () => {
    if (!rejectReason.trim()) return;
    setActionLoading("reject");
    try {
      await reject(id, rejectReason);
      notify("Submission rejected.", "warning");
      setRejectModal(false); setRejectReason("");
    } catch { notify("Rejection failed.", "danger"); }
    setActionLoading(null);
  };

  const handleResync = async () => {
    setActionLoading("resync");
    try {
      await resyncSubmission(id);
      notify("Canvas sync re-triggered.", "info");
      await loadSubmission(id);
    } catch { notify("Re-sync failed.", "danger"); }
    setActionLoading(null);
  };

  const handleAddNote = async () => {
    if (!noteText.trim()) return;
    setAddingNote(true);
    try {
      await addNote(id, noteText.trim());
      setNoteText("");
    } catch { notify("Failed to add note.", "danger"); }
    setAddingNote(false);
  };

  if (loading) return <Container fluid><div className="text-center py-5"><div className="spinner-border text-primary" /></div></Container>;
  if (!current) return <Container fluid><p className="text-danger mt-3">Submission not found.</p></Container>;

  const isPending = current.status === "pending";

  return (
    <Container fluid>
      <Row>
        <Col md={8}>
          <Card>
            <Card.Header>
              <div className="d-flex justify-content-between align-items-center">
                <div>
                  <Card.Title as="h4">Submission #{current.id}</Card.Title>
                  <p className="card-category">{current.form_title}</p>
                </div>
                <Badge variant={STATUS_VARIANT[current.status] || "secondary"} style={{ fontSize: 13, padding: "6px 12px" }}>
                  {current.status}
                </Badge>
              </div>
            </Card.Header>
            <Card.Body>
              <h6 className="text-muted mb-3" style={{ textTransform: "uppercase", fontSize: 11, letterSpacing: 1 }}>Submitter</h6>
              <Row>
                <Col sm={3} className="text-muted" style={{ fontSize: 13 }}>Name</Col>
                <Col sm={9} style={{ fontSize: 13, fontWeight: 500 }}>{current.submitter_name || "—"}</Col>
              </Row>
              <hr className="my-2" />
              <Row>
                <Col sm={3} className="text-muted" style={{ fontSize: 13 }}>Email</Col>
                <Col sm={9} style={{ fontSize: 13 }}>{current.submitter_email || "—"}</Col>
              </Row>
              <hr className="my-2" />
              <Row>
                <Col sm={3} className="text-muted" style={{ fontSize: 13 }}>Submitted</Col>
                <Col sm={9} style={{ fontSize: 13 }}>{new Date(current.submitted_at).toLocaleString()}</Col>
              </Row>

              <h6 className="text-muted mt-4 mb-3" style={{ textTransform: "uppercase", fontSize: 11, letterSpacing: 1 }}>Form data</h6>
              {Object.entries(current.data || {}).map(([key, value]) => (
                <React.Fragment key={key}>
                  <Row>
                    <Col sm={3} className="text-muted" style={{ fontSize: 13 }}>Field #{key}</Col>
                    <Col sm={9} style={{ fontSize: 13 }}>{String(value)}</Col>
                  </Row>
                  <hr className="my-2" />
                </React.Fragment>
              ))}

              {(current.canvas_user_id || current.canvas_sync_error) && (
                <>
                  <h6 className="text-muted mt-4 mb-3" style={{ textTransform: "uppercase", fontSize: 11, letterSpacing: 1, color: current.canvas_user_id ? "#43a047" : "#e53935" }}>
                    Canvas sync
                  </h6>
                  {current.canvas_user_id && (
                    <><Row>
                      <Col sm={3} className="text-muted" style={{ fontSize: 13 }}>Canvas user ID</Col>
                      <Col sm={9} className="text-success" style={{ fontSize: 13, fontWeight: 500 }}>{current.canvas_user_id}</Col>
                    </Row><hr className="my-2" /></>
                  )}
                  {current.canvas_synced_at && (
                    <><Row>
                      <Col sm={3} className="text-muted" style={{ fontSize: 13 }}>Synced at</Col>
                      <Col sm={9} style={{ fontSize: 13 }}>{new Date(current.canvas_synced_at).toLocaleString()}</Col>
                    </Row><hr className="my-2" /></>
                  )}
                  {current.canvas_sync_error && (
                    <><Row>
                      <Col sm={3} className="text-muted" style={{ fontSize: 13 }}>Sync error</Col>
                      <Col sm={9} className="text-danger" style={{ fontSize: 13 }}>{current.canvas_sync_error}</Col>
                    </Row><hr className="my-2" /></>
                  )}
                </>
              )}

              {current.rejection_reason && (
                <>
                  <h6 className="text-danger mt-4 mb-2" style={{ textTransform: "uppercase", fontSize: 11, letterSpacing: 1 }}>Rejection reason</h6>
                  <p style={{ fontSize: 13 }}>{current.rejection_reason}</p>
                </>
              )}
            </Card.Body>
            <Card.Footer>
              <Button variant="default" size="sm" onClick={() => history.push("/admin/submissions")}>
                <i className="nc-icon nc-minimal-left mr-1" /> Back to submissions
              </Button>
            </Card.Footer>
          </Card>
        </Col>

        <Col md={4}>
          {isPending && (
            <Card className="mb-3">
              <Card.Header><Card.Title as="h4">Review</Card.Title></Card.Header>
              <Card.Body>
                <Button variant="success" className="btn-fill btn-block mb-2" onClick={handleApprove} disabled={!!actionLoading}>
                  {actionLoading === "approve" ? <span className="spinner-border spinner-border-sm mr-1" /> : <i className="nc-icon nc-check-2 mr-1" />}
                  Approve &amp; sync to Canvas
                </Button>
                <Button variant="danger" className="btn-fill btn-block" onClick={() => setRejectModal(true)} disabled={!!actionLoading}>
                  <i className="nc-icon nc-simple-remove mr-1" />
                  Reject
                </Button>
              </Card.Body>
            </Card>
          )}

          {/* Re-sync button for failed or approved (not yet synced) */}
          {(current.status === "failed" || current.status === "approved") && (
            <Card className="mb-3">
              <Card.Body>
                <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>
                  {current.status === "failed"
                    ? <span className="text-danger"><i className="nc-icon nc-simple-remove mr-1" />Canvas sync failed</span>
                    : <span className="text-info"><i className="nc-icon nc-time-alarm mr-1" />Pending Canvas sync</span>}
                </div>
                {current.canvas_sync_error && (
                  <p style={{ fontSize: 12, color: "#e53935", marginBottom: 10 }}>{current.canvas_sync_error}</p>
                )}
                <Button
                  variant="warning"
                  className="btn-fill btn-block"
                  onClick={handleResync}
                  disabled={actionLoading === "resync"}
                >
                  {actionLoading === "resync"
                    ? <><span className="spinner-border spinner-border-sm mr-1" />Syncing…</>
                    : <><i className="nc-icon nc-refresh-69 mr-1" />Re-sync to Canvas</>}
                </Button>
              </Card.Body>
            </Card>
          )}

          <Card>
            <Card.Header>
              <Card.Title as="h4">Internal notes ({current.notes?.length || 0})</Card.Title>
            </Card.Header>
            <Card.Body>
              {(current.notes || []).map((note) => (
                <div key={note.id} className="mb-3 pb-3" style={{ borderBottom: "1px solid #eee" }}>
                  <div className="d-flex align-items-center mb-1">
                    <div
                      style={{ width: 28, height: 28, borderRadius: "50%", background: "#26c6da", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 600, marginRight: 8, flexShrink: 0 }}
                    >
                      {note.author_name?.[0] || "?"}
                    </div>
                    <div>
                      <strong style={{ fontSize: 12 }}>{note.author_name || "Unknown"}</strong>
                      <span className="text-muted ml-2" style={{ fontSize: 11 }}>{new Date(note.created_at).toLocaleString()}</span>
                    </div>
                  </div>
                  <p className="mb-0" style={{ fontSize: 13, paddingLeft: 36 }}>{note.body}</p>
                </div>
              ))}
              <Form.Control
                as="textarea"
                rows={2}
                placeholder="Add a note…"
                value={noteText}
                onChange={(e) => setNoteText(e.target.value)}
                style={{ fontSize: 13, resize: "none" }}
              />
              <Button
                variant="outline-info"
                size="sm"
                className="btn-block mt-2"
                onClick={handleAddNote}
                disabled={addingNote || !noteText.trim()}
              >
                {addingNote ? "Adding…" : "Add note"}
              </Button>
            </Card.Body>
          </Card>
        </Col>
      </Row>

      <Modal show={rejectModal} onHide={() => setRejectModal(false)}>
        <Modal.Header closeButton><Modal.Title>Reject Submission</Modal.Title></Modal.Header>
        <Modal.Body>
          <Form.Group>
            <Form.Label>Reason for rejection</Form.Label>
            <Form.Control as="textarea" rows={3} value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} />
          </Form.Group>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="default" onClick={() => setRejectModal(false)}>Cancel</Button>
          <Button variant="danger" className="btn-fill" onClick={handleReject} disabled={!rejectReason.trim() || actionLoading === "reject"}>Reject</Button>
        </Modal.Footer>
      </Modal>
    </Container>
  );
}

export default SubmissionDetail;
