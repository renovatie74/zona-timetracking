import { useState, useEffect } from 'react';
import { api }                 from '../../api.js';
import { useAuth }             from '../../auth.jsx';
import AppShell                from '../AppShell.jsx';
import { validateTime, stepTime } from '../../lib/timeInput.js';
import { weekEndFor } from '../../lib/weekUtils.js';
import WeekSelector from '../../components/WeekSelector.jsx';
import { useToast }  from '../../hooks/useToast.jsx';

// ── Date helpers ──────────────────────────────────────────────────────────────

function isoDate(d) {
  return d.toISOString().slice(0, 10);
}

function weekRange(weekOffset = 0) {
  const today = new Date();
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
  return null;
}

// ── Formatters ────────────────────────────────────────────────────────────────

function fmtDuration(mins) {
  if (!mins && mins !== 0) return '—';
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m > 0 ? `${h}h ${String(m).padStart(2, '0')}m` : `${h}h`;
}

function sourceLabel(row) {
  return row.created_by === row.user_id ? 'My Day' : 'Admin';
}

// ── Quick-pick time buttons ───────────────────────────────────────────────────

const START_QUICK = ['07:00', '08:00', '08:30', '09:00'];
const END_QUICK   = ['16:00', '17:00', '17:30', '18:00'];

const EMPTY_FORM = { user_id: '', work_date: '', start_time: '', finish_time: '' };

// ── Component ─────────────────────────────────────────────────────────────────

