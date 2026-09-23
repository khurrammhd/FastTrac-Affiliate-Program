import client from "./client";

// ── Forms ──────────────────────────────────────────────────────────────────
export const fetchForms = (params) =>
  client.get("/api/forms/", { params });

export const fetchForm = (id) =>
  client.get(`/api/forms/${id}/`);

export const createForm = (data) =>
  client.post("/api/forms/", data);

export const updateForm = (id, data) =>
  client.patch(`/api/forms/${id}/`, data);

export const deleteForm = (id) =>
  client.delete(`/api/forms/${id}/`);

export const publishForm = (id) =>
  client.post(`/api/forms/${id}/publish/`);

export const closeForm = (id) =>
  client.post(`/api/forms/${id}/close/`);

export const cloneForm = (id) =>
  client.post(`/api/forms/${id}/clone/`);

// ── Fields ─────────────────────────────────────────────────────────────────
export const fetchFields = (formId) =>
  client.get(`/api/forms/${formId}/fields/`);

export const createField = (formId, data) =>
  client.post(`/api/forms/${formId}/fields/`, data);

export const updateField = (formId, fieldId, data) =>
  client.patch(`/api/forms/${formId}/fields/${fieldId}/`, data);

export const deleteField = (formId, fieldId) =>
  client.delete(`/api/forms/${formId}/fields/${fieldId}/`);

// ── Public form (no auth) ──────────────────────────────────────────────────
export const fetchPublicForm = (token) =>
  client.get(`/api/forms/public/${token}/`);

export const submitPublicForm = (data) =>
  client.post("/api/submissions/submit/", data);

// ── Form configurations (global reusable option lists) ─────────────────────
export const fetchConfigurationLists = () =>
  client.get("/api/forms/configurations/lists/");

export const createConfigurationList = (data) =>
  client.post("/api/forms/configurations/lists/", data);

export const updateConfigurationList = (id, data) =>
  client.patch(`/api/forms/configurations/lists/${id}/`, data);

export const deleteConfigurationList = (id) =>
  client.delete(`/api/forms/configurations/lists/${id}/`);

// ── Form groups ────────────────────────────────────────────────────────────
export const fetchFormGroups = () =>
  client.get("/api/forms/groups/");

export const createFormGroup = (data) =>
  client.post("/api/forms/groups/", data);

export const updateFormGroup = (id, data) =>
  client.patch(`/api/forms/groups/${id}/`, data);

export const deleteFormGroup = (id) =>
  client.delete(`/api/forms/groups/${id}/`);
