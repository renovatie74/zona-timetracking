import { useState, useEffect } from 'react';
import { useNavigate }         from 'react-router-dom';
import { api }                 from '../../api.js';
import { useAuth }             from '../../auth.jsx';
import AppShell                from '../AppShell.jsx';

// ── Source / status display labels ────────────────────────────────────────────

const SOURCE_LABELS = {
  automatic:     'Automatic',
  manual_worker: 'Manual',
  manual_admin:  'Manual',
  imported:      'Imported',
};

// Tooltip detail (shown in table cell)
const SOURCE_DETAIL = {
  automatic:     'Automatic',
  manual_worker: 'Manual (worker)',
  manual_admin:  'Manual (admin)',
  imported:      'Imported',
};

const STATUS_LABELS = {
  draft:     'Draft',
  submitted: 'Submitted',
  approved:  'Approved',
  rejected:  'Rejected',
};

// ── Date preset helpers ───────────────────────────────────────────────────────

function isoDate(d) {
  return d.toISOString().slice(0, 10);
}

function weekRange(weekOffset = 0) {
  const today = new Date();
  // getUTCDay(): 0=Sun … (day+6)%7 gives 0=Mon … 6=Sun
  const daysSinceMon = (today.getUTCDay() + 6) % 7;
  const mon = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() - daysSinceMon + weekOffset * 7));
  const sun = new Date(Date.UTC(mon.getUTCFullYear(), mon.getUTCMonth(), mon.getUTCDate() + 6));
  return { from: isoDate(mon), to: isoDate(sun) };
}

function monthRange() {
  const today = new Date();
  const from = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1));
  const to   = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + 1, 0));
  return { from: isoDate(from), to: isoDate(to) };
}

const PRESETS = [
  { value: 'this_week',  label: 'This Week' },
  { value: 'prev_week',  label: 'Previous Week' },
  { value: 'this_month', label: 'This Month' },
  { value: 'custom',     label: 'Custom' },
];

function presetDates(preset) {
  if (preset === 'this_week')  return weekRange(0);
  if (preset === 'prev_week')  return weekRange(-1);
  if (preset === 'this_month') return monthRange();
  return null;  // custom — caller handles
}

// ── Formatters ────────────────────────────────────────────────────────────────

function formatDate(iso) {
  if (!iso) return '—';
  return iso.slice(0, 10);
}

function formatTime(iso) {
  if (!iso) return '—';
  return iso.slice(11, 16);
}

