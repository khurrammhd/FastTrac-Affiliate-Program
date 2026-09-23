import React, { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { Container, Row, Col, Card, Form, Button, Alert } from "react-bootstrap";
import { fetchPublicForm, submitPublicForm } from "api/forms";

const THEME_PRIMARY = "#F76B1C";
const THEME_SECONDARY = "#9B9EA0";

function loadRecaptcha(siteKey) {
  if (!siteKey) {
    return Promise.reject(new Error("Missing reCAPTCHA site key."));
  }

  if (window.grecaptcha && window.grecaptcha.render) {
    return Promise.resolve(window.grecaptcha);
  }

  if (window.__publicFormRecaptchaPromise) {
    return window.__publicFormRecaptchaPromise;
  }

  window.__publicFormRecaptchaPromise = new Promise((resolve, reject) => {
    let attempts = 0;

    const waitForRecaptcha = () => {
      if (window.grecaptcha && window.grecaptcha.render) {
        resolve(window.grecaptcha);
        return;
      }

      attempts += 1;
      if (attempts > 100) {
        reject(new Error("Failed to initialize reCAPTCHA."));
        return;
      }

      window.setTimeout(waitForRecaptcha, 100);
    };

    window.__publicFormRecaptchaOnload = waitForRecaptcha;

    const existing = document.querySelector('script[data-recaptcha="true"]');
    if (existing) {
      waitForRecaptcha();
      return;
    }

    const script = document.createElement("script");
    script.src = "https://www.google.com/recaptcha/api.js?onload=__publicFormRecaptchaOnload&render=explicit";
    script.async = true;
    script.defer = true;
    script.dataset.recaptcha = "true";
    script.onerror = () => reject(new Error("Failed to load reCAPTCHA."));
    document.body.appendChild(script);
  }).finally(() => {
    delete window.__publicFormRecaptchaOnload;
  });

  return window.__publicFormRecaptchaPromise;
}

// Display-only field types that don't collect user input.
const LAYOUT_TYPES = ["heading", "paragraph", "divider"];
const isLayout = (t) => LAYOUT_TYPES.includes(t);

// Map our field types to native HTML input types for the default renderer.
const HTML_INPUT_TYPE = {
  text: "text", email: "email", phone: "tel", password: "password", url: "url",
  number: "number", range: "range", date: "date", time: "time",
  "datetime-local": "datetime-local", color: "color", hidden: "hidden",
};

function PublicForm() {
  const { token } = useParams();
  const [form, setForm] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [values, setValues] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [submitError, setSubmitError] = useState(null);
  const [captchaToken, setCaptchaToken] = useState("");
  const [captchaReady, setCaptchaReady] = useState(false);
  const [captchaLoadError, setCaptchaLoadError] = useState(null);

  useEffect(() => {
    fetchPublicForm(token)
      .then(({ data }) => {
        setForm(data);
        const init = {};
        data.fields.forEach((f) => {
          if (isLayout(f.field_type)) return;              // no value for layout blocks
          if (f.field_type === "checkbox") init[f.id] = [];
          else if (f.field_type === "range") init[f.id] = "50";
          else init[f.id] = "";
        });
        setValues(init);
      })
      .catch((err) => {
        setError(
          err.response?.status === 410 ? "This form is closed." :
          err.response?.status === 404 ? "Form not found." : "Failed to load form."
        );
      })
      .finally(() => setLoading(false));
  }, [token]);

  useEffect(() => {
    if (!form?.captcha_enabled || !form?.captcha_site_key) return undefined;

    let mounted = true;
    let widgetId = null;
    setCaptchaLoadError(null);
    setCaptchaReady(false);
    setCaptchaToken("");

    loadRecaptcha(form.captcha_site_key)
      .then((grecaptcha) => {
        if (!mounted || !grecaptcha) return;
        const container = document.getElementById("public-form-recaptcha");
        if (!container || container.childElementCount > 0) {
          setCaptchaReady(true);
          return;
        }
        widgetId = grecaptcha.render("public-form-recaptcha", {
          sitekey: form.captcha_site_key,
          callback: (tokenValue) => {
            if (mounted) setCaptchaToken(tokenValue);
          },
          "expired-callback": () => {
            if (mounted) setCaptchaToken("");
          },
          "error-callback": () => {
            if (mounted) {
              setCaptchaToken("");
              setCaptchaLoadError("Captcha could not be loaded. Please refresh and try again.");
            }
          },
        });
        window.__publicFormRecaptchaWidgetId = widgetId;
        setCaptchaReady(true);
      })
      .catch(() => {
        if (mounted) {
          setCaptchaLoadError("Captcha could not be loaded. Please refresh and try again.");
        }
      });

    return () => {
      mounted = false;
    };
  }, [form]);

  const handleChange = (id, val) => setValues((v) => ({ ...v, [id]: val }));

  const handleCheckbox = (id, opt, checked) =>
    setValues((v) => ({
      ...v,
      [id]: checked ? [...(v[id] || []), opt] : (v[id] || []).filter((o) => o !== opt),
    }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitError(null);
    for (const f of form.fields) {
      if (isLayout(f.field_type)) continue;            // layout blocks don't collect input
      const val = values[f.id];
      const empty = Array.isArray(val)
        ? val.length === 0
        : (val === undefined || val === null || String(val).trim() === "");
      if (f.is_required && empty) { setSubmitError(`"${f.label}" is required.`); return; }
    }
    if (form.captcha_enabled && !captchaToken) {
      setSubmitError("Please complete the captcha.");
      return;
    }
    let submitterEmail = "", submitterName = "";
    form.fields.forEach((f) => {
      if (f.canvas_field_mapping === "email") submitterEmail = values[f.id] || "";
      if (f.canvas_field_mapping === "name")  submitterName  = values[f.id] || "";
    });
    setSubmitting(true);
    try {
      await submitPublicForm({
        form: form.id,
        data: values,
        submitter_email: submitterEmail,
        submitter_name: submitterName,
        captcha_token: captchaToken,
      });
      setSubmitted(true);
    } catch (err) {
      const message =
        err.response?.data?.captcha_token?.[0] ||
        err.response?.data?.detail ||
        "Submission failed. Please try again.";
      setSubmitError(message);
      if (form.captcha_enabled && window.grecaptcha && window.__publicFormRecaptchaWidgetId !== undefined) {
        window.grecaptcha.reset(window.__publicFormRecaptchaWidgetId);
        setCaptchaToken("");
      }
    } finally { setSubmitting(false); }
  };

  const renderField = (field) => {
    const val = values[field.id];
    switch (field.field_type) {
      case "textarea":
        return <Form.Control as="textarea" rows={4} placeholder={field.placeholder} value={val} onChange={(e) => handleChange(field.id, e.target.value)} required={field.is_required} />;
      case "select":
        return (
          <Form.Control as="select" value={val} onChange={(e) => handleChange(field.id, e.target.value)} required={field.is_required}>
            <option value="">— Select —</option>
            {(field.field_options || []).map((o) => <option key={o}>{o}</option>)}
          </Form.Control>
        );
      case "radio":
        return (field.field_options || []).map((o) => (
          <Form.Check key={o} type="radio" id={`${field.id}-${o}`} label={o} value={o} checked={val === o} onChange={(e) => handleChange(field.id, e.target.value)} />
        ));
      case "checkbox":
        return (field.field_options || []).map((o) => (
          <Form.Check key={o} type="checkbox" id={`${field.id}-${o}`} label={o} checked={(val || []).includes(o)} onChange={(e) => handleCheckbox(field.id, o, e.target.checked)} />
        ));
      case "file":
        return <Form.Control type="file" onChange={(e) => handleChange(field.id, e.target.files?.[0]?.name || "")} required={field.is_required} />;
      case "range":
        return (
          <div>
            <Form.Control type="range" min={0} max={100} value={val || 50} onChange={(e) => handleChange(field.id, e.target.value)} />
            <small className="text-muted">Value: {val || 50}</small>
          </div>
        );
      default:
        return (
          <Form.Control
            type={HTML_INPUT_TYPE[field.field_type] || "text"}
            placeholder={field.placeholder}
            value={val}
            onChange={(e) => handleChange(field.id, e.target.value)}
            required={field.is_required}
          />
        );
    }
  };

  // Render for layout blocks (no Form.Group wrapper, no label).
  const renderLayoutBlock = (field) => {
    if (field.field_type === "heading") {
      return (
        <div key={field.id} style={{ marginBottom: 16 }}>
          <h5 style={{ margin: 0, fontWeight: 600 }}>{field.label}</h5>
          {field.help_text && <p className="text-muted" style={{ fontSize: 13, margin: "2px 0 0" }}>{field.help_text}</p>}
        </div>
      );
    }
    if (field.field_type === "paragraph") {
      return (
        <p key={field.id} style={{ fontSize: 13, color: "#555", marginBottom: 14, whiteSpace: "pre-wrap" }}>
          {field.label}
        </p>
      );
    }
    if (field.field_type === "divider") {
      return <hr key={field.id} style={{ margin: "12px 0 18px", borderTop: "1px solid #e0e0e0" }} />;
    }
    return null;
  };

  if (loading) return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#f4f3ef" }}>
      <div className="spinner-border text-primary" />
    </div>
  );

  if (error) return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", background: "#f4f3ef" }}>
      <Container><Row className="justify-content-center"><Col md={5}>
        <Card className="text-center"><Card.Body className="py-5">
          <i className="nc-icon nc-simple-remove" style={{ fontSize: 48, color: THEME_PRIMARY }} />
          <h4 className="mt-3">Form Unavailable</h4>
          <p className="text-muted">{error}</p>
        </Card.Body></Card>
      </Col></Row></Container>
    </div>
  );

  if (submitted) return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", background: "#f4f3ef" }}>
      <Container><Row className="justify-content-center"><Col md={5}>
        <Card className="text-center"><Card.Body className="py-5">
          <i className="nc-icon nc-check-2" style={{ fontSize: 56, color: THEME_SECONDARY }} />
          <h4 className="mt-3">Thank you!</h4>
          <p className="text-muted">Your registration has been received. You will be notified once it has been reviewed.</p>
        </Card.Body></Card>
      </Col></Row></Container>
    </div>
  );

  return (
    <div style={{ minHeight: "100vh", background: "#f4f3ef", padding: "40px 0" }}>
      <Container>
        <Row className="justify-content-center">
          <Col md={7} lg={6}>
            <Card>
              <Card.Header
                style={{
                  background: `linear-gradient(60deg, ${THEME_PRIMARY}, ${THEME_SECONDARY})`,
                  borderRadius: "6px 6px 0 0",
                  padding: "20px 24px",
                }}
              >
                <h4 style={{ color: "#fff", margin: 0, fontWeight: 500 }}>{form.title}</h4>
                {form.description && (
                  <p style={{ color: "rgba(255,255,255,0.8)", margin: "6px 0 0", fontSize: 13 }}>
                    {form.description}
                  </p>
                )}
              </Card.Header>
              <Card.Body style={{ padding: "24px" }}>
                <Form onSubmit={handleSubmit}>
                  {form.fields.map((field) => {
                    if (isLayout(field.field_type)) return renderLayoutBlock(field);
                    if (field.field_type === "hidden") {
                      // Hidden fields submit their configured placeholder/default as the value.
                      return (
                        <input
                          key={field.id}
                          type="hidden"
                          value={values[field.id] ?? field.placeholder ?? ""}
                          onChange={() => {}}
                        />
                      );
                    }
                    return (
                      <Form.Group key={field.id}>
                        <Form.Label style={{ fontWeight: 500, fontSize: 14 }}>
                          {field.label}
                          {field.is_required && <span className="text-danger ml-1">*</span>}
                        </Form.Label>
                        {renderField(field)}
                        {field.help_text && <Form.Text className="text-muted">{field.help_text}</Form.Text>}
                      </Form.Group>
                    );
                  })}

                  {submitError && <Alert variant="danger" style={{ fontSize: 13 }}>{submitError}</Alert>}
                  {captchaLoadError && <Alert variant="danger" style={{ fontSize: 13 }}>{captchaLoadError}</Alert>}

                  {form.captcha_enabled && (
                    <div style={{ marginBottom: 16 }}>
                      <div id="public-form-recaptcha" />
                      {!captchaReady && !captchaLoadError && (
                        <small className="text-muted">Loading captcha…</small>
                      )}
                    </div>
                  )}

                  <Button
                    type="submit"
                    variant="info"
                    className="btn-fill btn-block"
                    disabled={submitting || (form.captcha_enabled && (!captchaReady || !captchaToken))}
                    style={{ marginTop: 8 }}
                  >
                    {submitting ? "Submitting…" : "Submit Registration"}
                  </Button>
                </Form>
              </Card.Body>
            </Card>
          </Col>
        </Row>
      </Container>
    </div>
  );
}

export default PublicForm;
