import React from "react";
import { Redirect, useLocation } from "react-router-dom";
import { useAuth } from "context/AuthContext";

/**
 * Wraps any admin route.
 *
 * Props:
 *   requiredPermission  string  e.g. "manage_forms" — if omitted, only auth is checked
 *   minRole             string  e.g. "reviewer"     — role-level gate
 */
function ProtectedRoute({ children, requiredPermission, minRole }) {
  const { isAuthenticated, loading, hasPermission, isAdmin, isReviewer, isSuperAdmin, user } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="text-center py-5">
        <div className="spinner-border text-primary" />
      </div>
    );
  }

  // Check both user context AND token in localStorage
  const hasToken = localStorage.getItem("access_token");
  const isReallyAuthenticated = isAuthenticated && hasToken;
  
  if (!isReallyAuthenticated) {
    console.warn("⚠️ Access denied: Not authenticated or missing tokens", { 
      isAuthenticated, 
      hasToken: !!hasToken,
      user: user ? "present" : "missing"
    });
    return <Redirect to={{ pathname: "/login", state: { from: location } }} />;
  }

  if (requiredPermission && !hasPermission(requiredPermission)) {
    return <Redirect to="/admin/mis-dashboard" />;
  }

  const ROLE_LEVEL = { superadmin: 4, admin: 3, reviewer: 2, viewer: 1 };
  if (minRole && (ROLE_LEVEL[user?.role] || 0) < (ROLE_LEVEL[minRole] || 0)) {
    return <Redirect to="/admin/mis-dashboard" />;
  }

  return children;
}

export default ProtectedRoute;
