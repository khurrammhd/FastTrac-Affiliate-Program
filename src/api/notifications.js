import client from "./client";

export const fetchNotifications    = ()    => client.get("/api/notifications/");
export const markNotificationRead  = (id)  => client.post(`/api/notifications/${id}/read/`);
export const markAllNotificationsRead = () => client.post("/api/notifications/read-all/");