function formatDuration(mins) {
  if (mins == null) return '—';
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${h}h ${String(m).padStart(2, '0')}m`;
}

function toISO(date, time) {
  if (!date || !time) return '';
  return `${date}T${time}:00.000Z`;
}

// ── Default state ─────────────────────────────────────────────────────────────

const DEFAULT_PRESET = 'this_week';

function initialDates() {
  return weekRange(0);
}

const EMPTY_FORM = {
  user_id:    '',
  project_id: '',
  date:       '',
  start_time: '',
  end_time:   '',
  notes:      '',
};

// ── Component ─────────────────────────────────────────────────────────────────

export default function TimeEntries() {
  const { user }   = useAuth();
  const navigate   = useNavigate();

  const [items,        setItems]        = useState([]);
  const [employees,    setEmployees]    = useState([]);
  const [projects,     setProjects]     = useState([]);
  const [loading,      setLoading]      = useState(true);
  const [preset,       setPreset]       = useState(DEFAULT_PRESET);
  const [dateFrom,     setDateFrom]     = useState(() => initialDates().from);
  const [dateTo,       setDateTo]       = useState(() => initialDates().to);
  const [userFilter,   setUserFilter]   = useState('');
  const [projFilter,   setProjFilter]   = useState('');
  const [sourceFilter, setSourceFilter] = useState('');
  const [modal,        setModal]        = useState(null);
  const [confirm,      setConfirm]      = useState(null);
  const [form,         setForm]         = useState(EMPTY_FORM);
  const [saving,       setSaving]       = useState(false);
  const [error,        setError]        = useState('');

  useEffect(() => {
    Promise.all([
      api.get('/api/employees?status=active').catch(() => []),
      api.get('/api/projects?status=all').catch(() => []),
    ]).then(([emps, projs]) => {
      setEmployees(Array.isArray(emps) ? emps : (emps ?? []));
      setProjects(Array.isArray(projs) ? projs : (projs ?? []));
    });
    load({});
  }, []);  // eslint-disable-line

  async function load(overrides = {}) {
    setLoading(true);
    setError('');
    try {
      const df  = overrides.dateFrom      ?? dateFrom;
      const dt  = overrides.dateTo        ?? dateTo;
      const uf  = overrides.userFilter    ?? userFilter;
      const pf  = overrides.projFilter    ?? projFilter;
      const sf  = overrides.sourceFilter  ?? sourceFilter;
      const p   = new URLSearchParams();
      if (df) p.set('date_from',  df);
      if (dt) p.set('date_to',    dt);
      if (uf) p.set('user_id',    uf);
      if (pf) p.set('project_id', pf);
      if (sf) p.set('source',     sf);
      const data = await api.get('/api/time-entries' + (p.toString() ? `?${p}` : ''));
      setItems(Array.isArray(data) ? data : (data ?? []));
    } catch (e) {
      if (e.status === 401) navigate('/login', { replace: true });
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  function applyPreset(newPreset) {
    setPreset(newPreset);
    if (newPreset !== 'custom') {
      const { from, to } = presetDates(newPreset);
      setDateFrom(from);
      setDateTo(to);
      load({ dateFrom: from, dateTo: to });
    }
  }

  function applyCustomDate(field, value) {
    if (field === 'from') {
      setDateFrom(value);
      load({ dateFrom: value });
    } else {
      setDateTo(value);
      load({ dateTo: value });
    }
  }

  function applyFilter(field, value) {
    if (field === 'user')   { setUserFilter(value);   load({ userFilter:   value }); }
    if (field === 'proj')   { setProjFilter(value);   load({ projFilter:   value }); }
    if (field === 'source') { setSourceFilter(value); load({ sourceFilter: value }); }
  }

  function handleReset() {
    const { from, to } = weekRange(0);
    setPreset(DEFAULT_PRESET);
    setDateFrom(from); setDateTo(to);
    setUserFilter(''); setProjFilter(''); setSourceFilter('');
    load({ dateFrom: from, dateTo: to, userFilter: '', projFilter: '', sourceFilter: '' });
  }

  function openCreate() {
    setForm({ ...EMPTY_FORM, date: new Date().toISOString().slice(0, 10) });
    setError('');
    setModal({ mode: 'create' });
  }

  function openEdit(item) {
    setForm({
      user_id:    String(item.user_id),
      project_id: String(item.project_id),
      date:       item.start_time.slice(0, 10),
      start_time: item.start_time.slice(11, 16),
      end_time:   item.stop_time?.slice(11, 16) ?? '',
      notes:      item.notes ?? '',
    });
    setError('');
    setModal({ mode: 'edit', item });
  }

  async function handleSave(e) {
    e.preventDefault();
    if (!form.start_time || !form.end_time) {
      setError('Start time and end time are required');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const start_time = toISO(form.date, form.start_time);
      const stop_time  = toISO(form.date, form.end_time);
      const body = {
        user_id:    Number(form.user_id),
        project_id: Number(form.project_id),
        start_time, stop_time,
        notes: form.notes || null,
      };
      if (modal.mode === 'create') {
        await api.post('/api/time-entries', body);
      } else {
        await api.put(`/api/time-entries/${modal.item.id}`, { start_time, stop_time, notes: body.notes });
      }
      setModal(null);
      load();
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!confirm) return;
    setSaving(true);
    try {
      await api.delete(`/api/time-entries/${confirm.id}`);
      setConfirm(null);
      load();
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  const empOptions  = employees.filter(e => e.id !== undefined);
  const projOptions = projects.filter(p => p.is_active);

  return (
    <AppShell title="Time Entries">
      <div className="page">
        <div className="page-header">
          <h1 className="page-title">Time Entries</h1>
          <button className="btn btn-solid" onClick={openCreate}>+ New Entry</button>
        </div>

        {/* Toolbar */}
        <div className="toolbar" style={{ flexWrap: 'wrap', gap: '8px' }}>
          {/* Date preset */}
          <select
            className="form-select toolbar-select"
            style={{ width: 150 }}
            value={preset}
            onChange={e => applyPreset(e.target.value)}
          >
            {PRESETS.map(p => (
              <option key={p.value} value={p.value}>{p.label}</option>
            ))}
          </select>

          {/* Custom date range — only visible when Custom selected */}
          {preset === 'custom' && (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <label style={{ fontSize: '0.8125rem', color: 'var(--color-grey-600)', whiteSpace: 'nowrap' }}>From</label>
                <input type="date" className="form-input"
                  style={{ height: 44, width: 148, padding: '0 10px' }}
                  value={dateFrom}
                  onChange={e => applyCustomDate('from', e.target.value)} />
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <label style={{ fontSize: '0.8125rem', color: 'var(--color-grey-600)', whiteSpace: 'nowrap' }}>To</label>
                <input type="date" className="form-input"
                  style={{ height: 44, width: 148, padding: '0 10px' }}
                  value={dateTo}
                  onChange={e => applyCustomDate('to', e.target.value)} />
              </div>
            </>
          )}

          <select className="form-select toolbar-select" style={{ width: 170 }}
            value={userFilter} onChange={e => applyFilter('user', e.target.value)}>
            <option value="">All Employees</option>
            {empOptions.map(e => (
              <option key={e.id} value={e.id}>{e.first_name} {e.last_name}</option>
            ))}
          </select>
          <select className="form-select toolbar-select" style={{ width: 210 }}
            value={projFilter} onChange={e => applyFilter('proj', e.target.value)}>
            <option value="">All Projects</option>
            {projOptions.map(p => (
              <option key={p.id} value={p.id}>[{p.project_code}] {p.name}</option>
            ))}
          </select>
          <select className="form-select toolbar-select" style={{ width: 160 }}
            value={sourceFilter} onChange={e => applyFilter('source', e.target.value)}>
            <option value="">All Sources</option>
            <option value="automatic">Automatic</option>
            <option value="manual_admin">Manual (admin)</option>
            <option value="manual_worker">Manual (worker)</option>
            <option value="imported">Imported</option>
          </select>
          <button className="btn btn-outline toolbar-reset" onClick={handleReset}>Reset</button>
        </div>

        {/* Date range summary when not custom */}
        {preset !== 'custom' && (
          <div style={{ fontSize: '0.8125rem', color: 'var(--color-grey-600)', padding: '4px 0 0 2px' }}>
            {dateFrom} — {dateTo}
          </div>
        )}

        {error && !modal && <div className="error-banner">{error}</div>}

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Employee</th>
                <th>Project</th>
                <th>Start</th>
                <th>End</th>
                <th>Duration</th>
                <th>Rounded</th>
                <th>Source</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr className="empty-row"><td colSpan={10}>Loading…</td></tr>
              ) : items.length === 0 ? (
                <tr className="empty-row"><td colSpan={10}>No time entries found.</td></tr>
              ) : items.map(item => (
                <tr key={item.id}>
                  <td style={{ whiteSpace: 'nowrap' }}>{formatDate(item.start_time)}</td>
                  <td style={{ fontWeight: 500 }}>{item.employee_name}</td>
                  <td>
                    <span style={{ fontSize: '0.8125rem' }}>
                      <code style={{ fontSize: '0.75rem', marginRight: 4 }}>{item.project_code}</code>
                      {item.project_name}
                    </span>
                  </td>
                  <td style={{ whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>
                    {formatTime(item.start_time)}
                  </td>
                  <td style={{ whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>
                    {formatTime(item.stop_time)}
                  </td>
                  <td style={{ whiteSpace: 'nowrap' }}>{formatDuration(item.duration_minutes)}</td>
                  <td style={{ whiteSpace: 'nowrap', fontWeight: 500 }}>
                    {formatDuration(item.rounded_duration_minutes)}
                  </td>
                  <td>
                    <span title={SOURCE_DETAIL[item.entry_source] ?? item.entry_source}
                      style={{ fontSize: '0.75rem', color: 'var(--color-grey-600)', cursor: 'default' }}>
                      {SOURCE_LABELS[item.entry_source] ?? item.entry_source}
                    </span>
                  </td>
                  <td><StatusBadge status={item.status} /></td>
                  <td>
                    <div className="td-actions">
                      <button className="btn-ghost" onClick={() => openEdit(item)}>Edit</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Create / Edit modal */}
      {modal && (
        <div className="modal-backdrop" onClick={() => setModal(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h2 className="modal-title">
              {modal.mode === 'create' ? 'New Time Entry' : 'Edit Time Entry'}
            </h2>
            <form onSubmit={handleSave}>
              {error && <div className="error-banner">{error}</div>}

              {modal.mode === 'create' && (
                <>
                  <div className="form-group">
                    <label className="form-label">Employee *</label>
                    <select className="form-select" required value={form.user_id}
                      onChange={e => setForm(f => ({ ...f, user_id: e.target.value }))}>
                      <option value="">— Select employee —</option>
                      {empOptions.map(e => (
                        <option key={e.id} value={e.id}>{e.first_name} {e.last_name}</option>
                      ))}
                    </select>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Project *</label>
                    <select className="form-select" required value={form.project_id}
                      onChange={e => setForm(f => ({ ...f, project_id: e.target.value }))}>
                      <option value="">— Select project —</option>
                      {projOptions.map(p => (
                        <option key={p.id} value={p.id}>[{p.project_code}] {p.name}</option>
                      ))}
                    </select>
                  </div>
                </>
              )}

              {modal.mode === 'edit' && (
                <div className="form-group">
                  <div style={{ fontSize: '0.875rem', color: 'var(--color-grey-600)', marginBottom: 4 }}>Employee</div>
                  <div style={{ fontWeight: 500 }}>{modal.item.employee_name}</div>
                  <div style={{ fontSize: '0.8125rem', color: 'var(--color-grey-600)', marginTop: 2 }}>
                    {modal.item.project_code} — {modal.item.project_name}
                  </div>
                </div>
              )}

              <div className="form-group">
                <label className="form-label">Date *</label>
                <input className="form-input" type="date" required value={form.date}
                  onChange={e => setForm(f => ({ ...f, date: e.target.value }))} />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                <div className="form-group">
                  <label className="form-label">Start Time *</label>
                  <input className="form-input" type="time" required value={form.start_time}
                    onChange={e => setForm(f => ({ ...f, start_time: e.target.value }))} />
                </div>
                <div className="form-group">
                  <label className="form-label">End Time *</label>
                  <input className="form-input" type="time" required value={form.end_time}
                    onChange={e => setForm(f => ({ ...f, end_time: e.target.value }))} />
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Notes</label>
                <textarea className="form-input" rows={2} value={form.notes}
                  style={{ resize: 'vertical' }}
                  onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
              </div>

              <div className="modal-footer" style={{ justifyContent: 'space-between' }}>
                <div>
                  {modal.mode === 'edit' && (
                    <button type="button" className="btn btn-amber"
                      onClick={() => { setModal(null); setConfirm({ id: modal.item.id }); }}>
                      Delete
                    </button>
                  )}
                </div>
                <div style={{ display: 'flex', gap: '0.75rem' }}>
                  <button type="button" className="btn btn-outline" onClick={() => setModal(null)}>Cancel</button>
                  <button type="submit" className="btn btn-solid" disabled={saving}>
                    {saving ? 'Saving…' : 'Save'}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete confirm */}
      {confirm && (
        <div className="modal-backdrop" onClick={() => setConfirm(null)}>
          <div className="modal" style={{ maxWidth: 400 }} onClick={e => e.stopPropagation()}>
            <h2 className="modal-title">Delete time entry?</h2>
            <p style={{ fontSize: '0.9rem', color: 'var(--color-grey-600)' }}>
              This entry will be permanently removed from all reports. This cannot be undone.
            </p>
            <div className="modal-footer">
              <button className="btn btn-outline" onClick={() => setConfirm(null)}>Cancel</button>
              <button className="btn btn-amber" disabled={saving} onClick={handleDelete}>
                {saving ? 'Deleting…' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}

function StatusBadge({ status }) {
  const styles = {
    approved:  { background: '#F0FDF4', color: 'var(--color-green)' },
    submitted: { background: '#FFFBEB', color: 'var(--color-amber)' },
    draft:     { background: '#F3F4F6', color: 'var(--color-grey-600)' },
    rejected:  { background: '#FEF2F2', color: 'var(--color-red)' },
  };
  const style = styles[status] ?? styles.draft;
  return (
    <span className="badge" style={style}>
      {STATUS_LABELS[status] ?? status}
    </span>
  );
}
