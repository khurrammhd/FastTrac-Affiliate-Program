import client from "./client";

export const fetchSubmissions = (params) =>
  client.get("/api/submissions/", { params });

export const exportFormSubmissions = (formId) =>
  client.get("/api/submissions/export/", {
    params: { form: formId },
    responseType: "blob",
  });

export const fetchDashboardSummary = (params) =>
  client.get("/api/submissions/summary/", { params });

export const fetchSubmission = (id) =>
  client.get(`/api/submissions/${id}/`);

export const fetchSubmissionCanvasMatches = (id) =>
  client.get(`/api/submissions/${id}/canvas-user-matches/`);

export const deleteSubmission = (id) =>
  client.delete(`/api/submissions/${id}/`);

export const approveSubmission = (id, data = {}) =>
  client.post(`/api/submissions/${id}/approve/`, data);

export const rejectSubmission = (id, reason) =>
  client.post(`/api/submissions/${id}/reject/`, { reason });

export const unrejectSubmission = (id) =>
  client.post(`/api/submissions/${id}/unreject/`);

export const addSubmissionNote = (id, body) =>
  client.post(`/api/submissions/${id}/notes/`, { body });

export const resyncSubmission = (id) =>
  client.post(`/api/submissions/${id}/resync/`);

export const removeSubmissionUser = (id) =>
  client.post(`/api/submissions/${id}/remove-user/`);
