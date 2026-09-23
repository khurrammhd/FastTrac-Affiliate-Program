import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Route, Switch, Redirect } from "react-router-dom";
import { ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";

import "bootstrap/dist/css/bootstrap.min.css";
import "./assets/css/animate.min.css";
import "./assets/scss/light-bootstrap-dashboard-react.scss?v=2.0.0";
import "./assets/css/demo.css";
import "@fortawesome/fontawesome-free/css/all.min.css";

import AdminLayout    from "layouts/Admin.js";
import Login          from "views/Login.js";
import PublicForm     from "views/PublicForm.js";
import CanvasCallback from "views/CanvasCallback.js";

import { AuthProvider }        from "context/AuthContext";
import { FormsProvider }       from "context/FormsContext";
import { SubmissionsProvider } from "context/SubmissionsContext";

const root = ReactDOM.createRoot(document.getElementById("root"));

root.render(
  <BrowserRouter>
    <AuthProvider>
      <FormsProvider>
        <SubmissionsProvider>
          <ToastContainer />
          <Switch>
            {/* Public routes - no auth, no sidebar */}
            <Route exact path="/login"              component={Login} />
            <Route path="/auth/canvas/callback"     component={CanvasCallback} />
            <Route path="/f/:token"                 component={PublicForm} />

            {/* Protected admin layout */}
            <Route path="/admin" render={(props) => <AdminLayout {...props} />} />

            {/* Default redirect */}
            <Redirect from="/" to="/admin/mis-dashboard" />
          </Switch>
        </SubmissionsProvider>
      </FormsProvider>
    </AuthProvider>
  </BrowserRouter>
);
