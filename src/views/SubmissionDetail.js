import React, { useEffect, useState } from "react";
import { useParams, useHistory } from "react-router-dom";
import {
  Container, Row, Col, Card, Button, Badge, Form,
} from "react-bootstrap";
import { useSubmissions } from "context/SubmissionsContext";
import { useAuth } from "context/AuthContext";
import { resyncSubmission, fetchSubmissionCanvasMatches } from "api/submissions";
import { fetchZoomRegistrant, registerZoomSubmission, removeZoomRegistrant } from "api/zoom";
import { useNotification } from "hooks/useNotification";

const STATUS_VARIANT = { pending: "warning", approved: "info", rejected: "danger", synced: "success", failed: "danger" };

function SubmissionDetail() {
  const { id } = useParams();
  const history = useHistory();
  const { current, loadSubmission, approve, reject, unreject, addNote, removeSubmission } = useSubmissions();
  const { isAdmin, isSuperAdmin, isReviewer } = useAuth();
  const { notify } = useNotification();

  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(null);
  const [noteText, setNoteText] = useState("");
  const [addingNote, setAddingNote] = useState(false);
  const [showMatchModal, setShowMatchModal] = useState(false);
  const [matchData, setMatchData] = useState({ submission_user: null, matches: [] });
  const [selectedMatchId, setSelectedMatchId] = useState(null);
  const [modalLoading, setModalLoading] = useState(false);

  // ── Zoom state ─────────────────────────────────────────────────────
  const [zoomRegistrant, setZoomRegistrant]   = useState(undefined); // undefined = not loaded
  const [zoomActing, setZoomActing]           = useState(false);

  useEffect(() => {
    loadSubmission(id)
      .catch(() => notify("Failed to load submission.", "danger"))
      .finally(() => setLoading(false));
  }, [id]);

  // Load Zoom registrant
  useEffect(() => {
    if (!id) return;
    fetchZoomRegistrant(id)
      .then(({ data }) => setZoomRegistrant(data))
      .catch((err) => {
        if (err?.response?.status === 404) setZoomRegistrant(null);
      });
  }, [id]);

  const finalizeApprove = async (payload = {}) => {
    setActionLoading("approve");
    try {
      await approve(id, payload);
      setShowMatchModal(false);
      notify("Approved! Canvas sync triggered.", "success");
    } catch { notify("Approval failed.", "danger"); }
    setActionLoading(null);
  };

  const handleApprove = async () => {
    setActionLoading("approve");
    try {
      const { data } = await fetchSubmissionCanvasMatches(id);
      const matches = data?.matches || [];
      const lookupUnavailable = !!data?.lookup_unavailable;

      // Always show modal: let admin confirm even if no matches or lookup failed.
      setMatchData({ ...data, lookup_unavailable: lookupUnavailable });
      setSelectedMatchId(matches.length > 0 ? String(matches[0].id) : null);
      setShowMatchModal(true);
    } catch {
      // Fetch itself errored — still show modal in degraded mode.
      setMatchData({
        submission_user: {
          name: current?.submitter_name || "",
          email: current?.submitter_email || "",
        },
        matches: [],
        lookup_unavailable: true,
      });
      setSelectedMatchId(null);
      setShowMatchModal(true);
    } finally {
      setActionLoading(null);
    }
  };

  const handleUseExisting = async () => {
    if (!selectedMatchId) {
      notify("Select a Canvas user first.", "danger");
      return;
    }
    setModalLoading(true);
    await finalizeApprove({ existing_canvas_user_id: selectedMatchId });
    setModalLoading(false);
  };

  const handleReject = async () => {
    const reason = window.prompt("Reason for rejection:", "");
    if (reason === null) return;
    const trimmed = reason.trim();
    if (!trimmed) {
      notify("Rejection reason is required.", "danger");
      return;
    }

    setActionLoading("reject");
    try {
      await reject(id, trimmed);
      notify("Submission rejected.", "warning");
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

  const handleDelete = async () => {
    const ok = window.confirm("Delete this submission permanently? This action cannot be undone.");
    if (!ok) return;
    setActionLoading("delete");
    try {
      await removeSubmission(id);
      notify("Submission deleted.", "warning");
      history.push("/admin/submissions");
    } catch {
      notify("Failed to delete submission.", "danger");
    }
    setActionLoading(null);
  };

  const handleUnreject = async () => {
    setActionLoading("unreject");
    try {
      await unreject(id);
      notify("Rejection reverted. Submission is pending again.", "info");
      await loadSubmission(id);
    } catch {
      notify("Failed to undo rejection.", "danger");
    }
    setActionLoading(null);
  };

  if (loading) return <Container fluid><div className="text-center py-5"><div className="spinner-border text-primary" /></div></Container>;
  if (!current) return <Container fluid><p className="text-danger mt-3">Submission not found.</p></Container>;

  const isPending = current.status === "pending";
  const fieldLabels = current.field_labels || {};

  const renderValue = (value) => {
    if (Array.isArray(value)) return value.join(", ");
    if (value && typeof value === "object") return JSON.stringify(value);
    return String(value);
  };

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
                <Col sm={3} className="text-muted" style={{ fontSize: 13 }}>Course</Col>
                <Col sm={9} style={{ fontSize: 13, fontWeight: 500 }}>{current.canvas_course_name || "—"}</Col>
              </Row>
              <hr className="my-2" />
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
                    <Col sm={3} className="text-muted" style={{ fontSize: 13 }}>{fieldLabels[key] || `Field #${key}`}</Col>
                    <Col sm={9} style={{ fontSize: 13 }}>{renderValue(value)}</Col>
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
              {(isAdmin || isSuperAdmin) && (
                <Button
                  variant="danger"
                  size="sm"
                  className="btn-fill float-right"
                  onClick={handleDelete}
                  disabled={actionLoading === "delete"}
                >
                  {actionLoading === "delete" ? <span className="spinner-border spinner-border-sm mr-1" /> : <i className="nc-icon nc-simple-remove mr-1" />}
                  Delete submission
                </Button>
              )}
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
                <Button variant="danger" className="btn-fill btn-block" onClick={handleReject} disabled={!!actionLoading}>
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

          {current.status === "rejected" && isReviewer && (
            <Card className="mb-3">
              <Card.Body>
                <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10 }}>
                  <span className="text-warning"><i className="nc-icon nc-refresh-69 mr-1" />Marked as rejected</span>
                </div>
                <Button
                  variant="secondary"
                  className="btn-fill btn-block"
                  onClick={handleUnreject}
                  disabled={actionLoading === "unreject"}
                >
                  {actionLoading === "unreject"
                    ? <><span className="spinner-border spinner-border-sm mr-1" />Restoring…</>
                    : <><i className="nc-icon nc-refresh-69 mr-1" />Undo Rejection</>}
                </Button>
              </Card.Body>
            </Card>
          )}

          {/* ZOOM PANEL */}
          {(current.status === "approved" || current.status === "synced") && (
            <Card className="mb-3">
              <Card.Header>
                <Card.Title as="h4" style={{ color: "#2D8CFF" }}>
                  <i className="nc-icon nc-globe-2 mr-2" />Zoom
                </Card.Title>
              </Card.Header>
              <Card.Body>
                {zoomRegistrant === undefined ? (
                  <div className="text-center py-2"><div className="spinner-border spinner-border-sm text-primary" /></div>
                ) : zoomRegistrant === null ? (
                  <>
                    <p style={{ fontSize: 13, color: "#666", marginBottom: 10 }}>
                      {"No Zoom meeting is linked to this form. Open the form in Form Builder to create one."}
                    </p>
                  </>
                ) : zoomRegistrant.status === "registered" ? (
                  <>
                    <div style={{ marginBottom: 8 }}>
                      <Badge style={{ background: "#43a047", color: "#fff", fontSize: 11 }}>Registered</Badge>
                    </div>
                    <div style={{ fontSize: 13, marginBottom: 4 }}>
                      <strong>Personal join URL:</strong>
                    </div>
                    <a
                      href={zoomRegistrant.join_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ fontSize: 13, wordBreak: "break-all" }}
                    >
                      {zoomRegistrant.join_url}
                    </a>
                    <Button
                      variant="danger"
                      size="sm"
                      className="btn-fill btn-block mt-3"
                      onClick={async () => {
                        if (!window.confirm("Remove this registrant from Zoom?")) return;
                        setZoomActing(true);
                        try {
                          await removeZoomRegistrant(id);
                          setZoomRegistrant((prev) => ({ ...prev, status: "removed", join_url: null }));
                          notify("Removed from Zoom.", "warning");
                        } catch { notify("Could not remove.", "danger"); }
                        finally { setZoomActing(false); }
                      }}
                      disabled={zoomActing}
                    >
                      {zoomActing
                        ? <><span className="spinner-border spinner-border-sm mr-1" />Removing…</>
                        : <><i className="nc-icon nc-simple-remove mr-1" />Remove from Zoom</>}
                    </Button>
                  </>
                ) : (
                  <>
                    {zoomRegistrant.status === "failed" && (
                      <div style={{ fontSize: 12, color: "#e53935", marginBottom: 8 }}>
                        {zoomRegistrant.error_message || "Registration failed."}
                      </div>
                    )}
                    {zoomRegistrant.status === "removed" && (
                      <div style={{ fontSize: 12, color: "#888", marginBottom: 8 }}>Previously removed from Zoom.</div>
                    )}
                    <Button
                      variant="primary"
                      size="sm"
                      className="btn-fill btn-block"
                      style={{ background: "#2D8CFF", borderColor: "#2D8CFF" }}
                      onClick={async () => {
                        setZoomActing(true);
                        try {
                          const { data } = await registerZoomSubmission(id);
                          setZoomRegistrant(data);
                          notify("Registered in Zoom. Join URL sent by email.", "success");
                        } catch (err) {
                          notify(err?.response?.data?.error || "Registration failed.", "danger");
                        } finally { setZoomActing(false); }
                      }}
                      disabled={zoomActing}
                    >
                      {zoomActing
                        ? <><span className="spinner-border spinner-border-sm mr-1" />Registering…</>
                        : <><i className="nc-icon nc-globe-2 mr-1" />Register in Zoom</>}
                    </Button>
                  </>
                )}
              </Card.Body>
            </Card>
          )}

          {/* ZOOM PANEL */}
          {(current.status === "approved" || current.status === "synced") && (
            <Card className="mb-3">
              <Card.Header>
                <Card.Title as="h4" style={{ color: "#2D8CFF" }}>
                  <i className="nc-icon nc-globe-2 mr-2" />Zoom
                </Card.Title>
              </Card.Header>
              <Card.Body>
                {zoomRegistrant === undefined ? (
                  <div className="text-center py-2"><div className="spinner-border spinner-border-sm text-primary" /></div>
                ) : zoomRegistrant === null ? (
                  <p style={{ fontSize: 13, color: "#666", marginBottom: 10 }}>
                    {"No Zoom meeting is linked to this form. Open the form in Form Builder to create one."}
                  </p>
                ) : zoomRegistrant.status === "registered" ? (
                  <>
                    <div style={{ marginBottom: 8 }}>
                      <Badge style={{ background: "#43a047", color: "#fff", fontSize: 11 }}>Registered</Badge>
                    </div>
                    <div style={{ fontSize: 13, marginBottom: 4 }}>
                      <strong>Personal join URL:</strong>
                    </div>
                    <a
                      href={zoomRegistrant.join_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ fontSize: 13, wordBreak: "break-all" }}
                    >
                      {zoomRegistrant.join_url}
                    </a>
                    <Button
                      variant="danger"
                      size="sm"
                      className="btn-fill btn-block mt-3"
                      onClick={async () => {
                        if (!window.confirm("Remove this registrant from Zoom?")) return;
                        setZoomActing(true);
                        try {
                          await removeZoomRegistrant(id);
                          setZoomRegistrant((prev) => ({ ...prev, status: "removed", join_url: null }));
                          notify("Removed from Zoom.", "warning");
                        } catch { notify("Could not remove.", "danger"); }
                        finally { setZoomActing(false); }
                      }}
                      disabled={zoomActing}
                    >
                      {zoomActing
                        ? <><span className="spinner-border spinner-border-sm mr-1" />Removing…</>
                        : <><i className="nc-icon nc-simple-remove mr-1" />Remove from Zoom</>}
                    </Button>
                  </>
                ) : (
                  <>
                    {zoomRegistrant.status === "failed" && (
                      <div style={{ fontSize: 12, color: "#e53935", marginBottom: 8 }}>
                        {zoomRegistrant.error_message || "Registration failed."}
                      </div>
                    )}
                    {zoomRegistrant.status === "removed" && (
                      <div style={{ fontSize: 12, color: "#888", marginBottom: 8 }}>Previously removed from Zoom.</div>
                    )}
                    <Button
                      variant="primary"
                      size="sm"
                      className="btn-fill btn-block"
                      style={{ background: "#2D8CFF", borderColor: "#2D8CFF" }}
                      onClick={async () => {
                        setZoomActing(true);
                        try {
                          const { data } = await registerZoomSubmission(id);
                          setZoomRegistrant(data);
                          notify("Registered in Zoom. Join URL sent by email.", "success");
                        } catch (err) {
                          notify(err?.response?.data?.error || "Registration failed.", "danger");
                        } finally { setZoomActing(false); }
                      }}
                      disabled={zoomActing}
                    >
                      {zoomActing
                        ? <><span className="spinner-border spinner-border-sm mr-1" />Registering…</>
                        : <><i className="nc-icon nc-globe-2 mr-1" />Register in Zoom</>}
                    </Button>
                  </>
                )}
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

      {showMatchModal && (
        <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, zIndex: 1050, display: "flex", alignItems: "center", justifyContent: "center" }}>
          {/* Backdrop */}
          <div
            onClick={() => { if (!modalLoading) setShowMatchModal(false); }}
            style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,0.5)" }}
          />
          {/* Dialog */}
          <div style={{ position: "relative", background: "#fff", borderRadius: 8, boxShadow: "0 4px 32px rgba(0,0,0,0.2)", width: "90%", maxWidth: 720, maxHeight: "90vh", display: "flex", flexDirection: "column" }}>
            {/* Header */}
            <div style={{ padding: "16px 20px", borderBottom: "1px solid #dee2e6", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <h5 style={{ margin: 0, fontSize: 18 }}>
                {(matchData.matches || []).length > 0 ? "Potential Existing Canvas User Found" : "Confirm Canvas Enrollment"}
              </h5>
              {!modalLoading && (
                <button onClick={() => setShowMatchModal(false)} style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer", lineHeight: 1, color: "#666" }}>
                  &times;
                </button>
              )}
            </div>
            {/* Body */}
            <div style={{ padding: "20px", overflowY: "auto", flex: 1 }}>
              {matchData.lookup_unavailable && (
                <div style={{ background: "#fff3cd", border: "1px solid #ffc107", borderRadius: 6, padding: "10px 14px", marginBottom: 14, fontSize: 13 }}>
                  <strong>Canvas user lookup unavailable</strong> — could not check if this person already exists.
                  Approving will assign them to the course. If no Canvas account is found, Canvas will send them an email invitation to join.
                </div>
              )}
              <div style={{ display: "flex", gap: 24, flexWrap: "wrap" }}>
                <div style={{ flex: 1, minWidth: 200 }}>
                  <div style={{ textTransform: "uppercase", fontSize: 11, letterSpacing: 1, color: "#6c757d", marginBottom: 8 }}>Submitted form user</div>
                  <div style={{ fontSize: 13, marginBottom: 4 }}>
                    <strong>Name:</strong>{" "}
                    {(matchData.submission_user && matchData.submission_user.name) || (current && current.submitter_name) || "—"}
                  </div>
                  <div style={{ fontSize: 13 }}>
                    <strong>Email:</strong>{" "}
                    {(matchData.submission_user && matchData.submission_user.email) || (current && current.submitter_email) || "—"}
                  </div>
                </div>
                <div style={{ flex: 1, minWidth: 200 }}>
                  <div style={{ textTransform: "uppercase", fontSize: 11, letterSpacing: 1, color: "#6c757d", marginBottom: 8 }}>
                    {(matchData.matches || []).length > 0 ? "Canvas matches" : "Canvas users"}
                  </div>
                  {(matchData.matches || []).length === 0 ? (
                    <p style={{ fontSize: 13, color: "#6c757d", margin: 0 }}>
                      {matchData.lookup_unavailable ? "Could not retrieve Canvas users." : "No existing Canvas user found with this email or name."}
                    </p>
                  ) : (
                    <div style={{ maxHeight: 220, overflowY: "auto", border: "1px solid #eee", borderRadius: 6, padding: 8 }}>
                      {(matchData.matches || []).map(function(match) {
                        var mId = String(match.id);
                        var mName = match.name ? match.name : "Unnamed user";
                        var mEmail = match.primary_email || match.login_id || "No email";
                        var mReasons = Array.isArray(match.match_reasons) ? match.match_reasons : [];
                        return (
                          <div key={mId} style={{ borderBottom: "1px solid #f3f3f3", padding: "8px 0" }}>
                            <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
                              <input
                                type="radio"
                                id={"cm-" + mId}
                                name="canvas-match"
                                value={mId}
                                checked={selectedMatchId === mId}
                                onChange={function() { setSelectedMatchId(mId); }}
                                style={{ marginTop: 3, flexShrink: 0 }}
                              />
                              <label htmlFor={"cm-" + mId} style={{ fontSize: 13, marginBottom: 0, cursor: "pointer" }}>
                                <strong>{mName}</strong>
                                {" (" + mEmail + ")"}
                                {mReasons.length > 0 && (
                                  <span style={{ fontSize: 11, color: "#6c757d", display: "block" }}>
                                    {mReasons.join(" \u2022 ")}
                                  </span>
                                )}
                              </label>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
              <p style={{ fontSize: 12, color: "#6c757d", marginTop: 16, marginBottom: 0 }}>
                {(matchData.matches || []).length > 0
                  ? "Select the matching Canvas user below, then click \"Assign to Course\". If none match, click \"Approve & Enroll\" — Canvas will send this person an invitation email."
                  : "No existing Canvas account found. Clicking \"Approve & Enroll\" will enroll this person by email and Canvas will send them an invitation to register."}
              </p>
            </div>
            {/* Footer */}
            <div style={{ padding: "12px 20px", borderTop: "1px solid #dee2e6", display: "flex", justifyContent: "flex-end", gap: 8, flexWrap: "wrap" }}>
              <Button variant="secondary" onClick={() => setShowMatchModal(false)} disabled={modalLoading}>Cancel</Button>
              {(matchData.matches || []).length > 0 && (
                <Button variant="info" onClick={handleUseExisting} disabled={modalLoading || !selectedMatchId}>
                  {modalLoading ? <span className="spinner-border spinner-border-sm mr-1" /> : null}
                  Assign to Course
                </Button>
              )}
              <Button variant="success" onClick={() => { setModalLoading(true); finalizeApprove({}).finally(() => setModalLoading(false)); }} disabled={modalLoading}>
                {modalLoading ? <span className="spinner-border spinner-border-sm mr-1" /> : null}
                Approve &amp; Enroll
              </Button>
            </div>
          </div>
        </div>
      )}

    </Container>
  );
}

export default SubmissionDetail;
