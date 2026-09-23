import React, { useEffect, useState } from "react";
import { useHistory, useLocation } from "react-router-dom";
import { Container, Row, Col, Card } from "react-bootstrap";
import axios from "axios";
import { useAuth } from "context/AuthContext";

const THEME_PRIMARY = "#F76B1C";
const THEME_SECONDARY = "#9B9EA0";

function CanvasCallback() {
  const history = useHistory();
  const location = useLocation();
  const { handleCanvasCallback } = useAuth();
  const [status, setStatus] = useState("Completing Canvas sign-in…");
  const [errorMsg, setErrorMsg] = useState(null);

  useEffect(() => {
    console.log("🎯 CanvasCallback component mounted");
    console.log("📍 Current URL:", window.location.href);
    
    const params = new URLSearchParams(location.search);
    const code = params.get("code");
    const error = params.get("error");
    const errorDescription = params.get("error_description");

    console.log("📦 URL Parameters:", {
      code: code ? "✓ present" : "✗ missing",
      error: error ? "✓ present" : "✗ missing",
      errorDescription,
    });

    if (error) { 
      console.error("❌ Canvas returned error:", { error, errorDescription });
      setErrorMsg(errorDescription || `Canvas OAuth error: ${error}`); 
      return; 
    }
    if (!code)  { 
      console.error("❌ No authorization code in URL");
      setErrorMsg("No authorisation code received from Canvas."); 
      return; 
    }

    const BASE = (process.env.REACT_APP_API_URL || window.location.origin).trim();
    const redirectUri =
      process.env.REACT_APP_CANVAS_REDIRECT_URI || `${window.location.origin}/auth/canvas/callback/`;
    console.log("🌐 API Base URL:", BASE);
    console.log("📡 Making callback request to:", `${BASE}/api/auth/canvas/callback/`);
    
    axios
      .get(`${BASE}/api/auth/canvas/callback/`, { params: { code, redirect_uri: redirectUri } })
      .then(({ data }) => {
        console.log("✅ Canvas callback response received:", data);
        
        if (!handleCanvasCallback) {
          console.error("❌ handleCanvasCallback is undefined!");
          setErrorMsg("Authentication error: handler not available");
          return;
        }
        
        if (!data.tokens || !data.user) {
          console.error("❌ Invalid response format. Missing tokens or user:", data);
          setErrorMsg("Invalid server response");
          return;
        }

        const userData = {
          ...data.user,
          canvas: data.canvas,
        };
        console.log("📦 Prepared userData:", userData);
        
        try {
          console.log("🔑 Calling handleCanvasCallback...");
          handleCanvasCallback(data.tokens, userData);
          console.log("✅ handleCanvasCallback completed successfully");
          
          // Verify tokens in localStorage
          const savedAccess = localStorage.getItem("access_token");
          const savedRefresh = localStorage.getItem("refresh_token");
          console.log("🔍 localStorage verification:");
          console.log("   - access_token:", savedAccess ? "✓ FOUND (" + savedAccess.substring(0, 20) + "...)" : "✗ NOT FOUND");
          console.log("   - refresh_token:", savedRefresh ? "✓ FOUND (" + savedRefresh.substring(0, 20) + "...)" : "✗ NOT FOUND");
          
          if (savedAccess && savedRefresh) {
            setStatus("Signed in! Redirecting…");
            setTimeout(() => {
              console.log("🚀 Redirecting to dashboard...");
              history.push("/admin/mis-dashboard");
            }, 800);
          } else {
            console.error("❌ Tokens were not saved to localStorage!");
            setErrorMsg("Failed to save authentication tokens");
          }
        } catch (err) {
          console.error("❌ Error in handleCanvasCallback:", err);
          setErrorMsg("Authentication processing failed: " + err.message);
        }
      })
      .catch((err) => {
        console.error("❌ Canvas callback API error:", err);
        console.error("   Status:", err.response?.status);
        console.error("   Data:", err.response?.data);
        setErrorMsg(err.response?.data?.error || "Canvas authentication failed.");
      });
  }, [handleCanvasCallback, history, location]);

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        background: "#f4f3ef",
      }}
    >
      <Container>
        <Row className="justify-content-center">
          <Col md={4}>
            <Card>
              <Card.Header
                style={{
                  background: `linear-gradient(60deg, ${THEME_PRIMARY}, ${THEME_SECONDARY})`,
                  borderRadius: "6px 6px 0 0",
                  padding: "16px 24px",
                }}
              >
                <h5 style={{ color: "#fff", margin: 0 }}>Canvas Sign-In</h5>
              </Card.Header>
              <Card.Body style={{ textAlign: "center", padding: "32px 24px" }}>
                {errorMsg ? (
                  <>
                    <i
                      className="nc-icon nc-simple-remove"
                      style={{ fontSize: 40, color: THEME_PRIMARY, marginBottom: 12 }}
                    />
                    <p style={{ color: THEME_PRIMARY }}>{errorMsg}</p>
                    <a
                      href="/login"
                      style={{ color: THEME_SECONDARY, fontSize: 13 }}
                    >
                      ← Back to login
                    </a>
                  </>
                ) : (
                  <>
                    <div className="spinner-border text-info" role="status" />
                    <p style={{ marginTop: 16, color: "#999", fontSize: 13 }}>
                      {status}
                    </p>
                  </>
                )}
              </Card.Body>
            </Card>
          </Col>
        </Row>
      </Container>
    </div>
  );
}

export default CanvasCallback;
