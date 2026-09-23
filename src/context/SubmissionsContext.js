import { createContext, useContext, useState, useCallback } from "react";
import {
  fetchSubmissions,
  fetchSubmission,
  deleteSubmission,
  approveSubmission,
  rejectSubmission,
  unrejectSubmission,
  addSubmissionNote,
  removeSubmissionUser,
} from "../api/submissions";

const SubmissionsContext = createContext(null);

export function SubmissionsProvider({ children }) {
  const [submissions, setSubmissions] = useState([]);
  const [current, setCurrent] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [pagination, setPagination] = useState({ count: 0, next: null, previous: null });

  const loadSubmissions = useCallback(async (params) => {
    setLoading(true);
    setError(null);
    try {
      const requestParams = {
        ordering: "-submitted_at",
        ...(params || {}),
      };
      const { data } = await fetchSubmissions(requestParams);
      setSubmissions(data.results ?? data);
      setPagination({ count: data.count, next: data.next, previous: data.previous });
      return data;
    } catch {
      setError("Failed to load submissions.");
    } finally {
      setLoading(false);
    }
  }, []);

  const loadSubmission = useCallback(async (id) => {
    const { data } = await fetchSubmission(id);
    setCurrent(data);
    return data;
  }, []);

  const normalizeId = (value) => Number(value);

  const _updateInList = (id, patch) =>
    setSubmissions((prev) => prev.map((s) => (normalizeId(s.id) === normalizeId(id) ? { ...s, ...patch } : s)));

  const approve = useCallback(async (id, payload = {}) => {
    const requestPayload = typeof payload === "string" ? { note: payload } : (payload || {});
    const { data } = await approveSubmission(id, requestPayload);
    _updateInList(id, data);
    if (normalizeId(current?.id) === normalizeId(id)) setCurrent(data);
    return data;
  }, [current]);

  const reject = useCallback(async (id, reason) => {
    const { data } = await rejectSubmission(id, reason);
    _updateInList(id, data);
    if (normalizeId(current?.id) === normalizeId(id)) setCurrent(data);
    return data;
  }, [current]);

  const unreject = useCallback(async (id) => {
    const { data } = await unrejectSubmission(id);
    _updateInList(id, data);
    if (normalizeId(current?.id) === normalizeId(id)) setCurrent(data);
    return data;
  }, [current]);

  const addNote = useCallback(async (id, body) => {
    const { data } = await addSubmissionNote(id, body);
    if (current?.id === id) {
      setCurrent((prev) => ({ ...prev, notes: [...(prev.notes || []), data] }));
    }
    return data;
  }, [current]);

  const removeSubmission = useCallback(async (id) => {
    await deleteSubmission(id);
    setSubmissions((prev) => prev.filter((s) => normalizeId(s.id) !== normalizeId(id)));
    if (normalizeId(current?.id) === normalizeId(id)) {
      setCurrent(null);
    }
  }, [current]);

  const removeCanvasUser = useCallback(async (id) => {
    const { data } = await removeSubmissionUser(id);
    _updateInList(id, data);
    if (normalizeId(current?.id) === normalizeId(id)) setCurrent(data);
    return data;
  }, [current]);

  return (
    <SubmissionsContext.Provider
      value={{
        submissions, current, loading, error, pagination,
        loadSubmissions, loadSubmission, approve, reject, unreject, addNote, removeSubmission, removeCanvasUser,
      }}
    >
      {children}
    </SubmissionsContext.Provider>
  );
}

export function useSubmissions() {
  return useContext(SubmissionsContext);
}
