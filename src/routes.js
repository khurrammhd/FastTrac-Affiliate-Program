import MISDashboard     from "views/MISDashboard.js";
import FormsList        from "views/FormsList.js";
import FormBuilder      from "views/FormBuilder.js";
import SubmissionsList  from "views/SubmissionsList.js";
import SubmissionDetail from "views/SubmissionDetail.js";
import UserManagement   from "views/UserManagement.js";
// import UserProfile      from "views/UserProfile.js";
import AuditLog         from "views/AuditLog.js";
import ProfilePage      from "views/ProfilePage.js";  // adjust filename to match what you saved
// Order matters: React Router v5 <Switch> picks the first match. Hidden
// sub-routes (/forms/new, /forms/:id/edit, /submissions/:id) MUST come
// before their parent list routes, otherwise the list matches first and
// the builder never renders.
const routes = [
  // ── Hidden sub-routes (no sidebar entry) — listed first on purpose ──
  { path: "/forms/new",       component: FormBuilder,      layout: "/admin", hidden: true, exact: true },
  { path: "/forms/:id/edit",  component: FormBuilder,      layout: "/admin", hidden: true, exact: true },
  { path: "/submissions/:id", component: SubmissionDetail, layout: "/admin", hidden: true, exact: true },

  // ── Sidebar entries ──
  {
    path: "/mis-dashboard",
    name: "Dashboard",
    icon: "nc-icon nc-chart-pie-35",
    component: MISDashboard,
    layout: "/admin",
    exact: true,
  },
  {
    path: "/forms",
    name: "Forms",
    icon: "nc-icon nc-paper-2",
    component: FormsList,
    layout: "/admin",
    exact: true,
  },
  {
    path: "/submissions",
    name: "Submissions",
    icon: "nc-icon nc-notes",
    component: SubmissionsList,
    layout: "/admin",
    exact: true,
  },
  // {
  //   path: "/profile",
  //   name: "My Profile",
  //   icon: "nc-icon nc-circle-09",
  //   component: UserProfile,
  //   layout: "/admin",
  // },
  {
    path: "/users",
    name: "Users",
    icon: "nc-icon nc-badge",
    component: UserManagement,
    layout: "/admin",
    exact: true,
  },
  {
    path: "/audit",
    name: "Audit Log",
    icon: "nc-icon nc-bullet-list-67",
    component: AuditLog,
    layout: "/admin",
    exact: true,
  },
  {
    path: "/profile",
    name: "Profile",
    icon: "fas fa-user-circle",
    component: ProfilePage,
    layout: "/admin",
    exact: true,
  },
];

export default routes;
