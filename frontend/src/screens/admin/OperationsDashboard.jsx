import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import AppShell from '../AppShell.jsx';
import { useAuth } from '../../auth.jsx';
import {
  getCurrentWeekStart,
  addDays,
  fmtWeekLabel,
} from '../../lib/weekUtils.js';

// ── Small components ──────────────────────────────────────────────────────────

function SummaryCard({ label, value, sub, accent, onClick }) {
  return (
    <div
      className={`od-card od-card-accent-${accent ?? 'grey'}`}
      style={onClick ? { cursor: 'pointer' } : {}}
      onClick={onClick}
    >
      <div className="od-card-label">{label}</div>
      <div className="od-card-value">{value ?? '—'}</div>
      {sub && <div className="od-card-sub">{sub}</div>}
    </div>
  );
}

function TypeBadge({ type }) {
  if (type === 'own_cost')   return <span className="od-badge od-badge-amber">Own Cost</span>;
  if (type === 'extra_work') return <span className="od-badge od-badge-blue">Legacy</span>;
  return <span className="od-badge od-badge-grey">{type}</span>;
}

function IssueBadge({ issueType }) {
  const map = {
    no_project_hours: { cls: 'od-badge-amber', label: 'Missing project hours this week' },
    pending_extras:   { cls: 'od-badge-blue',  label: 'Own Cost waiting for review'     },
    no_mileage:       { cls: 'od-badge-grey',  label: 'Mileage not submitted'           },
  };
  const { cls, label } = map[issueType] ?? { cls: 'od-badge-grey', label: issueType };
  return <span className={`od-badge ${cls}`}>{label}</span>;
}

function AlertItem({ alert, navigate }) {
  const colorMap = {
    not_submitted_weekly: 'od-alert-amber',
    waiting_review:       'od-alert-blue',
    stale_extras:         'od-alert-amber',
    mileage_missing:      'od-alert-amber',
  };
  const cls = colorMap[alert.type] ?? 'od-alert-amber';
  return (
    <div className={`od-alert-item ${cls}`}>
      <span style={{ flex: 1 }}>{alert.message}</span>
      {alert.link && (
        <button
          className="btn-ghost"
          style={{ fontSize: '0.8125rem', textDecoration: 'underline', whiteSpace: 'nowrap', padding: 0 }}
          onClick={() => navigate(alert.link)}
        >
          View →
        </button>
      )}
    </div>
  );
}

function fmtDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

function ratioAccent(submitted, total) {
  if (total === 0) return 'grey';
  if (submitted >= total) return 'green';
  return 'amber';
}

function ratioValue(submitted, total) {
  if (total === 0) return '—';
  return `${submitted}/${total}`;
}

// ── Main component ────────────────────────────────────────────────────────────