export default function Attendance() {
  const { user }   = useAuth();
  const { toast }  = useToast();
  const isAdmin    = user?.role === 'administrator';

  const [items,      setItems]      = useState([]);
  const [employees,  setEmployees]  = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [preset,     setPreset]     = useState('this_week');
  const [dateFrom,   setDateFrom]   = useState(() => weekRange(0).from);
  const [dateTo,     setDateTo]     = useState(() => weekRange(0).to);
  const [userFilter, setUserFilter] = useState('');
  const [modal,      setModal]      = useState(null);
  const [confirm,    setConfirm]    = useState(null);
  const [form,       setForm]       = useState(EMPTY_FORM);
  const [saving,     setSaving]     = useState(false);
  const [error,      setError]      = useState('');
  const [startErr,   setStartErr]   = useState('');
  const [endErr,     setEndErr]     = useState('');

  useEffect(() => {
    api.get('/api/employees?status=active').then(emps => {
      setEmployees(Array.isArray(emps) ? emps : (emps ?? []));
    }).catch(() => {});
    load({ dateFrom: weekRange(0).from, dateTo: weekRange(0).to });
  }, []); // eslint-disable-line

  async function load(overrides = {}) {
    setLoading(true);
    setError('');
    try {
      const df = overrides.dateFrom  ?? dateFrom;
      const dt = overrides.dateTo    ?? dateTo;
      const uf = overrides.userFilter ?? userFilter;
      const p  = new URLSearchParams();
      if (df) p.set('date_from', df);
      if (dt) p.set('date_to',   dt);
      if (uf) p.set('user_id',   uf);
      const data = await api.get('/api/attendance' + (p.toString() ? `?${p}` : ''));
      setItems(Array.isArray(data) ? data : (data ?? []));
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  function applyPreset(newPreset) {
    setPreset(newPreset);
    if (newPreset !== 'custom') {
      const { from, to } = presetDates(newPreset);
      setDateFrom(from); setDateTo(to);
      load({ dateFrom: from, dateTo: to });
    }
  }

  function applyUser(value) {
    setUserFilter(value);
    load({ userFilter: value });
  }

  function handleReset() {
    const { from, to } = weekRange(0);
    setPreset('this_week');
    setDateFrom(from); setDateTo(to);
    setUserFilter('');
    load({ dateFrom: from, dateTo: to, userFilter: '' });
  }

  useEffect(() => {
    function onKey(e) {
      if (e.key !== 'Escape') return;
      if (confirm) { setConfirm(null); return; }
      if (modal)   { setModal(null);   return; }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [modal, confirm]);

  function openCreate() {
    setForm({ ...EMPTY_FORM, work_date: new Date().toISOString().slice(0, 10) });
    setError(''); setStartErr(''); setEndErr('');
    setModal({ mode: 'create' });
  }

  function openEdit(item) {
    setForm({
      user_id:    String(item.user_id),
      work_date:  item.work_date,
      start_time: item.start_time,
      finish_time: item.finish_time,
    });
    setError(''); setStartErr(''); setEndErr('');
    setModal({ mode: 'edit', item });
  }

  async function handleSave(e) {
    e.preventDefault();
    const se = validateTime(form.start_time);
    const ee = validateTime(form.finish_time);
    setStartErr(se ?? '');
    setEndErr(ee ?? '');
    if (se || ee) return;
    if (form.start_time >= form.finish_time) {
      setEndErr('Finish time must be after start time.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      if (modal.mode === 'create') {
        await api.post('/api/attendance', {
          user_id:    Number(form.user_id),
          work_date:  form.work_date,
          start_time: form.start_time,
          finish_time: form.finish_time,
        });
        toast('Attendance saved.');
      } else {
        await api.put(`/api/attendance/${modal.item.id}`, {
          start_time:  form.start_time,
          finish_time: form.finish_time,
        });
        toast('Attendance updated.');
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
      await api.delete(`/api/attendance/${confirm.id}`);
      toast('Attendance record deleted.');
      setConfirm(null);
      load();
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  const empOptions = employees.filter(e => e.id !== undefined);

  return (
    <AppShell title="Attendance">
      <div className="page">
        <div className="page-header">
          <h1 className="page-title">Attendance</h1>
          <button className="btn btn-solid" onClick={openCreate}>+ New Entry</button>
        </div>

        {/* Toolbar */}
        <div className="toolbar" style={{ flexWrap: 'wrap', gap: '10px' }}>
          <select className="form-select toolbar-select" style={{ width: 150 }}
            value={preset} onChange={e => applyPreset(e.target.value)}>
            {PRESETS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
          </select>

          {(preset === 'this_week' || preset === 'prev_week') && (
            <WeekSelector weekStart={dateFrom} onChange={w => {
              setDateFrom(w);
              const we = weekEndFor(w);
              setDateTo(we);
              load({ dateFrom: w, dateTo: we });
            }} />
          )}

          {preset === 'custom' && (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <label style={{ fontSize: '0.8125rem', color: 'var(--color-grey-600)', whiteSpace: 'nowrap' }}>From</label>
                <input type="date" className="form-input" style={{ height: 44, width: 148, padding: '0 10px' }}
                  value={dateFrom} onChange={e => { setDateFrom(e.target.value); load({ dateFrom: e.target.value }); }} />
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <label style={{ fontSize: '0.8125rem', color: 'var(--color-grey-600)', whiteSpace: 'nowrap' }}>To</label>
                <input type="date" className="form-input" style={{ height: 44, width: 148, padding: '0 10px' }}
                  value={dateTo} onChange={e => { setDateTo(e.target.value); load({ dateTo: e.target.value }); }} />
              </div>
            </>
          )}

          <select className="form-select toolbar-select" style={{ width: 200 }}
            value={userFilter} onChange={e => applyUser(e.target.value)}>
            <option value="">All Employees</option>
            {empOptions.map(e => (
              <option key={e.id} value={e.id}>{e.first_name} {e.last_name}</option>
            ))}
          </select>

          <button className="btn btn-outline toolbar-reset" onClick={handleReset}>Reset</button>
        </div>

        {error && !modal && <div className="error-banner">{error}</div>}

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Employee</th>
                <th>Start</th>
                <th>Finish</th>
                <th>Duration</th>
                <th>Source</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr className="empty-row"><td colSpan={7}>Loading…</td></tr>
              ) : items.length === 0 ? (
                <tr className="empty-row"><td colSpan={7}>No attendance records found.</td></tr>
              ) : items.map(item => (
                <tr key={item.id}>
                  <td style={{ whiteSpace: 'nowrap' }}>{item.work_date}</td>
                  <td>
                    <span style={{ fontWeight: 500 }}>{item.employee_name}</span>
                    <span style={{ fontSize: '0.8125rem', color: 'var(--color-grey-500)', marginLeft: 6 }}>{item.employee_code}</span>
                  </td>
                  <td style={{ fontVariantNumeric: 'tabular-nums' }}>{item.start_time}</td>
                  <td style={{ fontVariantNumeric: 'tabular-nums' }}>{item.finish_time}</td>
                  <td style={{ fontWeight: 600 }}>{fmtDuration(item.duration_minutes)}</td>
                  <td>
                    <span style={{ fontSize: '0.75rem', color: item.created_by === item.user_id ? 'var(--color-grey-600)' : 'var(--color-gold)' }}>
                      {sourceLabel(item)}
                    </span>
                  </td>
                  <td>
                    <div className="td-actions">
                      <button className="btn-ghost" onClick={() => openEdit(item)}>Edit</button>
                      {isAdmin && (
                        <button className="btn-ghost" style={{ color: 'var(--color-red)' }}
                          onClick={() => setConfirm({ id: item.id, name: item.employee_name, date: item.work_date })}>
                          Delete
                        </button>
                      )}
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
              {modal.mode === 'create' ? 'New Attendance Entry' : 'Edit Attendance'}
            </h2>
            <form onSubmit={handleSave}>
              {error && <div className="error-banner">{error}</div>}

              {modal.mode === 'create' ? (
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
              ) : (
                <div className="form-group">
                  <div style={{ fontSize: '0.8125rem', color: 'var(--color-grey-600)', marginBottom: 2 }}>Employee</div>
                  <div style={{ fontWeight: 500 }}>{modal.item.employee_name}</div>
                </div>
              )}

              <div className="form-group">
                <label className="form-label">Date *</label>
                {modal.mode === 'create' ? (
                  <input className="form-input" type="date" required value={form.work_date}
                    onChange={e => setForm(f => ({ ...f, work_date: e.target.value }))} />
                ) : (
                  <div style={{ fontWeight: 500, padding: '0.5625rem 0' }}>{form.work_date}</div>
                )}
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                {/* Start */}
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Start *</label>
                  <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                    <button type="button" className="btn-step"
                      onClick={() => { const v = stepTime(form.start_time || '08:00', -15); setForm(f => ({ ...f, start_time: v })); setStartErr(validateTime(v) ?? ''); }}>−</button>
                    <input className={`form-input${startErr ? ' error' : ''}`}
                      type="text" placeholder="HH:MM"
                      value={form.start_time}
                      onChange={e => { setStartErr(''); setForm(f => ({ ...f, start_time: e.target.value })); }}
                      onBlur={() => setStartErr(validateTime(form.start_time) ?? '')}
                      style={{ textAlign: 'center', fontVariantNumeric: 'tabular-nums', flex: 1 }} />
                    <button type="button" className="btn-step"
                      onClick={() => { const v = stepTime(form.start_time || '07:45', 15); setForm(f => ({ ...f, start_time: v })); setStartErr(validateTime(v) ?? ''); }}>+</button>
                  </div>
                  {startErr && <div className="form-error">{startErr}</div>}
                  <div className="time-quick-row">
                    {START_QUICK.map(t => (
                      <button key={t} type="button" className="btn-time-quick"
                        onClick={() => { setStartErr(''); setForm(f => ({ ...f, start_time: t })); }}>{t}</button>
                    ))}
                  </div>
                </div>

                {/* Finish */}
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Finish *</label>
                  <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                    <button type="button" className="btn-step"
                      onClick={() => { const v = stepTime(form.finish_time || '17:00', -15); setForm(f => ({ ...f, finish_time: v })); setEndErr(validateTime(v) ?? ''); }}>−</button>
                    <input className={`form-input${endErr ? ' error' : ''}`}
                      type="text" placeholder="HH:MM"
                      value={form.finish_time}
                      onChange={e => { setEndErr(''); setForm(f => ({ ...f, finish_time: e.target.value })); }}
                      onBlur={() => setEndErr(validateTime(form.finish_time) ?? '')}
                      style={{ textAlign: 'center', fontVariantNumeric: 'tabular-nums', flex: 1 }} />
                    <button type="button" className="btn-step"
                      onClick={() => { const v = stepTime(form.finish_time || '16:45', 15); setForm(f => ({ ...f, finish_time: v })); setEndErr(validateTime(v) ?? ''); }}>+</button>
                  </div>
                  {endErr && <div className="form-error">{endErr}</div>}
                  <div className="time-quick-row">
                    {END_QUICK.map(t => (
                      <button key={t} type="button" className="btn-time-quick"
                        onClick={() => { setEndErr(''); setForm(f => ({ ...f, finish_time: t })); }}>{t}</button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="modal-footer">
                <button type="button" className="btn btn-outline" onClick={() => setModal(null)}>Cancel</button>
                <button type="submit" className="btn btn-solid" disabled={saving}>
                  {saving ? 'Saving…' : 'Save'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete confirm */}
      {confirm && (
        <div className="modal-backdrop" onClick={() => setConfirm(null)}>
          <div className="modal" style={{ maxWidth: 400 }} onClick={e => e.stopPropagation()}>
            <h2 className="modal-title">Delete attendance record?</h2>
            <p style={{ fontSize: '0.9rem', color: 'var(--color-grey-600)' }}>
              {confirm.name} — {confirm.date}. This cannot be undone.
            </p>
            <div className="modal-footer">
              <button className="btn btn-outline" onClick={() => setConfirm(null)}>Cancel</button>
              <button className="btn btn-danger" disabled={saving} onClick={handleDelete}>
                {saving ? 'Deleting…' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}
