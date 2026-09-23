import React, { useEffect, useState, useMemo } from "react";
import { Container, Row, Col, Card, Table, Badge, Alert, Form } from "react-bootstrap";
import { useAuth } from "context/AuthContext";
import { fetchForms, fetchFormGroups } from "api/forms";
import { fetchDashboardSummary, fetchSubmissions } from "api/submissions";

const THEME_PRIMARY = "#ec9b1d";
const THEME_SECONDARY = "#d97028";

const STATUS_VARIANT = {
  pending: "warning", approved: "info", rejected: "danger",
  synced: "success",  failed: "danger",
};

const STATUS_CHART_COLORS = {
  pending: THEME_PRIMARY,
  approved: THEME_SECONDARY,
  rejected: THEME_PRIMARY,
  synced: THEME_SECONDARY,
  failed: THEME_SECONDARY,
};

const ROLE_VARIANT = { superadmin: "danger", admin: "primary", reviewer: "info", viewer: "secondary" };

const EMPTY_SUMMARY = {
  totals: { submissions: 0, today: 0, this_week: 0, completion_rate: 0 },
  status_counts: { pending: 0, approved: 0, rejected: 0, synced: 0, failed: 0 },
  pending_vs_approved: { pending: 0, approved: 0 },
  trend: [],
  top_forms: [],
  filters: { form: null, days: 7, range_start: null, range_end: null },
};

const RANGE_OPTIONS = [
  { value: 7, label: "Last 7 days" },
  { value: 30, label: "Last 30 days" },
  { value: 90, label: "Last 90 days" },
];

