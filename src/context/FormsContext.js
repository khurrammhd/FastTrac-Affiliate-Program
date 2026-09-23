import { createContext, useContext, useState, useCallback } from "react";
import {
  fetchForms,
  createForm,
  updateForm,
  deleteForm,
  publishForm,
  closeForm,
  cloneForm,
} from "../api/forms";

const FormsContext = createContext(null);

export function FormsProvider({ children }) {
  const [forms, setForms] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const loadForms = useCallback(async (params) => {
    setLoading(true);
    setError(null);
    try {
      const { data } = await fetchForms(params);
      setForms(data.results ?? data);
      return data;
    } catch (err) {
      setError("Failed to load forms.");
    } finally {
      setLoading(false);
    }
  }, []);

  const addForm = useCallback(async (formData) => {
    const { data } = await createForm(formData);
    setForms((prev) => [data, ...prev]);
    return data;
  }, []);

  const editForm = useCallback(async (id, formData) => {
    const { data } = await updateForm(id, formData);
    setForms((prev) => prev.map((f) => (f.id === id ? data : f)));
    return data;
  }, []);

  const removeForm = useCallback(async (id) => {
    await deleteForm(id);
    setForms((prev) => prev.filter((f) => f.id !== id));
  }, []);

  const publish = useCallback(async (id) => {
    const { data } = await publishForm(id);
    setForms((prev) => prev.map((f) => (f.id === id ? data : f)));
    return data;
  }, []);

  const close = useCallback(async (id) => {
    const { data } = await closeForm(id);
    setForms((prev) => prev.map((f) => (f.id === id ? data : f)));
    return data;
  }, []);

  const clone = useCallback(async (id) => {
    const { data } = await cloneForm(id);
    setForms((prev) => [data, ...prev]);
    return data;
  }, []);

  return (
    <FormsContext.Provider
      value={{ forms, loading, error, loadForms, addForm, editForm, removeForm, publish, close, clone }}
    >
      {children}
    </FormsContext.Provider>
  );
}

export function useForms() {
  return useContext(FormsContext);
}
