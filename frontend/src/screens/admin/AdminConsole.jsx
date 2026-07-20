import { useState, useEffect, useCallback } from 'react';
import AppShell from '../AppShell.jsx';

// ── Helpers ───────────────────────────────────────────────────────────────────

function isoDateStr(d) { return d.toISOString().slice(0, 10); }
function todayStr()    { return isoDateStr(new Date()); }
function daysAgoStr(n) { const d = new Date(); d.setDate(d.getDate() - n); return isoDateStr(d); }

function fmtDateTime(iso) {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    return d.toLocaleDateString('en-GB', {
      timeZone: 'Europe/Amsterdam',
      day: '2-digit', month: 'short', year: 'numeric',
    }) + ' ' + d.toLocaleTimeString('en-GB', {
      timeZone: 'Europe/Amsterdam',
      hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
    });
  } catch { return iso; }
}

const ACTION_LABELS = {
  account_activated:           'Account activated',
  password_generated:          'Password generated',
  employee_deactivated:        'Employee deactivated',
  reactivated:                 'Reactivated',
  role_changed:                'Role changed',
  project_assignment_changed:  'Assignment changed',
  data_export_generated:       'Data export generated',
};

function actionLabel(action) { return ACTION_LABELS[action] ?? action; }

// ── Date preset logic ─────────────────────────────────────────────────────────

const PRESETS = [
  { id: 'today', label: 'Today',        from: () => todayStr(),     to: () => todayStr() },
  { id: '7d',    label: 'Last 7 days',  from: () => daysAgoStr(6),  to: () => todayStr() },
  { id: '30d',   label: 'Last 30 days', from: () => daysAgoStr(29), to: () => todayStr() },
  { id: 'custom',label: 'Custom',       from: null,                 to: null },
];

function presetRange(id) {
  const p = PRESETS.find(p => p.id === id);
  if (!p || !p.from) return null;
  return { from: p.from(), to: p.to() };
}

// ── Sub-components ────────────────────────────────────────────────────────────

function ResultBadge({ result }) {
  const ok = result === 'success';
  return (
    <span style={{
      display: 'inline-block', padding: '2px 8px',
      borderRadius: '999px', fontSize: '0.75rem', fontWeight: 600,
      background: ok ? 'var(--color-green-50, #f0fdf4)' : 'var(--color-red-50, #fef2f2)',
      color:      ok ? 'var(--color-green-700, #15803d)' : 'var(--color-red-700, #b91c1c)',
      border:     `1px solid ${ok ? 'var(--color-green-200, #bbf7d0)' : 'var(--color-red-200, #fecaca)'}`,
    }}>
      {ok ? 'Success' : 'Failed'}
    </span>
  );
}

function FailureChip({ reason }) {
  if (!reason) return '—';
  const labels = {
    invalid_password:   'Wrong password',
    unknown_user:       'Unknown user',
    pending_activation: 'Pending activation',
    deactivated:        'Deactivated',
    other:              'Other',
  };
  return (
    <span style={{
      display: 'inline-block', padding: '2px 8px', borderRadius: '999px',
      fontSize: '0.72rem', fontWeight: 500,
      background: 'var(--color-grey-100, #f3f4f6)',
      color: 'var(--color-grey-600, #4b5563)',
    }}>
      {labels[reason] ?? reason}
    </span>
  );
}