function StatCard({ icon, bg, title, value, footer }) {
  return (
    <Card className="card-stats">
      <Card.Body>
        <Row>
          <Col xs={5}>
            <div style={{
              background: bg, width: 60, height: 60, borderRadius: "50%",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              <i className={icon} style={{ color: "#fff", fontSize: 22 }} />
            </div>
          </Col>
          <Col xs={7}>
            <div className="numbers">
              <p className="card-category">{title}</p>
              <Card.Title as="h4">{value ?? "—"}</Card.Title>
            </div>
          </Col>
        </Row>
      </Card.Body>
      <Card.Footer>
        <hr /><div className="stats">{footer}</div>
      </Card.Footer>
    </Card>
  );
}

function ChartCard({ title, subtitle, children, footer, legend }) {
  return (
    <Card>
      <Card.Header>
        <Card.Title as="h4">{title}</Card.Title>
        <p className="card-category">{subtitle}</p>
      </Card.Header>
      <Card.Body>
        {children}
        {legend ? <div className="legend mt-3">{legend}</div> : null}
      </Card.Body>
      <Card.Footer>
        <hr />
        <div className="stats">{footer}</div>
      </Card.Footer>
    </Card>
  );
}

function NoChartData({ message }) {
  return <div className="text-muted text-center py-5">{message}</div>;
}

function FilterCard({ forms, selectedForm, selectedRange, onFormChange, onRangeChange, rangeLabel }) {
  return (
    <Card>
      <Card.Body>
        <Row className="align-items-end">
          <Col md={5}>
            <Form.Group className="mb-md-0">
              <Form.Label>Form</Form.Label>
              <Form.Control as="select" value={selectedForm} onChange={(event) => onFormChange(event.target.value)}>
                <option value="all">All forms</option>
                {forms.map((form) => (
                  <option key={form.id} value={String(form.id)}>{form.title}</option>
                ))}
              </Form.Control>
            </Form.Group>
          </Col>
          <Col md={4}>
            <Form.Group className="mb-md-0">
              <Form.Label>Date Range</Form.Label>
              <Form.Control as="select" value={selectedRange} onChange={(event) => onRangeChange(Number(event.target.value))}>
                {RANGE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </Form.Control>
            </Form.Group>
          </Col>
          <Col md={3}>
            <div className="text-muted" style={{ fontSize: 13 }}>
              <div className="font-weight-bold text-dark">Current window</div>
              <div>{rangeLabel}</div>
            </div>
          </Col>
        </Row>
      </Card.Body>
    </Card>
  );
}

function LineTrendChart({ points }) {
  const width = 640;
  const height = 240;
  const padding = { top: 16, right: 24, bottom: 40, left: 24 };
  const maxValue = Math.max(...points.map((point) => point.total), 1);
  const innerWidth = width - padding.left - padding.right;
  const innerHeight = height - padding.top - padding.bottom;
  const stepX = points.length > 1 ? innerWidth / (points.length - 1) : innerWidth;

  const coordinates = points.map((point, index) => {
    const x = padding.left + index * stepX;
    const y = padding.top + innerHeight - (point.total / maxValue) * innerHeight;
    return { ...point, x, y };
  });

  const linePath = coordinates.map((point, index) => `${index === 0 ? "M" : "L"}${point.x} ${point.y}`).join(" ");
  const areaPath = `${linePath} L ${padding.left + innerWidth} ${padding.top + innerHeight} L ${padding.left} ${padding.top + innerHeight} Z`;

  return (
    <div>
      <svg viewBox={`0 0 ${width} ${height}`} width="100%" height="260" role="img" aria-label="Submission trend chart">
        <defs>
          <linearGradient id="trendFill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor={THEME_PRIMARY} stopOpacity="0.35" />
            <stop offset="100%" stopColor={THEME_PRIMARY} stopOpacity="0.04" />
          </linearGradient>
        </defs>
        {[0, 0.5, 1].map((ratio) => {
          const y = padding.top + innerHeight - ratio * innerHeight;
          return <line key={ratio} x1={padding.left} x2={padding.left + innerWidth} y1={y} y2={y} stroke="#dfe7f3" strokeDasharray="4 6" />;
        })}
        <path d={areaPath} fill="url(#trendFill)" />
        <path d={linePath} fill="none" stroke={THEME_PRIMARY} strokeWidth="4" strokeLinejoin="round" strokeLinecap="round" />
        {coordinates.map((point) => (
          <g key={point.date}>
            <circle cx={point.x} cy={point.y} r="5" fill={THEME_PRIMARY} />
            <text x={point.x} y={height - 12} textAnchor="middle" fontSize="12" fill="#667085">{point.label}</text>
            <text x={point.x} y={point.y - 12} textAnchor="middle" fontSize="12" fill="#1f2937">{point.total}</text>
          </g>
        ))}
      </svg>
    </div>
  );
}

function StackedStatusChart({ entries, labels, colors }) {
  const total = entries.reduce((sum, [, count]) => sum + count, 0);

  return (
    <div>
      <div style={{ display: "flex", height: 18, overflow: "hidden", borderRadius: 999, backgroundColor: "#eef2f7" }}>
        {entries.map(([status, count]) => {
          const width = total ? `${(count / total) * 100}%` : "0%";
          return <div key={status} style={{ width, backgroundColor: colors[status], minWidth: count > 0 ? 12 : 0 }} />;
        })}
      </div>
      <div className="mt-4">
        {entries.map(([status, count]) => {
          const percent = total ? Math.round((count / total) * 100) : 0;
          return (
            <div key={status} className="d-flex justify-content-between align-items-center mb-3">
              <div className="d-flex align-items-center">
                <span style={{ width: 10, height: 10, borderRadius: 999, backgroundColor: colors[status], display: "inline-block", marginRight: 10 }} />
                <span>{labels[status]}</span>
              </div>
              <div className="text-muted" style={{ fontSize: 13 }}>{count} ({percent}%)</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function TopFormsChart({ items }) {
  const maxValue = Math.max(...items.map((item) => item.total), 1);

  return (
    <div>
      {items.map((item) => (
        <div key={item.id} className="mb-3">
          <div className="d-flex justify-content-between align-items-center mb-1" style={{ gap: 12 }}>
            <strong style={{ fontSize: 14 }}>{item.title}</strong>
            <span className="text-muted" style={{ fontSize: 13 }}>{item.total}</span>
          </div>
          <div style={{ height: 14, backgroundColor: "#edf2f7", borderRadius: 999, overflow: "hidden" }}>
            <div
              style={{
                width: `${Math.max((item.total / maxValue) * 100, 8)}%`,
                height: "100%",
                borderRadius: 999,
                background: `linear-gradient(90deg, ${THEME_PRIMARY}, ${THEME_SECONDARY})`,
              }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

const GROUP_STATUS_COLORS = {
  draft: "#9e9e9e",
  published: "#43a047",
  closed: "#e53935",
};

function GroupAnalyticsCard({ groups, forms, allSubmissions }) {
  // Build per-group stats
  const stats = useMemo(() => {
    const formsByGroup = {};
    groups.forEach((g) => { formsByGroup[g.id] = []; });
    const ungrouped = [];
    forms.forEach((f) => {
      if (f.group && formsByGroup[f.group] !== undefined) {
        formsByGroup[f.group].push(f);
      } else {
        ungrouped.push(f);
      }
    });

    const submissionsByForm = {};
    allSubmissions.forEach((s) => {
      if (!submissionsByForm[s.form]) submissionsByForm[s.form] = [];
      submissionsByForm[s.form].push(s);
    });

    const buildEntry = (label, groupForms) => {
      const formIds = new Set(groupForms.map((f) => f.id));
      const subs = allSubmissions.filter((s) => formIds.has(s.form));
      const pending = subs.filter((s) => s.status === "pending").length;
      const approved = subs.filter((s) => s.status === "approved" || s.status === "synced").length;
      const rejected = subs.filter((s) => s.status === "rejected").length;
      const statusCounts = { draft: 0, published: 0, closed: 0 };
      groupForms.forEach((f) => { if (statusCounts[f.status] !== undefined) statusCounts[f.status]++; });
      return { label, formCount: groupForms.length, total: subs.length, pending, approved, rejected, statusCounts };
    };

    const rows = groups.map((g) => buildEntry(g.name, formsByGroup[g.id] || []));
    if (ungrouped.length > 0) rows.push(buildEntry("Ungrouped", ungrouped));
    return rows;
  }, [groups, forms, allSubmissions]);

  if (stats.length === 0) return null;

  return (
    <Card>
      <Card.Header>
        <Card.Title as="h4">
          <i className="nc-icon nc-tag-content mr-2" style={{ color: "#43a047" }} />
          Group Analytics
        </Card.Title>
        <p className="card-category">Submission activity and form counts broken down by group</p>
      </Card.Header>
      <Card.Body className="p-0">
        <Table striped hover style={{ marginBottom: 0 }}>
          <thead>
            <tr>
              <th>Group</th>
              <th>Forms</th>
              <th style={{ textAlign: "center" }}>Submissions</th>
              <th style={{ textAlign: "center" }}>Pending</th>
              <th style={{ textAlign: "center" }}>Approved / Synced</th>
              <th style={{ textAlign: "center" }}>Rejected</th>
              <th>Form statuses</th>
            </tr>
          </thead>
          <tbody>
            {stats.map((row) => (
              <tr key={row.label}>
                <td><strong>{row.label}</strong></td>
                <td>{row.formCount}</td>
                <td style={{ textAlign: "center" }}>
                  <Badge style={{ background: "#ec9b1d", color: "#fff", fontSize: 12, padding: "4px 8px" }}>{row.total}</Badge>
                </td>
                <td style={{ textAlign: "center" }}>
                  {row.pending > 0
                    ? <Badge variant="warning" style={{ fontSize: 12, padding: "4px 8px" }}>{row.pending}</Badge>
                    : <span className="text-muted">—</span>}
                </td>
                <td style={{ textAlign: "center" }}>
                  {row.approved > 0
                    ? <Badge variant="success" style={{ fontSize: 12, padding: "4px 8px" }}>{row.approved}</Badge>
                    : <span className="text-muted">—</span>}
                </td>
                <td style={{ textAlign: "center" }}>
                  {row.rejected > 0
                    ? <Badge variant="danger" style={{ fontSize: 12, padding: "4px 8px" }}>{row.rejected}</Badge>
                    : <span className="text-muted">—</span>}
                </td>
                <td>
                  <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                    {Object.entries(row.statusCounts).map(([st, cnt]) => cnt > 0 ? (
                      <span key={st} style={{
                        background: GROUP_STATUS_COLORS[st],
                        color: "#fff", borderRadius: 10, padding: "2px 7px", fontSize: 11,
                      }}>{cnt} {st}</span>
                    ) : null)}
                    {Object.values(row.statusCounts).every((c) => c === 0) && (
                      <span className="text-muted" style={{ fontSize: 12 }}>—</span>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Card.Body>
    </Card>
  );
}

function MISDashboard() {
  const { user, isReviewer, hasPermission } = useAuth();
  const canViewFormsDashboard = hasPermission("view_forms") || Boolean(user);
  const canReviewSubmissions = hasPermission("review_submissions") || isReviewer;
  const [summary, setSummary] = useState(EMPTY_SUMMARY);
  const [loadingSummary, setLoadingSummary] = useState(false);
  const [recent, setRecent] = useState([]);
  const [forms, setForms] = useState([]);
  const [groups, setGroups] = useState([]);
  const [allSubmissions, setAllSubmissions] = useState([]);
  const [selectedForm, setSelectedForm] = useState("all");
  const [selectedRange, setSelectedRange] = useState(30);

  useEffect(() => {
    if (!canViewFormsDashboard) {
      setForms([]);
      return undefined;
    }

    let isCurrent = true;
    fetchForms()
      .then(({ data }) => {
        if (isCurrent) {
          setForms(data.results ?? data ?? []);
        }
      })
      .catch(() => {
        if (isCurrent) {
          setForms([]);
        }
      });

    fetchFormGroups()
      .then(({ data }) => {
        if (isCurrent) setGroups(Array.isArray(data) ? data : data?.results || []);
      })
      .catch(() => { if (isCurrent) setGroups([]); });

    fetchSubmissions({ page_size: 1000 })
      .then(({ data }) => {
        if (isCurrent) setAllSubmissions(data.results ?? data ?? []);
      })
      .catch(() => { if (isCurrent) setAllSubmissions([]); });

    return () => {
      isCurrent = false;
    };
  }, [canViewFormsDashboard]);

  useEffect(() => {
    let isCurrent = true;

    if (!canViewFormsDashboard) {
      setSummary(EMPTY_SUMMARY);
      setRecent([]);
      return undefined;
    }

    setLoadingSummary(true);
    const summaryParams = { days: selectedRange };
    const recentParams = { ordering: "-submitted_at" };
    if (selectedForm !== "all") {
      summaryParams.form = selectedForm;
      recentParams.form = selectedForm;
    }

    fetchDashboardSummary(summaryParams)
      .then(({ data }) => {
        if (isCurrent) {
          setSummary({ ...EMPTY_SUMMARY, ...data });
        }
      })
      .catch(() => {
        if (isCurrent) {
          setSummary(EMPTY_SUMMARY);
        }
      })
      .finally(() => {
        if (isCurrent) {
          setLoadingSummary(false);
        }
      });

    if (canReviewSubmissions) {
      fetchSubmissions(recentParams)
        .then(({ data }) => {
          if (isCurrent) {
            setRecent((data.results ?? data ?? []).slice(0, 5));
          }
        })
        .catch(() => {
          if (isCurrent) {
            setRecent([]);
          }
        });
    } else {
      setRecent([]);
    }

    return () => {
      isCurrent = false;
    };
  }, [canReviewSubmissions, canViewFormsDashboard, selectedForm, selectedRange]);

  const totalSubmissions = summary.totals?.submissions ?? 0;
  const submissionsToday = summary.totals?.today ?? 0;
  const submissionsThisWeek = summary.totals?.this_week ?? 0;
  const completionRate = summary.totals?.completion_rate ?? 0;
  const pendingCount = summary.pending_vs_approved?.pending ?? 0;
  const approvedCount = summary.pending_vs_approved?.approved ?? 0;
  const hasTrendData = summary.trend.some((entry) => entry.total > 0);
  const hasStatusData = Object.values(summary.status_counts).some((count) => count > 0);
  const hasTopFormsData = summary.top_forms.length > 0;
  const rangeLabel = summary.filters?.range_start && summary.filters?.range_end
    ? `${new Date(summary.filters.range_start).toLocaleDateString()} - ${new Date(summary.filters.range_end).toLocaleDateString()}`
    : "No range selected";

  const statusEntries = [
    ["pending", summary.status_counts.pending],
    ["approved", summary.status_counts.approved],
    ["synced", summary.status_counts.synced],
    ["rejected", summary.status_counts.rejected],
    ["failed", summary.status_counts.failed],
  ];
  const statusLabels = {
    pending: "Pending",
    approved: "Approved",
    synced: "Synced",
    rejected: "Rejected",
    failed: "Failed",
  };

  return (
    <Container fluid>
      {/* Role badge banner */}
      <Row className="mb-2">
        <Col md={12}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, paddingBottom: 8 }}>
            <h5 style={{ margin: 0 }}>
              Welcome back, {user?.first_name || user?.username}
            </h5>
            <Badge variant={ROLE_VARIANT[user?.role] || "secondary"} style={{ fontSize: 12, padding: "4px 10px" }}>
              {user?.role}
            </Badge>
          </div>
        </Col>
      </Row>

      {/* Viewer-only notice */}
      {!isReviewer && (
        <Row className="mb-3">
          <Col md={12}>
            <Alert variant="info" style={{ fontSize: 13 }}>
              <i className="nc-icon nc-alert-circle-i mr-2" />
              You have <strong>viewer</strong> access. You can view forms and submissions but cannot make changes.
              Contact an admin to request elevated permissions.
            </Alert>
          </Col>
        </Row>
      )}

      {/* Stats */}
      {canViewFormsDashboard && (
        <>
          <Row className="mb-4">
            <Col md={12}>
              <FilterCard
                forms={forms}
                selectedForm={selectedForm}
                selectedRange={selectedRange}
                onFormChange={setSelectedForm}
                onRangeChange={setSelectedRange}
                rangeLabel={rangeLabel}
              />
            </Col>
          </Row>

          <Row>
            <Col lg={3} sm={6}>
              <StatCard
                icon="nc-icon nc-notes"
                bg={`linear-gradient(135deg, ${THEME_PRIMARY}, ${THEME_SECONDARY})`}
                title="Total Submissions"
                value={loadingSummary ? "—" : totalSubmissions}
                footer={<><i className="nc-icon nc-chart-bar-32" /> All recorded form submissions</>}
              />
            </Col>
            <Col lg={3} sm={6}>
              <StatCard
                icon="nc-icon nc-calendar-60"
                bg={`linear-gradient(135deg, ${THEME_SECONDARY}, ${THEME_PRIMARY})`}
                title="Today / This Week"
                value={loadingSummary ? "—" : `${submissionsToday} / ${submissionsThisWeek}`}
                footer={<><i className="nc-icon nc-watch-time" /> New submissions in the current period</>}
              />
            </Col>
            <Col lg={3} sm={6}>
              <StatCard
                icon="nc-icon nc-check-2"
                bg={`linear-gradient(135deg, ${THEME_PRIMARY}, ${THEME_SECONDARY})`}
                title="Completion Rate"
                value={loadingSummary ? "—" : `${completionRate}%`}
                footer={<><i className="nc-icon nc-refresh-69" /> Reviewed submissions as a share of total</>}
              />
            </Col>
            <Col lg={3} sm={6}>
              <StatCard
                icon="nc-icon nc-vector"
                bg={`linear-gradient(135deg, ${THEME_SECONDARY}, ${THEME_PRIMARY})`}
                title="Pending vs Approved"
                value={loadingSummary ? "—" : `${pendingCount} / ${approvedCount}`}
                footer={<><i className="nc-icon nc-paper-2" /> Pending and approved or synced submissions</>}
              />
            </Col>
          </Row>

          <Row>
            <Col md={8}>
              <ChartCard
                title="Submission Trend"
                subtitle="Daily form submissions across the selected range"
                footer={<><i className="far fa-clock" /> Updated from live submission data</>}
              >
                {hasTrendData ? (
                  <LineTrendChart points={summary.trend} />
                ) : (
                  <NoChartData message="No submission activity in the selected range." />
                )}
              </ChartCard>
            </Col>
            <Col md={4}>
              <ChartCard
                title="Status Mix"
                subtitle="Current distribution across review and sync states"
                footer={<><i className="far fa-flag" /> Pending, approved, rejected, synced, and failed totals</>}
                legend={statusEntries.map(([status, count]) => (
                  <span key={status} className="d-inline-flex align-items-center mr-3 mb-2">
                    <i className="fas fa-circle mr-1" style={{ color: STATUS_CHART_COLORS[status] }} />
                    {statusLabels[status]} {count}
                  </span>
                ))}
              >
                {hasStatusData ? (
                  <StackedStatusChart entries={statusEntries} labels={statusLabels} colors={STATUS_CHART_COLORS} />
                ) : (
                  <NoChartData message="No submission status data available yet." />
                )}
              </ChartCard>
            </Col>
          </Row>

          <Row>
            <Col md={12}>
              <ChartCard
                title="Top Forms"
                subtitle={selectedForm === "all" ? "Forms with the highest submission volume" : "Submission volume for the selected form"}
                footer={<><i className="nc-icon nc-paper-2" /> Ranked by total submissions received</>}
              >
                {hasTopFormsData ? (
                  <TopFormsChart items={summary.top_forms} />
                ) : (
                  <NoChartData message="No form submission totals available yet." />
                )}
              </ChartCard>
            </Col>
          </Row>

          {groups.length > 0 && (
            <Row>
              <Col md={12}>
                <GroupAnalyticsCard groups={groups} forms={forms} allSubmissions={allSubmissions} />
              </Col>
            </Row>
          )}
        </>
      )}

      {/* Recent submissions */}
      {canReviewSubmissions && (
        <Row>
          <Col md={12}>
            <Card>
              <Card.Header>
                <Card.Title as="h4">Recent Submissions</Card.Title>
                <p className="card-category">Latest registrations across all forms</p>
              </Card.Header>
              <Card.Body className="table-responsive p-0">
                <Table striped hover>
                  <thead>
                    <tr><th>#</th><th>Name</th><th>Email</th><th>Form</th><th>Status</th><th>Date</th></tr>
                  </thead>
                  <tbody>
                    {recent.length === 0 && (
                      <tr><td colSpan={6} className="text-center text-muted py-3">No submissions yet.</td></tr>
                    )}
                    {recent.map((s) => (
                      <tr key={s.id}>
                        <td>{s.id}</td>
                        <td>{s.submitter_name || "—"}</td>
                        <td>{s.submitter_email || "—"}</td>
                        <td>{s.form_title}</td>
                        <td><Badge variant={STATUS_VARIANT[s.status] || "secondary"}>{s.status}</Badge></td>
                        <td>{new Date(s.submitted_at).toLocaleDateString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              </Card.Body>
            </Card>
          </Col>
        </Row>
      )}
    </Container>
  );
}

export default MISDashboard;