export default function OperationsDashboard() {
  const navigate  = useNavigate();
  const { user }  = useAuth();
  const isManager = user?.role === 'manager';

  // WD-03: current calendar week is the default; no auto-switch on Monday
  const [weekStart, setWeekStart] = useState(() => getCurrentWeekStart());
  const [data,    setData]    = useState(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState(null);

  // WD-07: API URL always carries the selected week_start
  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/dashboard/operations?week_start=${weekStart}`, { credentials: 'include' });
      if (!res.ok) throw new Error(`Server returned ${res.status}`);
      const json = await res.json();
      setData(json.data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [weekStart]);

  useEffect(() => { load(); }, [load]);

  // WD-04: week navigation controls
  const prevWeek    = () => setWeekStart(ws => addDays(ws, -7));
  const nextWeek    = () => setWeekStart(ws => addDays(ws, 7));
  const currentWeek = () => setWeekStart(getCurrentWeekStart());
  const isCurrentWeek = weekStart === getCurrentWeekStart();

  const week = data?.week ?? {};

  // WD-06: Employees Requiring Attention — expand one row per (employee, issue)
  const attentionRows = (data?.attention_items ?? []).flatMap(item => {
    const rows = [];
    if (item.no_project_hours) rows.push({
      key:         `${item.user_id}-hrs`,
      name:        item.employee_name,
      code:        item.employee_number,
      issueType:   'no_project_hours',
      actionLabel: 'Open Timesheet',
      actionPath:  `/employees/${item.user_id}/timesheet`,
    });
    if (item.has_pending_extras) rows.push({
      key:         `${item.user_id}-ext`,
      name:        item.employee_name,
      code:        item.employee_number,
      issueType:   'pending_extras',
      actionLabel: 'Open Extras',
      actionPath:  `/admin/extras?status=waiting_for_manager&user_id=${item.user_id}`,
    });
    return rows;
  });

  const relevantAlerts = (data?.alerts ?? []).filter(a =>
    isManager ? a.for === 'manager' : a.for === 'admin'
  );

  // Open Extras sub-label
  function extrasSub() {
    const parts = [];
    if (week.open_own_cost > 0) parts.push(`${week.open_own_cost} own cost`);
    if (week.open_legacy   > 0) parts.push(`${week.open_legacy} legacy`);
    return parts.length ? parts.join(' · ') : null;
  }

  return (
    <AppShell title="Operations Dashboard">
      <div className="page">
        <div className="page-header">
          <h1 className="page-title">Operations Dashboard</h1>
          <button className="btn btn-secondary" onClick={load} disabled={loading}>
            {loading ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>

        {error && (
          <div className="od-alert-item od-alert-red" style={{ marginBottom: '1.5rem' }}>
            <span>⚠️</span>
            <span>Failed to load dashboard: {error}</span>
          </div>
        )}

        {loading && !data && (
          <div style={{ textAlign: 'center', padding: '3rem' }}>
            <div className="em-spinner" />
          </div>
        )}

        {/* ── Weekly Status — shown for both admin and manager ── */}
        {/* WD-02: Weekly Status title visible */}
        <div className="od-section">
          <h2 className="od-section-title">Weekly Status</h2>

          {/* WD-04: Week selector */}
          <div className="od-week-bar">
            <button className="btn btn-outline od-week-nav" onClick={prevWeek}>
              ← Previous Week
            </button>
            <span className="od-week-label">{fmtWeekLabel(weekStart)}</span>
            <button className="btn btn-outline od-week-nav" onClick={nextWeek}>
              Next Week →
            </button>
            <button
              className="btn btn-outline od-week-nav"
              onClick={currentWeek}
              disabled={isCurrentWeek}
            >
              Current Week
            </button>
          </div>

          {/* WD-05: KPI cards — all in one row */}
          {data && (
            <div className="od-card-grid od-card-grid-4">
              {/* WD-05a: Employees Submitted — links to missing-timesheets drill-down */}
              <SummaryCard
                label="Employees Submitted"
                value={ratioValue(week.employees_submitted ?? 0, week.total_active_employees ?? 0)}
                sub="project hours or attendance"
                accent={ratioAccent(week.employees_submitted ?? 0, week.total_active_employees ?? 0)}
                onClick={() => navigate(`/dashboard/missing-timesheets?week_start=${weekStart}`)}
              />
              {/* WD-05b: Manager Reviews Pending */}
              <SummaryCard
                label="Manager Reviews Pending"
                value={week.waiting_for_manager ?? 0}
                sub="extras awaiting review"
                accent={(week.waiting_for_manager ?? 0) > 0 ? 'blue' : 'grey'}
                onClick={(week.waiting_for_manager ?? 0) > 0
                  ? () => navigate('/admin/extras?status=waiting_for_manager')
                  : undefined}
              />
              {/* WD-05c: Open Extras */}
              <SummaryCard
                label="Open Extras"
                value={week.open_extras ?? 0}
                sub={extrasSub()}
                accent={(week.open_extras ?? 0) > 0 ? 'blue' : 'grey'}
                onClick={(week.open_extras ?? 0) > 0
                  ? () => navigate('/admin/extras?status=open')
                  : undefined}
              />
              {/* WD-05d: Mileage Submitted */}
              <SummaryCard
                label="Mileage Submitted"
                value={ratioValue(week.mileage_submitted ?? 0, week.total_active_employees ?? 0)}
                sub="employees reported mileage"
                accent={ratioAccent(week.mileage_submitted ?? 0, week.total_active_employees ?? 0)}
                onClick={() => navigate('/admin/mileage')}
              />
            </div>
          )}
        </div>

        {data && (
          <>
            {/* WD-06: Employees Requiring Attention — based on selected week */}
            <div className="od-section">
              <h2 className="od-section-title">Employees Requiring Attention</h2>
              {attentionRows.length === 0 ? (
                <p className="od-empty od-empty-ok">No employees require attention for this week.</p>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table className="od-table">
                    <thead>
                      <tr>
                        <th>Employee</th>
                        <th>Issue</th>
                        <th>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {attentionRows.map(row => (
                        <tr key={row.key}>
                          <td>
                            <div>{row.name}</div>
                            {row.code && (
                              <div style={{ fontSize: '0.75rem', color: 'var(--color-grey-500)' }}>{row.code}</div>
                            )}
                          </td>
                          <td><IssueBadge issueType={row.issueType} /></td>
                          <td>
                            <button
                              className="btn-ghost"
                              style={{ fontSize: '0.8125rem' }}
                              onClick={() => navigate(row.actionPath)}
                            >
                              {row.actionLabel} →
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* WD-07: Alerts — weekly, actionable */}
            {relevantAlerts.length > 0 && (
              <div className="od-section">
                <h2 className="od-section-title">Alerts</h2>
                {relevantAlerts.map((a, i) => <AlertItem key={i} alert={a} navigate={navigate} />)}
              </div>
            )}

            {/* WD-08: Open Extras Queue — no week filter */}
            <div className="od-section">
              <h2 className="od-section-title">
                Open Extras Queue
                {(week.open_extras ?? 0) > 0 && (
                  <button
                    className="btn-ghost"
                    style={{ marginLeft: '0.75rem', fontSize: '0.8125rem' }}
                    onClick={() => navigate('/admin/extras?status=open')}
                  >
                    View all →
                  </button>
                )}
              </h2>
              {data.open_extras.length === 0 ? (
                <p className="od-empty">No open extras.</p>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table className="od-table">
                    <thead>
                      <tr>
                        <th>Date</th>
                        <th>Employee</th>
                        <th>Project</th>
                        <th>Type</th>
                        <th>Description</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.open_extras.map(row => (
                        <tr key={row.id}>
                          <td style={{ whiteSpace: 'nowrap' }}>{row.created_at?.slice(0, 10) ?? '—'}</td>
                          <td>
                            <div>{row.employee_name}</div>
                            <div style={{ fontSize: '0.75rem', color: 'var(--color-grey-500)' }}>{row.employee_number}</div>
                          </td>
                          <td>
                            <div>{row.project_name ?? '—'}</div>
                            {row.project_code && (
                              <div style={{ fontSize: '0.75rem', color: 'var(--color-grey-500)' }}>{row.project_code}</div>
                            )}
                          </td>
                          <td><TypeBadge type={row.type} /></td>
                          <td style={{ maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {row.description}
                          </td>
                          <td style={{ whiteSpace: 'nowrap' }}>
                            {row.has_manager_reply > 0 ? (
                              <button
                                className="btn-ghost"
                                style={{ fontSize: '0.8125rem', color: '#1d4ed8', fontWeight: 600 }}
                                onClick={() => navigate(`/admin/extras?status=open&user_id=${row.user_id}`)}
                              >
                                ↩ View reply
                              </button>
                            ) : (
                              <button
                                className="btn-ghost"
                                style={{ fontSize: '0.8125rem' }}
                                onClick={() => navigate(`/admin/extras?status=open&user_id=${row.user_id}`)}
                              >
                                Process
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Manager: Pending Your Review (unchanged) */}
            {isManager && (
              <div className="od-section">
                <h2 className="od-section-title">
                  Pending Your Review
                  {(week.waiting_for_manager ?? 0) > 0 && (
                    <button
                      className="btn-ghost"
                      style={{ marginLeft: '0.75rem', fontSize: '0.8125rem' }}
                      onClick={() => navigate('/admin/extras?status=waiting_for_manager')}
                    >
                      View all →
                    </button>
                  )}
                </h2>
                {(data.pending_review ?? []).length === 0 ? (
                  <p className="od-empty">No items waiting for review.</p>
                ) : (
                  <div style={{ overflowX: 'auto' }}>
                    <table className="od-table">
                      <thead>
                        <tr>
                          <th>Employee</th>
                          <th>Project</th>
                          <th>Description</th>
                          <th>Waiting Since</th>
                          <th>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.pending_review.map(row => (
                          <tr key={row.id}>
                            <td>{row.employee_name}</td>
                            <td>
                              <div>{row.project_name ?? '—'}</div>
                              {row.project_code && (
                                <div style={{ fontSize: '0.75rem', color: 'var(--color-grey-500)' }}>{row.project_code}</div>
                              )}
                            </td>
                            <td style={{ maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {row.description}
                            </td>
                            <td style={{ whiteSpace: 'nowrap' }}>{fmtDate(row.updated_at)}</td>
                            <td>
                              <button
                                className="btn-ghost"
                                style={{ fontSize: '0.8125rem' }}
                                onClick={() => navigate(`/admin/extras?status=waiting_for_manager&user_id=${row.user_id}`)}
                              >
                                View
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </AppShell>
  );
}