// Inline row detail panel — shows all raw network fields
function LoginAuditDetail({ row }) {
  const field = (label, value) => (
    <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.25rem', fontSize: '0.8125rem' }}>
      <span style={{ minWidth: '140px', color: 'var(--color-grey-500)', flexShrink: 0 }}>{label}</span>
      <span style={{ fontFamily: value && /[.:0-9a-f]{4,}/i.test(value) ? 'monospace' : undefined, wordBreak: 'break-all' }}>
        {value ?? <span style={{ color: 'var(--color-grey-400)' }}>—</span>}
      </span>
    </div>
  );

  return (
    <div style={{
      padding: '0.75rem 1rem',
      background: 'var(--color-grey-50, #f9fafb)',
      borderTop: '1px solid var(--color-grey-200)',
      borderBottom: '1px solid var(--color-grey-200)',
    }}>
      <div style={{ fontWeight: 600, fontSize: '0.8rem', color: 'var(--color-grey-500)', marginBottom: '0.5rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
        Network details
      </div>
      {field('Email',             row.attempted_email)}
      {field('Display IP',        row.ip_address)}
      {field('True-Client-IP',    row.true_client_ip)}
      {field('CF-Connecting-IP',  row.cf_connecting_ip)}
      {field('X-Forwarded-For',   row.x_forwarded_for)}
      {field('Country (CF edge)', row.country_code)}
      {field('User Agent',        row.user_agent)}
      {field('Path',              row.path)}
    </div>
  );
}

// ── User picker ───────────────────────────────────────────────────────────────

function UserPicker({ users, value, onChange, showInactive, onToggleInactive }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
      <label className="filter-label">User</label>
      <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
        <select
          className="form-select"
          value={value}
          onChange={e => onChange(e.target.value)}
          style={{ minWidth: '200px' }}
        >
          <option value="">All users</option>
          {users.map(u => (
            <option key={u.id} value={String(u.id)}>
              {u.first_name} {u.last_name}
              {u.status !== 'active' ? ` (${u.status})` : ''}
            </option>
          ))}
        </select>
        <label style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.8125rem', color: 'var(--color-grey-600)', whiteSpace: 'nowrap', cursor: 'pointer' }}>
          <input type="checkbox" checked={showInactive} onChange={e => onToggleInactive(e.target.checked)} />
          Show deactivated
        </label>
      </div>
    </div>
  );
}

// ── Filters bar ───────────────────────────────────────────────────────────────

function FiltersBar({ tab, preset, onPreset, dateFrom, dateTo, onDateFrom, onDateTo,
                      users, userIdFilter, onUserIdFilter,
                      showInactiveUsers, onToggleInactiveUsers,
                      resultFilter, onResultFilter,
                      actionFilter, onActionFilter, onApply }) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', alignItems: 'flex-end', marginBottom: '1rem' }}>
      {/* Date preset */}
      <div>
        <label className="filter-label">Period</label>
        <select className="form-select" value={preset} onChange={e => onPreset(e.target.value)}
          style={{ minWidth: '130px' }}>
          {PRESETS.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
        </select>
      </div>

      {/* Custom date inputs */}
      {preset === 'custom' && (
        <>
          <div>
            <label className="filter-label">From</label>
            <input type="date" className="form-input" value={dateFrom} onChange={e => onDateFrom(e.target.value)} />
          </div>
          <div>
            <label className="filter-label">To</label>
            <input type="date" className="form-input" value={dateTo} onChange={e => onDateTo(e.target.value)} />
          </div>
        </>
      )}

      {/* Login tab filters */}
      {tab === 'login' && (
        <>
          <div>
            <label className="filter-label">Result</label>
            <select className="form-select" value={resultFilter} onChange={e => onResultFilter(e.target.value)}>
              <option value="">All</option>
              <option value="success">Success</option>
              <option value="failed">Failed</option>
            </select>
          </div>
          <UserPicker
            users={users}
            value={userIdFilter}
            onChange={onUserIdFilter}
            showInactive={showInactiveUsers}
            onToggleInactive={onToggleInactiveUsers}
          />
        </>
      )}

      {/* Admin tab filters */}
      {tab === 'admin' && (
        <div>
          <label className="filter-label">Action type</label>
          <select className="form-select" value={actionFilter} onChange={e => onActionFilter(e.target.value)}>
            <option value="">All</option>
            {Object.entries(ACTION_LABELS).map(([k, v]) =>
              <option key={k} value={k}>{v}</option>
            )}
          </select>
        </div>
      )}

      <button className="btn btn-solid" onClick={onApply} style={{ alignSelf: 'flex-end' }}>
        Apply
      </button>
    </div>
  );
}

