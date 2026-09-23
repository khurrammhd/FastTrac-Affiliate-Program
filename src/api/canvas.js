import client from "./client";

export const fetchCanvasCourses = (headers = {}) =>
  client.get("/api/canvas/courses/", {
    headers,
    validateStatus: (status) => (status >= 200 && status < 300) || status === 304,
  });

export const searchCanvasUsers = (q) =>
  client.get("/api/canvas/users/", { params: { q } });
