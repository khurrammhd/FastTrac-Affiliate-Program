import React, { useEffect, useState } from "react";
import { useHistory, useParams } from "react-router-dom";
import {
  Container, Row, Col, Card, Form, Button, Badge,
  InputGroup, Nav,
} from "react-bootstrap";
import { DragDropContext, Droppable, Draggable } from "react-beautiful-dnd";

import { useForms } from "context/FormsContext";
import { useNotification } from "hooks/useNotification";
import { useCanvasCourses } from "hooks/useCanvasCourses";
import { fetchForm } from "api/forms";

// ── Constants ──────────────────────────────────────────────────────────────
// Field groups for the palette. Inputs collect user answers; Layout blocks
// are display-only (heading, paragraph, divider) and not submitted.
const FIELD_TYPES = [
  // ── Text inputs ──
  { value: "text",           label: "Short text",    icon: "nc-icon nc-caps-small",      description: "Single line text",           group: "basic" },
  { value: "textarea",       label: "Long text",     icon: "nc-icon nc-align-left-2",    description: "Multi-line textarea",        group: "basic" },
  { value: "email",          label: "Email",         icon: "nc-icon nc-email-83",        description: "Email with validation",      group: "basic" },
  { value: "phone",          label: "Phone",         icon: "nc-icon nc-mobile",          description: "Phone number",               group: "basic" },
  { value: "password",       label: "Password",      icon: "nc-icon nc-key-25",          description: "Masked input",               group: "basic" },
  { value: "url",            label: "URL",           icon: "nc-icon nc-world-2",         description: "Web address with validation", group: "basic" },

  // ── Numeric / date / time ──
  { value: "number",         label: "Number",        icon: "nc-icon nc-tag-content",     description: "Numeric input",              group: "numeric" },
  { value: "range",          label: "Slider",        icon: "nc-icon nc-sound-wave",      description: "Numeric range slider",       group: "numeric" },
  { value: "date",           label: "Date",          icon: "nc-icon nc-calendar-60",     description: "Date picker",                group: "numeric" },
  { value: "time",           label: "Time",          icon: "nc-icon nc-watch-time",      description: "Time picker",                group: "numeric" },
  { value: "datetime-local", label: "Date & time",   icon: "nc-icon nc-time-alarm",      description: "Date + time picker",         group: "numeric" },

  // ── Choice ──
  { value: "select",         label: "Dropdown",      icon: "nc-icon nc-bullet-list-67",  description: "Single choice list",         group: "choice" },
  { value: "radio",          label: "Radio buttons", icon: "nc-icon nc-satisfied",       description: "Single choice visible",      group: "choice" },
  { value: "checkbox",       label: "Checkboxes",    icon: "nc-icon nc-check-2",         description: "Multiple choices",           group: "choice" },

  // ── Special ──
  { value: "color",          label: "Color",         icon: "nc-icon nc-palette",         description: "Color picker",               group: "special" },
  { value: "file",           label: "File upload",   icon: "nc-icon nc-cloud-upload-94", description: "File attachment",            group: "special" },
  { value: "hidden",         label: "Hidden field",  icon: "nc-icon nc-lock-circle-open", description: "Not visible to user",       group: "special" },

  // ── Layout blocks (display only — no input) ──
  { value: "heading",        label: "Heading",       icon: "nc-icon nc-caps-small",      description: "Section title",              group: "layout" },
  { value: "paragraph",      label: "Paragraph",     icon: "nc-icon nc-paper",           description: "Static text block",          group: "layout" },
  { value: "divider",        label: "Divider",       icon: "nc-icon nc-minimal-right",   description: "Horizontal line",            group: "layout" },
];

const GROUP_LABEL = {
  basic:    "Text",
  numeric:  "Numeric & date",
  choice:   "Choice",
  special:  "Special",
  layout:   "Layout",
};

const CANVAS_MAPPINGS = [
  { value: "",          label: "No mapping" },
  { value: "name",      label: "Canvas: Full name" },
  { value: "email",     label: "Canvas: Email" },
  { value: "login_id",  label: "Canvas: Login ID" },
];