// ── Login Audit table ─────────────────────────────────────────────────────────

const COUNTRY_TOOLTIP = 'Country reported by Cloudflare / network edge. May differ from the user\'s actual location due to VPN, proxy, Apple Private Relay, mobile carrier routing, or other network paths.';

function LoginAuditTable({ rows, loading }) {
  const [expandedId, setExpandedId] = useState(null);

  if (loading) return <div className="table-empty">Loading…</div>;
  if (!rows.length) return <div className="table-empty">No login events in the selected range.</div>;

  function toggleRow(id) {
    setExpandedId(prev => prev === id ? null : id);
  }

  return (
    <div className="table-wrap" style={{ overflowX: 'auto' }}>
      <table className="data-table">
        <thead>
          <tr>
            <th>Time</th>
            <th>Result</th>
            <th>User</th>
            <th>Role</th>
            <th>Display IP</th>
            <th>
              Country{' '}
              <span
                title={COUNTRY_TOOLTIP}
                style={{ cursor: 'help', fontSize: '0.75rem', color: 'var(--color-grey-400)' }}
                aria-label={COUNTRY_TOOLTIP}
              >
                ⓘ
              </span>
            </th>
            <th>Device</th>
            <th>Failure Reason</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(r => (
            <>
              <tr
                key={r.id}
                onClick={() => toggleRow(r.id)}
                style={{ cursor: 'pointer', background: expandedId === r.id ? 'var(--color-grey-50, #f9fafb)' : undefined }}
              >
                <td style={{ whiteSpace: 'nowrap', fontSize: '0.8125rem' }}>{fmtDateTime(r.created_at)}</td>
                <td><ResultBadge result={r.result} /></td>
                <td style={{ fontSize: '0.8125rem' }}>{r.user_name ?? <span style={{ color: 'var(--color-grey-400)' }}>{r.attempted_email}</span>}</td>
                <td style={{ fontSize: '0.8125rem', textTransform: 'capitalize' }}>{r.role ?? '—'}</td>
                <td style={{ fontSize: '0.8125rem', fontFamily: 'monospace' }}>{r.ip_address ?? '—'}</td>
                <td style={{ fontSize: '0.8125rem' }}>{r.country_code ?? '—'}</td>
                <td style={{ fontSize: '0.8125rem' }}>{r.device_summary ?? '—'}</td>
                <td><FailureChip reason={r.failure_reason} /></td>
              </tr>
              {expandedId === r.id && (
                <tr key={`${r.id}-detail`}>
                  <td colSpan={8} style={{ padding: 0 }}>
                    <LoginAuditDetail row={r} />
                  </td>
                </tr>
              )}
            </>
          ))}
        </tbody>
      </table>
      <p style={{ fontSize: '0.75rem', color: 'var(--color-grey-400)', marginTop: '0.5rem' }}>
        Click any row to view raw network details.
      </p>
    </div>
  );
}

// ── Admin Audit table ─────────────────────────────────────────────────────────

