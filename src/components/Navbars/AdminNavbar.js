/*!

=========================================================
* Light Bootstrap Dashboard React - v2.0.1
=========================================================

* Product Page: https://www.creative-tim.com/product/light-bootstrap-dashboard-react
* Copyright 2022 Creative Tim (https://www.creative-tim.com)
* Licensed under MIT (https://github.com/creativetimofficial/light-bootstrap-dashboard-react/blob/master/LICENSE.md)

* Coded by Creative Tim

=========================================================

* The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

*/
import React, { Component } from "react";
import { useLocation, useHistory } from "react-router-dom";
import { Navbar, Container, Nav, Dropdown, Button } from "react-bootstrap";
import { useAuth } from "context/AuthContext";
import { useNotifications } from "context/NotificationsContext";

import routes from "routes.js";

function formatRelativeTime(dateStr) {
  const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (diff < 60)   return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function Header() {
  const location = useLocation();
  const history = useHistory();
  const { user, logout } = useAuth();
  const { notifications, unreadCount, markRead, markAllRead } = useNotifications();
  const mobileSidebarToggle = (e) => {
    e.preventDefault();
    document.documentElement.classList.toggle("nav-open");
    var node = document.createElement("div");
    node.id = "bodyClick";
    node.onclick = function () {
      this.parentElement.removeChild(this);
      document.documentElement.classList.toggle("nav-open");
    };
    document.body.appendChild(node);
  };

  const getBrandText = () => {
    for (let i = 0; i < routes.length; i++) {
      if (location.pathname.indexOf(routes[i].layout + routes[i].path) !== -1) {
        return routes[i].name;
      }
    }
    return "Brand";
  };
  return (
    <Navbar bg="light" expand="lg">
      <Container fluid>
        <div className="d-flex justify-content-center align-items-center ml-2 ml-lg-0">
          <Button
            variant="dark"
            className="d-lg-none btn-fill d-flex justify-content-center align-items-center rounded-circle p-2"
            onClick={mobileSidebarToggle}
          >
            <i className="fas fa-ellipsis-v"></i>
          </Button>
          <Navbar.Brand
            href="#home"
            onClick={(e) => e.preventDefault()}
            className="mr-2"
          >
            {getBrandText()}
          </Navbar.Brand>
        </div>
        <Navbar.Toggle aria-controls="basic-navbar-nav" className="mr-2">
          <span className="navbar-toggler-bar burger-lines"></span>
          <span className="navbar-toggler-bar burger-lines"></span>
          <span className="navbar-toggler-bar burger-lines"></span>
        </Navbar.Toggle>
        <Navbar.Collapse id="basic-navbar-nav">
          <Nav className="nav mr-auto" navbar>
            <Nav.Item>
              <Nav.Link
                data-toggle="dropdown"
                href="#pablo"
                onClick={(e) => e.preventDefault()}
                className="m-0"
              >
                <i className="nc-icon nc-palette"></i>
                <span className="d-lg-none ml-1">Dashboard</span>
              </Nav.Link>
            </Nav.Item>
            <Dropdown as={Nav.Item}>
              <Dropdown.Toggle
                as={Nav.Link}
                data-toggle="dropdown"
                id="dropdown-67443507"
                variant="default"
                className="m-0"
              >
                <i className="nc-icon nc-bell-55"></i>
                {unreadCount > 0 && (
                  <span className="notification">{unreadCount > 99 ? "99+" : unreadCount}</span>
                )}
                <span className="d-lg-none ml-1">Notifications</span>
              </Dropdown.Toggle>
              <Dropdown.Menu style={{ minWidth: 340, maxHeight: 420, overflowY: "auto" }}>
                <div className="d-flex justify-content-between align-items-center px-3 py-2">
                  <strong style={{ fontSize: 13 }}>Notifications</strong>
                  {unreadCount > 0 && (
                    <button
                      className="btn btn-link p-0 text-primary"
                      style={{ fontSize: 12 }}
                      onClick={(e) => { e.stopPropagation(); markAllRead(); }}
                    >
                      Mark all read
                    </button>
                  )}
                </div>
                <Dropdown.Divider className="mt-0 mb-0" />
                {notifications.length === 0 ? (
                  <Dropdown.Item disabled style={{ fontSize: 13, color: "#aaa" }}>
                    No notifications
                  </Dropdown.Item>
                ) : (
                  notifications.slice(0, 10).map((n) => (
                    <Dropdown.Item
                      key={n.id}
                      style={{
                        fontSize: 13,
                        backgroundColor: n.is_read ? "transparent" : "#f0f7ff",
                        whiteSpace: "normal",
                        padding: "10px 16px",
                        borderBottom: "1px solid #f0f0f0",
                      }}
                      onClick={() => {
                        if (!n.is_read) markRead(n.id);
                        if (n.submission_id) history.push(`/admin/submissions/${n.submission_id}`);
                      }}
                    >
                      <div style={{ fontWeight: n.is_read ? 400 : 600, color: "#333" }}>
                        {n.title}
                      </div>
                      <div style={{ color: "#555", marginTop: 2 }}>{n.message}</div>
                      <div style={{ color: "#aaa", fontSize: 11, marginTop: 3 }}>
                        {formatRelativeTime(n.created_at)}
                      </div>
                    </Dropdown.Item>
                  ))
                )}
              </Dropdown.Menu>
            </Dropdown>
            <Nav.Item>
              <Nav.Link
                className="m-0"
                href="#pablo"
                onClick={(e) => e.preventDefault()}
              >
                <i className="nc-icon nc-zoom-split"></i>
                <span className="d-lg-block"> Search</span>
              </Nav.Link>
            </Nav.Item>
          </Nav>
          <Nav className="ml-auto" navbar>
            {user && (
              <Dropdown as={Nav.Item} align="end">
                <Dropdown.Toggle
                  aria-expanded={false}
                  aria-haspopup={true}
                  as={Nav.Link}
                  data-toggle="dropdown"
                  id="userDropdown"
                  variant="default"
                  className="m-0"
                >
                  <i className="nc-icon nc-single-02"></i>
                  <span className="no-icon d-lg-inline ml-2">{user?.first_name || user?.username}</span>
                </Dropdown.Toggle>
                <Dropdown.Menu aria-labelledby="userDropdown">
                  <Dropdown.Item
                    href="/admin/profile"
                    onClick={(e) => {
                      e.preventDefault();
                      history.push("/admin/profile");
                    }}
                  >
                    <i className="nc-icon nc-preferences mr-2"></i>
                    View Profile
                  </Dropdown.Item>
                  <Dropdown.Divider />
                  <Dropdown.Item
                    onClick={(e) => {
                      e.preventDefault();
                      logout();
                      history.push("/login");
                    }}
                  >
                    <i className="nc-icon nc-button-pause mr-2"></i>
                    Logout
                  </Dropdown.Item>
                </Dropdown.Menu>
              </Dropdown>
            )}
          </Nav>
        </Navbar.Collapse>
      </Container>
    </Navbar>
  );
}

export default Header;
