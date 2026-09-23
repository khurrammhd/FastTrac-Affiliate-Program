import client from "./client";

// Local login endpoint (for development without Canvas)
export const localLogin = (username, password) => {
  console.log("📡 Sending local login request to /api/auth/local-login/");
  return client.post("/api/auth/local-login/", { username, password })
    .then((response) => {
      console.log("📡 Local login response:", response);
      return response;
    })
    .catch((error) => {
      console.error("📡 Local login error:", error);
      throw error;
    });
};

// Canvas login endpoint (requires Canvas OAuth setup)
export const canvasLogin = (username, password) =>
  client.post("/api/auth/login/", { username, password });

export const fetchMe = () =>
  client.get("/api/auth/me/");

export const updateMe = (data) =>
  client.patch("/api/auth/me/", data);

export const fetchUsers = (params) =>
  client.get("/api/auth/users/", { params });

export const updateUser = (id, data) =>
  client.patch(`/api/auth/users/${id}/`, data);

export const deleteUser = (id) =>
  client.delete(`/api/auth/users/${id}/`);
