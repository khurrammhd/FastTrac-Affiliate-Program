import client from "./client";

// ── Zoom Meeting (per form) ────────────────────────────────────────────────
export const fetchZoomMeeting = (formId) =>
  client.get(`/api/zoom/forms/${formId}/meeting/`);

export const createZoomMeeting = (formId, data) =>
  client.post(`/api/zoom/forms/${formId}/meeting/`, data);

export const updateZoomMeeting = (formId, data) =>
  client.patch(`/api/zoom/forms/${formId}/meeting/`, data);

export const deleteZoomMeeting = (formId) =>
  client.delete(`/api/zoom/forms/${formId}/meeting/`);

export const batchCleanupZoom = (formId) =>
  client.post(`/api/zoom/forms/${formId}/cleanup/`);

// ── Zoom Registrant (per submission) ──────────────────────────────────────
export const fetchZoomRegistrant = (submissionId) =>
  client.get(`/api/zoom/submissions/${submissionId}/registrant/`);

export const registerZoomSubmission = (submissionId) =>
  client.post(`/api/zoom/submissions/${submissionId}/registrant/`);

export const removeZoomRegistrant = (submissionId) =>
  client.delete(`/api/zoom/submissions/${submissionId}/registrant/`);
