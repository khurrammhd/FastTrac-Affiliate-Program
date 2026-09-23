import React, { useState } from "react";
import { useHistory } from "react-router-dom";
import { useAuth } from "context/AuthContext";

const THEME_PRIMARY = "#F76B1C";
const THEME_SECONDARY = "#9B9EA0";

function Login() {
  const { login } = useAuth();
  const history   = useHistory();

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState("");
  const [showPass, setShowPass] = useState(false);

  const API_URL = process.env.REACT_APP_API_URL || "http://localhost:8000";

  const handleSubmit = async (e) => {
    e.preventDefault();
    console.log("🔘 Login form submitted");
    setError("");
    if (!username.trim() || !password.trim()) {
      console.warn("⚠️ Missing username or password");
      setError("Please enter your username and password.");
      return;
    }
    console.log("📝 Submitting login form with:", { username, password: "****" });
    setLoading(true);
    const result = await login(username.trim(), password);
    console.log("📝 Login result:", result);
    setLoading(false);
    if (result.success) {
      console.log("✅ Login successful, redirecting to dashboard");
      history.push("/admin/mis-dashboard");
    } else {
      console.warn("❌ Login failed:", result.error);
      setError(result.error || "Login failed.");
    }
  };

  const handleCanvasOAuthLogin = () => {
    // Redirect to Canvas OAuth authorization endpoint
    const clientId = "197770000000000204"; // From Canvas Developer Keys
    const redirectUri = encodeURIComponent(`${API_URL}/api/auth/canvas/callback/`);
    const responseType = "code";
    const scope = encodeURIComponent("url:GET|POST user_info:read");
    
    const canvasAuthUrl = `https://fasttrac.test.instructure.com/login/oauth2/auth?client_id=${clientId}&response_type=${responseType}&redirect_uri=${redirectUri}&scope=${scope}`;
    
    window.location.href = canvasAuthUrl;
  };

  return (
    <div style={{
      minHeight:"100vh", display:"flex", alignItems:"center",
      justifyContent:"center",
      background:`linear-gradient(135deg, ${THEME_SECONDARY}, rgba(155,158,160,0.85), rgba(155,158,160,0.7))`,
    }}>
      <div style={{ width:"100%", maxWidth:420, padding:"0 20px" }}>

        {/* Brand */}
        <div style={{ textAlign:"center", marginBottom:32 }}>
          <div style={{
            width:72, height:72, borderRadius:20, margin:"0 auto 16px",
            background:`linear-gradient(135deg, ${THEME_PRIMARY}, ${THEME_SECONDARY})`,
            display:"flex", alignItems:"center", justifyContent:"center",
            boxShadow:"0 8px 32px rgba(247,107,28,0.3)",
          }}>
            <i className="nc-icon nc-chart-pie-35" style={{ color:"#fff", fontSize:32 }} />
          </div>
          <h3 style={{ color:"#fff", margin:0, fontWeight:600, fontSize:24 }}>FastTrac MIS</h3>
          <p style={{ color:"rgba(255,255,255,0.5)", margin:"6px 0 0", fontSize:13 }}>
            Sign in with your Canvas credentials
          </p>
        </div>

        {/* Card */}
        <div style={{
          background:"rgba(255,255,255,0.97)", borderRadius:16,
          padding:"36px 32px 28px", boxShadow:"0 20px 60px rgba(0,0,0,0.3)",
        }}>
          <h5 style={{ margin:"0 0 4px", fontWeight:600, fontSize:17, color:"#1a1a2e" }}>Welcome back</h5>
          <p style={{ margin:"0 0 24px", fontSize:13, color:"#999" }}>Sign in with Canvas or local credentials</p>

          {error && (
            <div style={{
              background:"rgba(247,107,28,0.12)", border:"1px solid rgba(247,107,28,0.35)", borderRadius:8,
              padding:"10px 14px", marginBottom:18, fontSize:13, color:THEME_PRIMARY,
              display:"flex", alignItems:"flex-start", gap:8,
            }}>
              <i className="nc-icon nc-alert-circle-i" style={{ fontSize:15, marginTop:1, flexShrink:0 }} />
              {error}
            </div>
          )}

          {/* Canvas OAuth Button */}
          <button
            type="button"
            onClick={handleCanvasOAuthLogin}
            style={{
              width:"100%", padding:"13px",
              background:`linear-gradient(135deg, ${THEME_PRIMARY}, ${THEME_SECONDARY})`,
              border:"none", borderRadius:8,
              color:"#fff", fontSize:15, fontWeight:600,
              cursor:"pointer",
              display:"flex", alignItems:"center", justifyContent:"center", gap:10,
              boxShadow:"0 4px 16px rgba(247,107,28,0.35)",
              marginBottom:18,
              transition:"all 0.2s ease",
            }}
            onMouseEnter={(e) => {
              e.target.style.transform = "translateY(-1px)";
              e.target.style.boxShadow = "0 6px 24px rgba(247,107,28,0.45)";
            }}
            onMouseLeave={(e) => {
              e.target.style.transform = "translateY(0)";
              e.target.style.boxShadow = "0 4px 16px rgba(247,107,28,0.35)";
            }}
          >
            <i className="nc-icon nc-cloud-upload-94" style={{ fontSize:16 }} />
            Sign in with Canvas
          </button>

          {/* Divider */}
          <div style={{
            display:"flex", alignItems:"center", margin:"20px 0",
          }}>
            <div style={{ flex:1, height:"1px", background:"#e0e0e0" }} />
            <span style={{ padding:"0 12px", fontSize:12, color:"#999", fontWeight:500 }}>OR</span>
            <div style={{ flex:1, height:"1px", background:"#e0e0e0" }} />
          </div>

          <form onSubmit={handleSubmit}>
            {/* Username */}
            <div style={{ marginBottom:16 }}>
              <label style={{ display:"block", fontSize:12, fontWeight:600, color:"#555", marginBottom:6, textTransform:"uppercase", letterSpacing:"0.5px" }}>
                Username
              </label>
              <div style={{ position:"relative" }}>
                <i className="nc-icon nc-circle-09" style={{
                  position:"absolute", left:12, top:"50%", transform:"translateY(-50%)",
                  color:"#bbb", fontSize:16, pointerEvents:"none",
                }} />
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="e.g. admin or npai@condado.com"
                  autoComplete="username"
                  autoFocus
                  style={{
                    width:"100%", padding:"11px 12px 11px 38px",
                    border:"1.5px solid #e0e0e0", borderRadius:8,
                    fontSize:14, color:"#333", outline:"none",
                    boxSizing:"border-box", background:"#fafafa",
                  }}
                  onFocus={(e) => { e.target.style.borderColor=THEME_PRIMARY; e.target.style.background="#fff"; }}
                  onBlur={(e)  => { e.target.style.borderColor="#e0e0e0"; e.target.style.background="#fafafa"; }}
                />
              </div>
            </div>

            {/* Password */}
            <div style={{ marginBottom:26 }}>
              <label style={{ display:"block", fontSize:12, fontWeight:600, color:"#555", marginBottom:6, textTransform:"uppercase", letterSpacing:"0.5px" }}>
                Password
              </label>
              <div style={{ position:"relative" }}>
                <i className="nc-icon nc-key-25" style={{
                  position:"absolute", left:12, top:"50%", transform:"translateY(-50%)",
                  color:"#bbb", fontSize:16, pointerEvents:"none",
                }} />
                <input
                  type={showPass ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Your password"
                  autoComplete="current-password"
                  style={{
                    width:"100%", padding:"11px 60px 11px 38px",
                    border:"1.5px solid #e0e0e0", borderRadius:8,
                    fontSize:14, color:"#333", outline:"none",
                    boxSizing:"border-box", background:"#fafafa",
                  }}
                  onFocus={(e) => { e.target.style.borderColor=THEME_PRIMARY; e.target.style.background="#fff"; }}
                  onBlur={(e)  => { e.target.style.borderColor="#e0e0e0"; e.target.style.background="#fafafa"; }}
                />
                <button type="button" onClick={() => setShowPass(s => !s)} style={{
                  position:"absolute", right:10, top:"50%", transform:"translateY(-50%)",
                  background:"none", border:"none", cursor:"pointer",
                  color:"#888", fontSize:12, fontWeight:500, padding:"4px 6px",
                }}>
                  {showPass ? "Hide" : "Show"}
                </button>
              </div>
            </div>

            <button type="submit" disabled={loading} style={{
              width:"100%", padding:"13px",
              background: loading ? "rgba(155,158,160,0.45)" : `linear-gradient(135deg, ${THEME_PRIMARY}, ${THEME_SECONDARY})`,
              border:"none", borderRadius:8,
              color: loading ? "#555" : "#fff", fontSize:15, fontWeight:600,
              cursor: loading ? "not-allowed" : "pointer",
              display:"flex", alignItems:"center", justifyContent:"center", gap:10,
              boxShadow: loading ? "none" : "0 4px 16px rgba(247,107,28,0.35)",
            }}>
              {loading ? (
                <>
                  <span style={{
                    width:18, height:18,
                    border:"2.5px solid rgba(0,0,0,0.15)", borderTopColor:"#333",
                    borderRadius:"50%", display:"inline-block",
                    animation:"spin 0.7s linear infinite",
                  }} />
                  Signing in…
                </>
              ) : (
                <><i className="nc-icon nc-send" style={{ fontSize:16 }} /> Sign In</>
              )}
            </button>
          </form>
        </div>

        <p style={{ textAlign:"center", marginTop:20, color:"rgba(255,255,255,0.25)", fontSize:12 }}>
          FastTrac MIS · Kauffman Foundation
        </p>
      </div>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}

export default Login;