function AdminAuditTable({ rows, loading }) {
  if (loading) return <div className="table-empty">Loading…</div>;
  if (!rows.length) return <div className="table-empty">No admin actions in the selected range.</div>;
  return (
    <div className="table-wrap" style={{ overflowX: 'auto' }}>
      <table className="data-table">
        <thead>
          <tr>
            <th>Time</th>
            <th>Action</th>
            <th>Actor</th>
            <th>Target</th>
            <th>Details</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(r => {
            let details = '—';
            try {
              const nv = r.new_values ? JSON.parse(r.new_values) : null;
              const ov = r.old_values ? JSON.parse(r.old_values) : null;
              if (nv?.email)       details = nv.email;
              else if (ov?.first_name) details = `${ov.first_name} ${ov.last_name ?? ''}`.trim();
            } catch { /* ignore */ }
            return (
              <tr key={r.id}>
                <td style={{ whiteSpace: 'nowrap', fontSize: '0.8125rem' }}>{fmtDateTime(r.created_at)}</td>
                <td>
                  <span style={{
                    display: 'inline-block', padding: '2px 8px',
                    borderRadius: '999px', fontSize: '0.75rem', fontWeight: 500,
                    background: 'var(--color-grey-100, #f3f4f6)',
                    color: 'var(--color-grey-700, #374151)',
                  }}>{actionLabel(r.action)}</span>
                </td>
                <td style={{ fontSize: '0.8125rem' }}>{r.actor_name ?? '—'}</td>
                <td style={{ fontSize: '0.8125rem' }}>{r.target_name ?? '—'}</td>
                <td style={{ fontSize: '0.8125rem', color: 'var(--color-grey-500)' }}>{details}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ── Data Export tab ───────────────────────────────────────────────────────────

const EXPORT_PERIODS = [
  { id: 'this_month', label: 'This Month' },
  { id: 'last_month', label: 'Last Month' },
  { id: 'this_week',  label: 'This Week'  },
  { id: 'last_week',  label: 'Last Week'  },
  { id: 'custom',     label: 'Custom'     },
];

function DataExportTab() {
  const [period,     setPeriod]     = useState('this_month');
  const [dateFrom,   setDateFrom]   = useState('');
  const [dateTo,     setDateTo]     = useState('');
  const [generating, setGenerating] = useState(false);
  const [result,     setResult]     = useState(null);
  const [dlError,    setDlError]    = useState('');
  const [error,      setError]      = useState('');

  async function handleGenerate() {
    setGenerating(true);
    setError('');
    setDlError('');
    setResult(null);
    try {
      const body = { period };
      if (period === 'custom') { body.date_from = dateFrom; body.date_to = dateTo; }
      const res  = await fetch('/api/admin-console/export', {
        method: 'POST', credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Export failed');
      setResult(json.data);
    } catch (e) {
      setError(e.message ?? 'Export failed');
    } finally {
      setGenerating(false);
    }
  }

  function downloadFile(format) {
    if (!result) return;
    setDlError('');
    const ext      = format === 'xlsx' ? 'xlsx' : 'zip';
    const filename = `timetracking_export_${result.date_from}_${result.date_to}.${ext}`;
    fetch(`/api/admin-console/export/${format}?date_from=${result.date_from}&date_to=${result.date_to}`, {
      credentials: 'same-origin',
    })
      .then(r => { if (!r.ok) throw new Error('Download failed'); return r.blob(); })
      .then(blob => {
        const a = document.createElement('a');
        a.href     = URL.createObjectURL(blob);
        a.download = filename;
        a.click();
        URL.revokeObjectURL(a.href);
      })
      .catch(e => setDlError(e.message ?? 'Download failed'));
  }

  return (
    <div style={{ maxWidth: 560 }}>
      <p style={{ fontSize: '0.875rem', color: 'var(--color-grey-600)', marginBottom: '1.5rem' }}>
        Export operational data to Excel or CSV. Includes employees, projects, attendance, hours,
        extras, mileage, and weekly summaries.
      </p>

      {/* Period selector */}
      <div style={{ marginBottom: '1.25rem' }}>
        <label className="filter-label">Period</label>
        <select
          className="form-select"
          value={period}
          onChange={e => { setPeriod(e.target.value); setResult(null); }}
          style={{ minWidth: 180 }}
        >
          {EXPORT_PERIODS.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
        </select>
      </div>

      {/* Custom date range */}
      {period === 'custom' && (
        <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.25rem' }}>
          <div>
            <label className="filter-label">From</label>
            <input type="date" className="form-input" value={dateFrom}
              onChange={e => { setDateFrom(e.target.value); setResult(null); }} />
          </div>
          <div>
            <label className="filter-label">To</label>
            <input type="date" className="form-input" value={dateTo}
              onChange={e => { setDateTo(e.target.value); setResult(null); }} />
          </div>
        </div>
      )}

      <button className="btn btn-solid" onClick={handleGenerate} disabled={generating}>
        {generating ? 'Generating…' : 'Generate Export'}
      </button>

      {error && (
        <div className="error-banner" style={{ marginTop: '1rem' }}>
          {error}
          <button className="error-close" onClick={() => setError('')}>✕</button>
        </div>
      )}

      {/* Result panel */}
      {result && (
        <div style={{
          marginTop: '1.5rem', padding: '1.25rem',
          border: '1px solid var(--color-grey-200)',
          borderRadius: 8,
          background: 'var(--color-grey-50)',
        }}>
          <div style={{ fontSize: '0.8125rem', color: 'var(--color-grey-500)', marginBottom: '0.25rem' }}>
            Generated: {fmtDateTime(result.generated_at)}
          </div>
          <div style={{ fontSize: '0.8125rem', color: 'var(--color-grey-500)', marginBottom: '1rem' }}>
            Period: {result.date_from} → {result.date_to}
          </div>
          <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
            <button className="btn btn-outline" onClick={() => downloadFile('xlsx')}>
              ↓ Download Excel (.xlsx)
            </button>
            <button className="btn btn-outline" onClick={() => downloadFile('csv')}>
              ↓ Download CSV ZIP
            </button>
          </div>
          {dlError && (
            <div style={{ marginTop: '0.75rem', fontSize: '0.8125rem', color: 'var(--color-red-600, #dc2626)' }}>
              {dlError}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main screen ───────────────────────────────────────────────────────────────

export default function AdminConsole() {
  const [tab,                setTab]                = useState('login');
  const [preset,             setPreset]             = useState('7d');
  const [dateFrom,           setDateFrom]           = useState(daysAgoStr(6));
  const [dateTo,             setDateTo]             = useState(todayStr());
  const [userIdFilter,       setUserIdFilter]       = useState('');
  const [showInactiveUsers,  setShowInactiveUsers]  = useState(false);
  const [resultFilter,       setResultFilter]       = useState('');
  const [actionFilter,       setActionFilter]       = useState('');
  const [loginRows,          setLoginRows]          = useState([]);
  const [adminRows,          setAdminRows]          = useState([]);
  const [loginTotal,         setLoginTotal]         = useState(0);
  const [adminTotal,         setAdminTotal]         = useState(0);
  const [loading,            setLoading]            = useState(false);
  const [error,              setError]              = useState('');
  const [allUsers,           setAllUsers]           = useState([]);

  function getRange() {
    const r = presetRange(preset);
    return r ?? { from: dateFrom, to: dateTo };
  }

  // Load user list for the picker
  const loadUsers = useCallback(async (includeInactive) => {
    try {
      const params = new URLSearchParams();
      if (includeInactive) params.set('include_inactive', '1');
      const res  = await fetch(`/api/admin-console/users?${params}`, { credentials: 'same-origin' });
      const json = await res.json();
      if (res.ok) setAllUsers(json.data ?? []);
    } catch { /* non-fatal */ }
  }, []);

  function handleToggleInactiveUsers(checked) {
    setShowInactiveUsers(checked);
    setUserIdFilter('');
    loadUsers(checked);
  }

  const load = useCallback(async (currentTab, range, uid, rf, af) => {
    setLoading(true);
    setError('');
    try {
      if (currentTab === 'login') {
        const params = new URLSearchParams({
          date_from: range.from,
          date_to:   range.to,
          limit:     '200',
        });
        if (uid) params.set('user_id', uid);
        if (rf)  params.set('result',  rf);
        const res  = await fetch(`/api/admin-console/login-audit?${params}`, { credentials: 'same-origin' });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? 'Failed to load');
        setLoginRows(json.data  ?? []);
        setLoginTotal(json.total ?? 0);
      } else {
        const params = new URLSearchParams({
          date_from: range.from,
          date_to:   range.to,
          limit:     '200',
        });
        if (af) params.set('action_type', af);
        const res  = await fetch(`/api/admin-console/admin-audit?${params}`, { credentials: 'same-origin' });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? 'Failed to load');
        setAdminRows(json.data  ?? []);
        setAdminTotal(json.total ?? 0);
      }
    } catch (e) {
      setError(e.message ?? 'Failed to load data');
    } finally {
      setLoading(false);
    }
  }, []);

  function handleApply() {
    const range = getRange();
    load(tab, range, userIdFilter, resultFilter, actionFilter);
  }

  function handlePreset(p) {
    setPreset(p);
    const r = presetRange(p);
    if (r) load(tab, r, userIdFilter, resultFilter, actionFilter);
  }

  function handleTab(t) {
    setTab(t);
    if (t === 'export') return;
    const range = getRange();
    load(t, range, userIdFilter, resultFilter, actionFilter);
  }

  useEffect(() => {
    const range = getRange();
    load(tab, range, userIdFilter, resultFilter, actionFilter);
    loadUsers(false);
  }, []); // eslint-disable-line

  const range = getRange();
  const total = tab === 'login' ? loginTotal : adminTotal;

  return (
    <AppShell title="Admin Console">
      <div className="page">
        <div className="page-header">
          <h1 className="page-title">Admin Console</h1>
          {tab !== 'export' && total > 0 && (
            <span style={{ fontSize: '0.875rem', color: 'var(--color-grey-500)' }}>
              {total} event{total !== 1 ? 's' : ''}
            </span>
          )}
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: '0', borderBottom: '2px solid var(--color-grey-200)', marginBottom: '1.25rem' }}>
          {[['login', 'Login Audit'], ['admin', 'Admin Actions'], ['export', 'Data Export']].map(([id, label]) => (
            <button
              key={id}
              onClick={() => handleTab(id)}
              style={{
                padding: '0.5rem 1.25rem',
                background: 'none', border: 'none', cursor: 'pointer',
                fontSize: '0.9375rem', fontWeight: tab === id ? 600 : 400,
                color: tab === id ? 'var(--color-primary, #2563eb)' : 'var(--color-grey-500)',
                borderBottom: tab === id ? '2px solid var(--color-primary, #2563eb)' : '2px solid transparent',
                marginBottom: '-2px',
              }}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Filters (not shown on export tab) */}
        {tab !== 'export' && <FiltersBar
          tab={tab}
          preset={preset} onPreset={handlePreset}
          dateFrom={dateFrom} dateTo={dateTo}
          onDateFrom={setDateFrom} onDateTo={setDateTo}
          users={allUsers}
          userIdFilter={userIdFilter}   onUserIdFilter={setUserIdFilter}
          showInactiveUsers={showInactiveUsers} onToggleInactiveUsers={handleToggleInactiveUsers}
          resultFilter={resultFilter}   onResultFilter={setResultFilter}
          actionFilter={actionFilter}   onActionFilter={setActionFilter}
          onApply={handleApply}
        />}

        {tab !== 'export' && error && (
          <div className="error-banner" style={{ marginBottom: '1rem' }}>
            {error}
            <button className="error-close" onClick={() => setError('')}>✕</button>
          </div>
        )}

        {/* Tables / Export */}
        {tab === 'export'
          ? <DataExportTab />
          : tab === 'login'
            ? <LoginAuditTable  rows={loginRows} loading={loading} />
            : <AdminAuditTable rows={adminRows} loading={loading} />
        }
      </div>
    </AppShell>
  );
}
