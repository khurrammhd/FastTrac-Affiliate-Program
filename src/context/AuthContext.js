import { createContext, useContext, useState, useEffect, useCallback } from "react";
import { localLogin, fetchMe } from "../api/auth";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser]       = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem("access_token");
    if (!token) { 
      setLoading(false); 
      return; 
    }
    fetchMe()
      .then(({ data }) => {
        setUser(data);
      })
      .catch((err) => {
        localStorage.removeItem("access_token");
        localStorage.removeItem("refresh_token");
        // Interceptor already attempted a refresh and failed — send to login.
        window.location.href = "/login";
      })
      .finally(() => setLoading(false));
  }, []);

  const login = useCallback(async (username, password) => {
    try {
      const { data } = await localLogin(username, password);
      
      if (!data.tokens || !data.tokens.access) {
        return { success: false, error: "Invalid server response format" };
      }
      
      localStorage.setItem("access_token",  data.tokens.access);
      localStorage.setItem("refresh_token", data.tokens.refresh);
      
      setUser(data.user);
      return { success: true };
    } catch (err) {
      const msg =
        err.response?.data?.error ||
        err.response?.data?.detail ||
        "Login failed. Please check your credentials.";
      return { success: false, error: msg };
    }
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem("access_token");
    localStorage.removeItem("refresh_token");
    localStorage.removeItem("canvas_token");
    setUser(null);
  }, []);

  const handleCanvasCallback = useCallback((tokens, userData) => {
    if (!tokens || !tokens.access) {
      return;
    }
    localStorage.setItem("access_token",  tokens.access);
    localStorage.setItem("refresh_token", tokens.refresh);
    localStorage.setItem("canvas_token",  userData.canvas?.access_token || "");
    setUser(userData);
  }, []);

  const ROLE_LEVEL = { superadmin:4, admin:3, reviewer:2, viewer:1, staff:1 };
  const level = ROLE_LEVEL[user?.role] || 0;

  const hasPermission = useCallback((perm) => {
    const granted = new Set(user?.permissions || []);
    if (granted.has(perm)) return true;

    const roleFallback = {
      view_forms: 1,
      view_submissions: 1,
      review_submissions: 2,
      manage_forms: 3,
      sync_canvas: 3,
      manage_users: 3,
      manage_roles: 4,
      superadmin: 4,
    };
    const requiredLevel = roleFallback[perm];
    return requiredLevel ? level >= requiredLevel : false;
  }, [level, user]);

  return (
    <AuthContext.Provider value={{
      user, setUser, loading,
      isAuthenticated: !!user,
      isSuperAdmin: level >= 4,
      isAdmin:      level >= 3,
      isReviewer:   level >= 2,
      isViewer:     level >= 1,
      hasPermission, login, logout, handleCanvasCallback,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
