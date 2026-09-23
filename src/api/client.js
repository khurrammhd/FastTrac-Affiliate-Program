import axios from "axios";

// If REACT_APP_API_URL is set to a non-empty value, use it as the absolute
// backend URL. Otherwise use a relative base ("") so requests go to the same
// origin the app was served from — and, in development, get transparently
// forwarded to Django by src/setupProxy.js. This is what lets a single ngrok
// tunnel (on port 3000) serve both the UI and the API.
const BASE_URL = process.env.REACT_APP_API_URL || "";

const client = axios.create({
  baseURL: BASE_URL,
  headers: {
    "Content-Type": "application/json",
    // ngrok's free plan injects a warning interstitial unless this is set.
    "ngrok-skip-browser-warning": "true",
  },
});

// Attach access token to every request
client.interceptors.request.use((config) => {
  const token = localStorage.getItem("access_token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// On 401 — try to refresh, else force logout
client.interceptors.response.use(
  (response) => response,
  async (error) => {
    const original = error.config;

    if (error.response?.status === 401 && !original._retry) {
      original._retry = true;
      const refresh = localStorage.getItem("refresh_token");

      if (refresh) {
        try {
          const { data } = await axios.post(`${BASE_URL}/api/auth/token/refresh/`, {
            refresh,
          });
          localStorage.setItem("access_token", data.access);
          // When ROTATE_REFRESH_TOKENS=True the server returns a new refresh
          // token — save it so subsequent refreshes don't fail.
          if (data.refresh) {
            localStorage.setItem("refresh_token", data.refresh);
          }
          original.headers.Authorization = `Bearer ${data.access}`;
          return client(original);
        } catch {
          // Refresh also failed — clear tokens
          localStorage.removeItem("access_token");
          localStorage.removeItem("refresh_token");
          window.location.href = "/login";
        }
      }
    }

    return Promise.reject(error);
  }
);

export default client;