const NEEDS_OPTIONS = ["select", "radio", "checkbox"];
// These types don't collect user input — they render static content.
const LAYOUT_TYPES = ["heading", "paragraph", "divider"];
const isLayout = (t) => LAYOUT_TYPES.includes(t);

const BLANK_FIELD = {
  label: "", field_type: "text", placeholder: "", help_text: "",
  is_required: false, field_options: [], canvas_field_mapping: "",
};

const TYPE_COLOR = {
  text: "#26c6da", textarea: "#26c6da", email: "#ff7043", phone: "#ab47bc",
  password: "#7e57c2", url: "#5c6bc0",
  number: "#66bb6a", range: "#9ccc65", date: "#ffa726",
  time: "#ffb74d", "datetime-local": "#ff8a65",
  select: "#42a5f5", radio: "#ef5350", checkbox: "#26a69a",
  color: "#ec407a", file: "#8d6e63", hidden: "#90a4ae",
  heading: "#455a64", paragraph: "#546e7a", divider: "#78909c",
};

function generateSlug(t) {
  return t.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 60);
}

// ── Field type palette card ────────────────────────────────────────────────
function FieldTypeCard({ type, onAdd }) {
  const [hov, setHov] = useState(false);
  const color = TYPE_COLOR[type.value] || "#26c6da";

  return (
    <div
      title={type.description}
      onClick={() => onAdd(type.value)}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 9,
        padding: "7px 9px",
        marginBottom: 4,
        borderRadius: 6,
        border: `1px solid ${hov ? color : "#e8e8e8"}`,
        background: hov ? "#f8f9fa" : "#fff",
        cursor: "pointer",
        transition: "all 0.15s",
        userSelect: "none",
      }}
    >
      <div
        style={{
          width: 28,
          height: 28,
          borderRadius: 5,
          flexShrink: 0,
          background: color + "22",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <i className={type.icon} style={{ color: color, fontSize: 12 }} />
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: "#333" }}>
          {type.label}
        </div>
        <div style={{ fontSize: 10, color: "#999" }}>{type.description}</div>
      </div>
      <i className="nc-icon nc-simple-add" style={{ color: "#ccc", fontSize: 10 }} />
    </div>
  );
}

