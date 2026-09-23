import client from "./client";

export const fetchCanvasCourses = () =>
  client.get("/api/canvas/courses/");

export const searchCanvasUsers = (q) =>
  client.get("/api/canvas/users/", { params: { q } });
