/**
 * Dev-only reverse proxy.
 *
 * When you run `npm start`, the CRA dev server (port 3000) serves the React
 * app. Any request that matches the filter below is transparently forwarded
 * to the Django backend on port 8000.
 *
 * Why: ngrok's free plan only exposes one port. We tunnel port 3000 so the
 * public URL serves both the React UI (HTML/JS/CSS) AND the API (proxied to
 * Django under the hood). No CORS issues because everything is same-origin.
 *
 * Special case: /f/:token is BOTH a React browser route (PublicForm.js) AND
 * a Django JSON endpoint (PublicFormView). We disambiguate by the Accept
 * header — HTML navigation stays on React; axios (Accept: application/json)
 * gets proxied to Django.
 *
 * Configure the Django target via BACKEND_TARGET in .env (default :8000).
 */
const { createProxyMiddleware } = require("http-proxy-middleware");

const target = process.env.BACKEND_TARGET || "http://localhost:8000";

// Decide per-request whether it belongs to Django.
function shouldProxy(pathname, req) {
  // Always-backend prefixes
  if (
    pathname.startsWith("/api/") ||
    pathname.startsWith("/admin/") ||
    pathname.startsWith("/media/") ||
    pathname.startsWith("/static/")
  ) {
    return true;
  }
  // /f/* — proxy only when the client is asking for JSON (axios); let React
  // serve the SPA shell for browser navigation so PublicForm can mount.
  if (pathname.startsWith("/f/")) {
    const accept = req.headers.accept || "";
    return accept.includes("application/json");
  }
  return false;
}

module.exports = function (app) {
  app.use(
    createProxyMiddleware(shouldProxy, {
      target,
      changeOrigin: true,
      // Allow self-signed / ngrok certs without crashing the dev server.
      secure: false,
      // ngrok shows a browser warning interstitial on free domains unless
      // this header is present; forward it so Django sees a clean request.
      headers: { "ngrok-skip-browser-warning": "true" },
      logLevel: "warn",
    })
  );
};
