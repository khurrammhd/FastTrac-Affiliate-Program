import { createContext, useContext, useState, useEffect, useCallback, useRef } from "react";
import { fetchNotifications, markNotificationRead, markAllNotificationsRead } from "api/notifications";
import { useAuth } from "context/AuthContext";

const NotificationsContext = createContext(null);

const POLL_INTERVAL = 30000; // 30 seconds

export function NotificationsProvider({ children }) {
  const { isAuthenticated } = useAuth();
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount]     = useState(0);
  const intervalRef = useRef(null);

  const load = useCallback(async () => {
    if (!isAuthenticated) return;
    try {
      const { data } = await fetchNotifications();
      setNotifications(data.results || []);
      setUnreadCount(data.unread_count || 0);
    } catch {
      // silently ignore polling errors
    }
  }, [isAuthenticated]);

  useEffect(() => {
    load();
    intervalRef.current = setInterval(load, POLL_INTERVAL);
    return () => clearInterval(intervalRef.current);
  }, [load]);

  const markRead = useCallback(async (id) => {
    try {
      await markNotificationRead(id);
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, is_read: true } : n))
      );
      setUnreadCount((c) => Math.max(0, c - 1));
    } catch { /* ignore */ }
  }, []);

  const markAllRead = useCallback(async () => {
    try {
      await markAllNotificationsRead();
      setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
      setUnreadCount(0);
    } catch { /* ignore */ }
  }, []);

  return (
    <NotificationsContext.Provider value={{ notifications, unreadCount, load, markRead, markAllRead }}>
      {children}
    </NotificationsContext.Provider>
  );
}

export function useNotifications() {
  return useContext(NotificationsContext);
}