// ── Draggable field editor ────────────────────────────────────────────────
function FieldEditor({ field, index, total, onChange, onRemove, dragHandleProps }) {
  const [newOpt, setNewOpt] = useState("");
  const [open, setOpen]     = useState(true);
  const update = (k, v) => onChange(index, { ...field, [k]: v });
  const color  = TYPE_COLOR[field.field_type] || "#26c6da";
  const tInfo  = FIELD_TYPES.find((t) => t.value === field.field_type);

  const addOpt = () => {
    const t = newOpt.trim();
    if (!t) return;
    const opts = Array.isArray(field.field_options) ? [...field.field_options] : [];
    if (!opts.includes(t)) {
      update("field_options", [...opts, t]);
      setNewOpt("");
    }
  };

  return (
    <div style={{
      border: `1.5px solid ${open ? color : "#e8e8e8"}`,
      borderRadius: 8, marginBottom: 10, background: "#fff",
    }}>
      {/* Header */}
      <div style={{
        display: "flex", alignItems: "center", padding: "8px 12px",
        background: open ? color + "11" : "#fafafa", cursor: "pointer",
        borderBottom: open ? `1px solid ${color}33` : "none",
      }}>
        {/* Drag handle */}
        <div
          {...dragHandleProps}
          onClick={(e) => e.stopPropagation()}
          style={{ cursor: "grab", marginRight: 8, color: "#bbb", fontSize: 16, lineHeight: 1 }}
          title="Drag to reorder"
        >
          ⠿
        </div>
        <div
          onClick={() => setOpen((o) => !o)}
          style={{ display: "flex", alignItems: "center", flex: 1 }}
        >
          <div style={{
            width: 20, height: 20, borderRadius: 4, background: color,
            display: "flex", alignItems: "center", justifyContent: "center",
            marginRight: 8, flexShrink: 0,
          }}>
            <i className={tInfo?.icon} style={{ color: "#fff", fontSize: 10 }} />
          </div>
          <span style={{ fontWeight: 500, fontSize: 13, flex: 1 }}>
            {field.label || <em style={{ color: "#aaa", fontWeight: 400 }}>Field {index + 1}</em>}
          </span>
          <Badge style={{ background: color + "22", color, border: `1px solid ${color}44`, fontSize: 10, marginRight: 6 }}>
            {tInfo?.label}
          </Badge>
          {field.is_required && (
            <Badge variant="danger" style={{ fontSize: 10, marginRight: 6 }}>Required</Badge>
          )}
          {field.canvas_field_mapping && (
            <Badge style={{ background: "#e3f2fd", color: "#1565c0", border: "1px solid #90caf9", fontSize: 10, marginRight: 6 }}>
              Canvas
            </Badge>
          )}
        </div>
        <Button
          variant="link" size="sm"
          style={{ padding: "1px 5px", color: "#ef5350" }}
          onClick={() => onRemove(index)}
          title="Remove field"
        >
          <i className="nc-icon nc-simple-remove" style={{ fontSize: 11 }} />
        </Button>
      </div>

      {/* Body */}
      {open && (
        <div style={{ padding: "12px 14px" }}>
          <Row>
            <Col md={isLayout(field.field_type) ? 9 : 5}>
              <Form.Group style={{ marginBottom: 10 }}>
                <Form.Label style={{ fontSize: 11, fontWeight: 600, color: "#666" }}>
                  {field.field_type === "heading"   ? "Heading text *" :
                   field.field_type === "paragraph" ? "Paragraph text *" :
                   field.field_type === "divider"   ? "Label (internal only)" : "Label *"}
                </Form.Label>
                {field.field_type === "paragraph" ? (
                  <Form.Control as="textarea" rows={2} size="sm" value={field.label}
                    placeholder="Type the paragraph that respondents will see"
                    onChange={(e) => update("label", e.target.value)} />
                ) : (
                  <Form.Control size="sm" value={field.label}
                    placeholder={
                      field.field_type === "heading" ? "e.g. Personal Information" :
                      field.field_type === "divider" ? "e.g. After contact info" :
                      "e.g. Full name"
                    }
                    onChange={(e) => update("label", e.target.value)} />
                )}
              </Form.Group>
            </Col>
            <Col md={3}>
              <Form.Group style={{ marginBottom: 10 }}>
                <Form.Label style={{ fontSize: 11, fontWeight: 600, color: "#666" }}>Type</Form.Label>
                <Form.Control as="select" size="sm" value={field.field_type}
                  onChange={(e) => update("field_type", e.target.value)}>
                  {Object.keys(GROUP_LABEL).map((g) => (
                    <optgroup key={g} label={GROUP_LABEL[g]}>
                      {FIELD_TYPES.filter((t) => t.group === g).map((t) => (
                        <option key={t.value} value={t.value}>{t.label}</option>
                      ))}
                    </optgroup>
                  ))}
                </Form.Control>
              </Form.Group>
            </Col>
            {!isLayout(field.field_type) && (
              <Col md={4}>
                <Form.Group style={{ marginBottom: 10 }}>
                  <Form.Label style={{ fontSize: 11, fontWeight: 600, color: "#666" }}>
                    <i className="nc-icon nc-send mr-1" style={{ fontSize: 10, color: "#42a5f5" }} />
                    Canvas mapping
                  </Form.Label>
                  <Form.Control as="select" size="sm" value={field.canvas_field_mapping}
                    onChange={(e) => update("canvas_field_mapping", e.target.value)}>
                    {CANVAS_MAPPINGS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
                  </Form.Control>
                </Form.Group>
              </Col>
            )}
            {!isLayout(field.field_type) && (
              <Col md={5}>
                <Form.Group style={{ marginBottom: 10 }}>
                  <Form.Label style={{ fontSize: 11, fontWeight: 600, color: "#666" }}>Placeholder</Form.Label>
                  <Form.Control size="sm" value={field.placeholder} placeholder="Hint text inside the field"
                    onChange={(e) => update("placeholder", e.target.value)} />
                </Form.Group>
              </Col>
            )}
            <Col md={isLayout(field.field_type) ? 12 : 5}>
              <Form.Group style={{ marginBottom: 10 }}>
                <Form.Label style={{ fontSize: 11, fontWeight: 600, color: "#666" }}>
                  {field.field_type === "heading" ? "Subtitle (optional)" : "Help text"}
                </Form.Label>
                <Form.Control size="sm" value={field.help_text}
                  placeholder={
                    field.field_type === "heading" ? "Subtitle shown under the heading" :
                    field.field_type === "divider" ? "(not used)" :
                    "Shown below the field"
                  }
                  onChange={(e) => update("help_text", e.target.value)}
                  disabled={field.field_type === "divider"} />
              </Form.Group>
            </Col>
            {!isLayout(field.field_type) && (
              <Col md={2} style={{ display: "flex", alignItems: "flex-end", paddingBottom: 11 }}>
                <Form.Check type="switch" id={`req-${index}`}
                  label={<span style={{ fontSize: 12 }}>Required</span>}
                  checked={field.is_required}
                  onChange={(e) => update("is_required", e.target.checked)} />
              </Col>
            )}
          </Row>

          {NEEDS_OPTIONS.includes(field.field_type) && (
            <div style={{ background: "#f8f9fa", border: "1px solid #eee", borderRadius: 6, padding: "10px 12px", marginTop: 4 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: "#666", marginBottom: 8 }}>
                Options ({Array.isArray(field.field_options) ? field.field_options.length : 0})
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginBottom: 8 }}>
                {!Array.isArray(field.field_options) || !field.field_options.length
                  ? <span style={{ fontSize: 11, color: "#aaa" }}>No options yet.</span>
                  : field.field_options.map((opt, i) => (
                    <span key={`${opt}-${i}`} style={{
                      display: "inline-flex", alignItems: "center", background: "#fff",
                      border: "1px solid #ddd", borderRadius: 20, padding: "2px 8px",
                      fontSize: 12, gap: 5,
                    }}>
                      {opt}
                      <span style={{ cursor: "pointer", color: "#ef5350", fontWeight: 700, fontSize: 14, lineHeight: 1 }}
                        onClick={() => {
                          const opts = Array.isArray(field.field_options) ? field.field_options : [];
                          update("field_options", opts.filter((_, j) => j !== i));
                        }}>×</span>
                    </span>
                  ))
                }
              </div>
              <InputGroup size="sm" style={{ maxWidth: 300 }}>
                <Form.Control placeholder="Type option and press Enter…" value={newOpt}
                  onChange={(e) => setNewOpt(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addOpt())} />
                <Button variant="outline-secondary" onClick={addOpt}>+</Button>
              </InputGroup>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Preview ────────────────────────────────────────────────────────────────
// Map our field types to native HTML input types. Fallback is "text".
const HTML_INPUT_TYPE = {
  text: "text", email: "email", phone: "tel", password: "password", url: "url",
  number: "number", range: "range", date: "date", time: "time",
  "datetime-local": "datetime-local", color: "color", hidden: "hidden",
};

function PreviewField({ field }) {
  const isCheckbox = field.field_type === "checkbox";
  const [val, setVal] = useState(
    isCheckbox ? [] : field.field_type === "range" ? 50 : ""
  );
  const toggle = (opt) => setVal((v) => v.includes(opt) ? v.filter((o) => o !== opt) : [...v, opt]);

  // ── Layout-only blocks (heading / paragraph / divider) ──
  if (field.field_type === "heading") {
    return (
      <div style={{ marginBottom: 16 }}>
        <h5 style={{ marginBottom: 2, fontWeight: 600 }}>
          {field.label || <em style={{ color: "#aaa" }}>Untitled heading</em>}
        </h5>
        {field.help_text && <p className="text-muted" style={{ fontSize: 13, margin: 0 }}>{field.help_text}</p>}
      </div>
    );
  }
  if (field.field_type === "paragraph") {
    return (
      <p style={{ marginBottom: 14, fontSize: 13, color: "#555", whiteSpace: "pre-wrap" }}>
        {field.label || <em style={{ color: "#aaa" }}>Paragraph text</em>}
      </p>
    );
  }
  if (field.field_type === "divider") {
    return <hr style={{ margin: "12px 0 18px", borderTop: "1px solid #e0e0e0" }} />;
  }

  // ── Hidden field — shown in preview as a muted stub so the builder can see it exists ──
  if (field.field_type === "hidden") {
    return (
      <div style={{
        marginBottom: 14, padding: "6px 10px", borderRadius: 4,
        background: "#f5f5f5", color: "#888", fontSize: 12,
      }}>
        <i className="nc-icon nc-lock-circle-open mr-1" />
        Hidden field: <strong>{field.label || "(unlabeled)"}</strong>
      </div>
    );
  }

  return (
    <Form.Group style={{ marginBottom: 14 }}>
      <Form.Label style={{ fontWeight: 500, fontSize: 14 }}>
        {field.label || <em style={{ color: "#aaa" }}>Untitled field</em>}
        {field.is_required && <span className="text-danger ml-1">*</span>}
      </Form.Label>
      {field.field_type === "textarea" && (
        <Form.Control as="textarea" rows={3} placeholder={field.placeholder} value={val} onChange={(e) => setVal(e.target.value)} />
      )}
      {field.field_type === "select" && (
        <Form.Control as="select" value={val} onChange={(e) => setVal(e.target.value)}>
          <option value="">— Select —</option>
          {(field.field_options || []).map((o) => <option key={o}>{o}</option>)}
        </Form.Control>
      )}
      {field.field_type === "radio" && (
        <div>
          {!(field.field_options || []).length && <small className="text-muted">Add options in Build tab.</small>}
          {(field.field_options || []).map((o) => (
            <Form.Check key={o} type="radio" name={`prev-${field.label}`} label={o} checked={val === o} onChange={() => setVal(o)} />
          ))}
        </div>
      )}
      {field.field_type === "checkbox" && (
        <div>
          {!(field.field_options || []).length && <small className="text-muted">Add options in Build tab.</small>}
          {(field.field_options || []).map((o) => (
            <Form.Check key={o} type="checkbox" label={o} checked={val.includes(o)} onChange={() => toggle(o)} />
          ))}
        </div>
      )}
      {field.field_type === "file" && <Form.Control type="file" />}
      {field.field_type === "range" && (
        <div>
          <Form.Control type="range" min={0} max={100} value={val || 50} onChange={(e) => setVal(e.target.value)} />
          <small className="text-muted">Value: {val || 50}</small>
        </div>
      )}
      {!["textarea","select","radio","checkbox","file","range"].includes(field.field_type) && (
        <Form.Control
          type={HTML_INPUT_TYPE[field.field_type] || "text"}
          placeholder={field.placeholder} value={val} onChange={(e) => setVal(e.target.value)}
        />
      )}
      {field.help_text && <Form.Text className="text-muted">{field.help_text}</Form.Text>}
    </Form.Group>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────
function FormBuilder() {
  const { id } = useParams();
  const isEdit  = Boolean(id);
  const history = useHistory();
  const { addForm, editForm }   = useForms();
  const { notify }   = useNotification();
  const { courses }             = useCanvasCourses();

  const [title, setTitle]                   = useState("");
  const [description, setDescription]       = useState("");
  const [slug, setSlug]                     = useState("");
  const [slugManual, setSlugManual]         = useState(false);
  const [canvasCourseId, setCanvasCourseId] = useState("");
  const [enableCaptcha, setEnableCaptcha]   = useState(false);
  const [fields, setFields]                 = useState([]);
  const [saving, setSaving]                 = useState(false);
  const [pageLoad, setPageLoad]             = useState(isEdit);
  const [activeTab, setActiveTab]           = useState("build");

  useEffect(() => {
    if (!isEdit) return;
    fetchForm(id)
      .then(({ data }) => {
        setTitle(data.title); setDescription(data.description);
        setSlug(data.slug); setSlugManual(true);
        setCanvasCourseId(data.canvas_course_id || "");
        setEnableCaptcha(Boolean(data.enable_captcha));
        const loadedFields = data.fields?.length ? data.fields.map((f) => {
          const field = { ...BLANK_FIELD, ...f };
          field.field_options = Array.isArray(field.field_options) ? field.field_options : [];
          return field;
        }) : [];
        setFields(loadedFields);
      })
      .catch(() => notify("Failed to load form.", "danger"))
      .finally(() => setPageLoad(false));
  }, [id]);

  useEffect(() => { if (!slugManual) setSlug(generateSlug(title)); }, [title, slugManual]);

  const addField    = (type = "text") => setFields((f) => {
    const needsOptions = NEEDS_OPTIONS.includes(type);
    const uniqueId = `field-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    return [
      ...f,
      {
        ...BLANK_FIELD,
        field_type: type,
        field_options: needsOptions ? [] : BLANK_FIELD.field_options,
        _id: uniqueId,
      },
    ];
  });
  const updateField = (i, u) => setFields((f) => f.map((x, idx) => idx === i ? u : x));
  const removeField = (i)    => setFields((f) => f.filter((_, idx) => idx !== i));

  // ── Drag end handler ─────────────────────────────────────────────────
  const onDragEnd = (result) => {
    if (!result.destination) return;
    const src  = result.source.index;
    const dest = result.destination.index;
    if (src === dest) return;
    const next = Array.from(fields);
    const [moved] = next.splice(src, 1);
    next.splice(dest, 0, moved);
    setFields(next);
  };

  const handleSave = async () => {
    if (!title.trim()) { notify("Form title is required.", "danger"); return; }
    if (!slug.trim())  { notify("URL slug is required.", "danger"); return; }
    // Dividers don't need a label; everything else does.
    if (fields.some((f) => f.field_type !== "divider" && !f.label.trim())) {
      notify("All fields must have a label (except dividers).", "danger"); return;
    }

    const payload = {
      title: title.trim(), description: description.trim(), slug: slug.trim(),
      enable_captcha: enableCaptcha,
      canvas_course_id: canvasCourseId || null,
      fields: fields.map((f, i) => ({ ...f, order: i })),
    };
    setSaving(true);
    try {
      if (isEdit) {
        await editForm(id, payload);
        notify("Form updated.", "success");
      } else {
        const saved = await addForm(payload);
        notify("Form created!", "success");
        setTimeout(() => history.push(`/admin/forms/${saved.id}/edit`), 900);
      }
    } catch (err) {
      notify(err.response?.data?.slug?.[0] || err.response?.data?.detail || "Save failed. Is Django running?", "danger");
    } finally { setSaving(false); }
  };

  if (pageLoad) return <Container fluid><div className="text-center py-5"><div className="spinner-border text-primary" /></div></Container>;

  return (
    <Container fluid>
      <Row>

        {/* ── Field palette ── */}
        <Col md={3} lg={2}>
          <Card style={{ position: "sticky", top: 16 }}>
            <Card.Header style={{ padding: "11px 13px" }}>
              <Card.Title as="h5" style={{ fontSize: 13, marginBottom: 2 }}>
                <i className="nc-icon nc-grid-45 mr-1" style={{ color: "#26c6da" }} /> Field types
              </Card.Title>
              <p className="card-category" style={{ fontSize: 10, marginBottom: 0 }}>Click to add · Drag to reorder</p>
            </Card.Header>
            <Card.Body style={{ padding: "9px 11px" }}>
              {Object.keys(GROUP_LABEL).map((group) => {
                const items = FIELD_TYPES.filter((t) => t.group === group);
                if (!items.length) return null;
                return (
                  <div key={group} style={{ marginBottom: 8 }}>
                    <div style={{
                      fontSize: 9, fontWeight: 700, color: "#999",
                      textTransform: "uppercase", letterSpacing: "0.08em",
                      padding: "4px 2px 3px",
                    }}>
                      {GROUP_LABEL[group]}
                    </div>
                    {items.map((t) => <FieldTypeCard key={t.value} type={t} onAdd={addField} />)}
                  </div>
                );
              })}
            </Card.Body>
          </Card>
        </Col>

        {/* ── Builder + Preview ── */}
        <Col md={9} lg={10}>

          {/* Settings */}
          <Card style={{ marginBottom: 14 }}>
            <Card.Header>
              <div className="d-flex align-items-center" style={{ gap: 8, flexWrap: "wrap" }}>
                <Card.Title as="h4" style={{ marginBottom: 0 }}>{isEdit ? "Edit form" : "New form"}</Card.Title>
                {enableCaptcha && (
                  <Badge style={{ background: "#e8f5e9", color: "#2e7d32", border: "1px solid #a5d6a7" }}>
                    Captcha enabled
                  </Badge>
                )}
              </div>
              <p className="card-category">Configure the form details</p>
            </Card.Header>
            <Card.Body>
              <Row>
                <Col md={5}>
                  <Form.Group style={{ marginBottom: 12 }}>
                    <Form.Label style={{ fontSize: 12, fontWeight: 600 }}>Title *</Form.Label>
                    <Form.Control value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. FastTrac Spring 2025" />
                  </Form.Group>
                </Col>
                <Col md={4}>
                  <Form.Group style={{ marginBottom: 12 }}>
                    <Form.Label style={{ fontSize: 12, fontWeight: 600 }}>URL slug *</Form.Label>
                    <Form.Control value={slug}
                      onChange={(e) => { setSlugManual(true); setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "")); }}
                      placeholder="fasttrack-spring-2025" />
                    <Form.Text className="text-muted" style={{ fontSize: 11 }}>Public URL: /f/{slug || "…"}</Form.Text>
                  </Form.Group>
                </Col>
                <Col md={3}>
                  <Form.Group style={{ marginBottom: 12 }}>
                    <Form.Label style={{ fontSize: 12, fontWeight: 600 }}>Canvas course</Form.Label>
                    <Form.Control as="select" value={canvasCourseId} onChange={(e) => setCanvasCourseId(e.target.value)}>
                      <option value="">— None —</option>
                      {courses.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </Form.Control>
                  </Form.Group>
                </Col>
                <Col md={12}>
                  <Form.Group style={{ marginBottom: 12 }}>
                    <Form.Check
                      type="switch"
                      id="enable-captcha"
                      label={<span style={{ fontSize: 12, fontWeight: 600 }}>Enable captcha on public submissions</span>}
                      checked={enableCaptcha}
                      onChange={(e) => setEnableCaptcha(e.target.checked)}
                    />
                    <Form.Text className="text-muted" style={{ fontSize: 11 }}>
                      Turn this on and save the form. The captcha is shown on the public form page, not inside the builder, and it requires reCAPTCHA site and secret keys in Django.
                    </Form.Text>
                  </Form.Group>
                </Col>
                <Col md={12}>
                  <Form.Group style={{ marginBottom: 0 }}>
                    <Form.Label style={{ fontSize: 12, fontWeight: 600 }}>Description</Form.Label>
                    <Form.Control as="textarea" rows={2} value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      placeholder="Shown at the top of the public form" />
                  </Form.Group>
                </Col>
              </Row>
            </Card.Body>
          </Card>

          {/* Build / Preview tabs */}
          <Card>
            <Card.Header style={{ paddingBottom: 0 }}>
              <div className="d-flex justify-content-between align-items-center flex-wrap" style={{ gap: 8 }}>
                <Nav variant="tabs" style={{ borderBottom: "none" }}>
                  <Nav.Item>
                    <Nav.Link active={activeTab === "build"} onClick={() => setActiveTab("build")} style={{ cursor: "pointer" }}>
                      <i className="nc-icon nc-ruler-pencil mr-1" />Build
                      {fields.length > 0 && (
                        <Badge style={{ background: "#26c6da", color: "#fff", marginLeft: 5, fontSize: 10 }}>{fields.length}</Badge>
                      )}
                    </Nav.Link>
                  </Nav.Item>
                  <Nav.Item>
                    <Nav.Link active={activeTab === "preview"} onClick={() => setActiveTab("preview")} style={{ cursor: "pointer" }}>
                      <i className="nc-icon nc-tv-2 mr-1" />Preview
                    </Nav.Link>
                  </Nav.Item>
                </Nav>
                <div className="d-flex" style={{ gap: 6 }}>
                  <Button variant="default" size="sm" onClick={() => history.push("/admin/forms")}>Cancel</Button>
                  <Button variant="info" size="sm" className="btn-fill" onClick={handleSave} disabled={saving}>
                    {saving
                      ? <><span className="spinner-border spinner-border-sm mr-1" />Saving…</>
                      : <><i className="nc-icon nc-check-2 mr-1" />{isEdit ? "Save changes" : "Create form"}</>}
                  </Button>
                </div>
              </div>
            </Card.Header>

            <Card.Body>

              {/* BUILD TAB — react-beautiful-dnd list */}
              {activeTab === "build" && (
                <>
                  {fields.length === 0 ? (
                    <div style={{
                      textAlign: "center", padding: "44px 24px",
                      border: "2px dashed #e0e0e0", borderRadius: 8, color: "#aaa",
                    }}>
                      <i className="nc-icon nc-paper-2" style={{ fontSize: 44, display: "block", marginBottom: 10 }} />
                      <p style={{ marginBottom: 14 }}>No fields yet. Click a type on the left or drag one here.</p>
                      <Button variant="info" className="btn-fill" size="sm" onClick={() => addField("text")}>
                        <i className="nc-icon nc-simple-add mr-1" />Add first field
                      </Button>
                    </div>
                  ) : (
                    <>
                      <DragDropContext onDragEnd={onDragEnd}>
                        <Droppable
                          droppableId="fields-list"
                          isDropDisabled={false}
                          isCombineEnabled={false}
                          ignoreContainerClipping={false}
                          direction="vertical"
                        >
                          {(provided, snapshot) => (
                            <div
                              ref={provided.innerRef}
                              {...provided.droppableProps}
                              style={{
                                background: snapshot.isDraggingOver ? "#f0f7ff" : "transparent",
                                borderRadius: 8, padding: snapshot.isDraggingOver ? 4 : 0,
                                transition: "background 0.2s",
                                minHeight: 40,
                              }}
                            >
                              {fields.map((field, i) => (
                                <Draggable
                                  key={field._id || i}
                                  draggableId={field._id || `field-${i}`}
                                  index={i}
                                  isDragDisabled={false}
                                >
                                  {(drag, dragSnap) => (
                                    <div
                                      ref={drag.innerRef}
                                      {...drag.draggableProps}
                                      style={{
                                        ...drag.draggableProps.style,
                                        opacity: dragSnap.isDragging ? 0.85 : 1,
                                        boxShadow: dragSnap.isDragging ? "0 4px 16px rgba(0,0,0,0.12)" : "none",
                                        borderRadius: 8,
                                      }}
                                    >
                                      <FieldEditor
                                        field={field}
                                        index={i}
                                        total={fields.length}
                                        onChange={updateField}
                                        onRemove={removeField}
                                        dragHandleProps={drag.dragHandleProps}
                                      />
                                    </div>
                                  )}
                                </Draggable>
                              ))}
                              {provided.placeholder}
                            </div>
                          )}
                        </Droppable>
                      </DragDropContext>
                      <Button variant="outline-info" style={{ width: "100%", borderStyle: "dashed", marginTop: 4 }}
                        onClick={() => addField("text")}>
                        <i className="nc-icon nc-simple-add mr-1" />Add another field
                      </Button>
                    </>
                  )}
                </>
              )}

              {/* PREVIEW TAB */}
              {activeTab === "preview" && (
                <div style={{ maxWidth: 540, margin: "0 auto" }}>
                  <div style={{ background: "linear-gradient(60deg,#26c6da,#00acc1)", borderRadius: "6px 6px 0 0", padding: "20px 22px" }}>
                    <h5 style={{ color: "#fff", margin: 0, fontWeight: 500 }}>{title || "Untitled form"}</h5>
                    {description && <p style={{ color: "rgba(255,255,255,0.8)", margin: "6px 0 0", fontSize: 13 }}>{description}</p>}
                  </div>
                  <div style={{ border: "1px solid #e0e0e0", borderTop: "none", borderRadius: "0 0 6px 6px", padding: "22px" }}>
                    {fields.length === 0
                      ? <p className="text-muted text-center py-3">Add fields in the Build tab.</p>
                      : <>
                          {fields.map((field, i) => <PreviewField key={i} field={field} />)}
                          <Button variant="info" className="btn-fill btn-block" style={{ marginTop: 8 }} disabled>
                            Submit Registration
                          </Button>
                        </>
                    }
                  </div>
                </div>
              )}

            </Card.Body>
          </Card>

        </Col>
      </Row>
    </Container>
  );
}

export default FormBuilder;
