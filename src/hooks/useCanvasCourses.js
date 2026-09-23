import { useState, useEffect } from "react";
import { fetchCanvasCourses } from "../api/canvas";

const CACHE_KEY = "canvasCoursesCache.v1";

function normalizeCourses(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.results)) return payload.results;
  if (Array.isArray(payload?.data)) return payload.data;
  return [];
}

/**
 * Fetches the list of Canvas courses once on mount.
 * Used in the Form Builder to let admins link a form to a course.
 */
export function useCanvasCourses() {
  const [courses, setCourses] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const cachedRaw = localStorage.getItem(CACHE_KEY);
    let cached = null;
    if (cachedRaw) {
      try {
        cached = JSON.parse(cachedRaw);
      } catch {
        cached = null;
      }
    }

    if (cached?.data) {
      const warm = normalizeCourses(cached.data)
        .filter((c) => c?.id !== undefined && c?.id !== null)
        .map((c) => ({
          id: String(c.id),
          name: c.name || c.course_code || `Course ${c.id}`,
          course_code: c.course_code || "",
        }));
      setCourses(warm);
    }

    setLoading(true);
    setError("");
    const conditionalHeaders = {};
    if (cached?.etag) conditionalHeaders["If-None-Match"] = cached.etag;
    if (cached?.lastModified) conditionalHeaders["If-Modified-Since"] = cached.lastModified;

    fetchCanvasCourses(conditionalHeaders)
      .then(({ data, status, headers }) => {
        if (status === 304) {
          if (cached?.data) return;
          setError("Courses cache miss after 304 response. Please refresh.");
          return;
        }
        const normalized = normalizeCourses(data)
          .filter((c) => c?.id !== undefined && c?.id !== null)
          .map((c) => ({
            id: String(c.id),
            name: c.name || c.course_code || `Course ${c.id}`,
            course_code: c.course_code || "",
          }));
        setCourses(normalized);
        localStorage.setItem(
          CACHE_KEY,
          JSON.stringify({
            data,
            etag: headers?.etag || "",
            lastModified: headers?.["last-modified"] || "",
            savedAt: Date.now(),
          })
        );
      })
      .catch((err) => {
        setCourses([]);
        if (err?.code === "ECONNABORTED") {
          setError("Canvas request timed out. Please try again.");
          return;
        }
        if (!err?.response) {
          setError(err?.message || "Could not load Canvas courses.");
          return;
        }
        setError(err?.response?.data?.error || "Could not load Canvas courses.");
      })
      .finally(() => setLoading(false));
  }, []);

  return { courses, loading, error };
}
