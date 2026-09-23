import { useState, useEffect } from "react";
import { fetchCanvasCourses } from "../api/canvas";

/**
 * Fetches the list of Canvas courses once on mount.
 * Used in the Form Builder to let admins link a form to a course.
 */
export function useCanvasCourses() {
  const [courses, setCourses] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    fetchCanvasCourses()
      .then(({ data }) => setCourses(data))
      .catch(() => setCourses([]))
      .finally(() => setLoading(false));
  }, []);

  return { courses, loading };
}
