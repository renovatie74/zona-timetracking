import { useState, useEffect } from 'react';
import { useNavigate }         from 'react-router-dom';
import { api }     from '../../api.js';
import { useAuth } from '../../auth.jsx';
import AppShell    from '../AppShell.jsx';

function fmtWeek(weekStart) {
  if (!weekStart) return '—';
  const d = new Date(weekStart + 'T00:00:00Z');
  const end = new Date(d);
  end.setUTCDate(d.getUTCDate() + 6);
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${months[d.getUTCMonth()]} ${d.getUTCDate()} – ${months[end.getUTCMonth()]} ${end.getUTCDate()}, ${end.getUTCFullYear()}`;
}

function fmtDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

function mondayOf(dateStr) {
  const d   = new Date(dateStr + 'T00:00:00Z');
  const day = d.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setUTCDate(d.getUTCDate() + diff);
  return d.toISOString().slice(0, 10);
}

const EMPTY_FORM = { user_id: '', week_start: '', mileage_km: '' };

export default function AdminMileage() {
  const { user }  = useAuth();
  const navigate  = useNavigate();

  const [weekFilter, setWeekFilter] = useState('');
  const [userFilter, setUserFilter] = useState('');

  const [items,     setItems]     = useState([]);
  const [employees, setEmployees] = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [error,     setError]     = useState('');
  const [modal,     setModal]     = useState(null);
  const [saving,    setSaving]    = useState(false);
  const [form,      setForm]      = useState(EMPTY_FORM);

  const isAdmin = user?.role === 'administrator';

  useEffect(() => {
    api.get('/api/employees?status=active')
      .then(d => setEmployees(Array.isArray(d) ? d : (d ?? [])))
      .catch(() => {});
    load('', '');
  }, []); // eslint-disable-line

  async function load(wf, uf) {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams();
      if (wf) params.set('week_start', wf);
      if (uf) params.set('user_id',    uf);
      const qs   = params.toString();
      const data = await api.get('/api/mileage' + (qs ? `?${qs}` : ''));
      setItems(data?.data ?? data ?? []);
    } catch (e) {
      if (e.status === 401) { navigate('/login', { replace: true }); return; }
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  function applyFilters(wf, uf) {
    setWeekFilter(wf);
    setUserFilter(uf);
    load(wf, uf);
  }

  function openCreate() {
    setForm(EMPTY_FORM);
    setError('');
    setModal({ mode: 'create' });
  }

  function openEdit(item) {
    setForm({
      user_id:    String(item.user_id),
      week_start: item.week_start,
      mileage_km: String(item.mileage_km),
    });
    setError('');
    setModal({ mode: 'edit', item });
  }

  async function handleSave(e) {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const userId    = Number(form.user_id);
      const weekStart = mondayOf(form.week_start);
      const km        = Number(form.mileage_km);

      await api.put(`/api/mileage/${userId}/${weekStart}`, { mileage_km: km });
      setModal(null);
      load(weekFilter, userFilter);
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <AppShell title="Mileage">
      <div className="page">
        <div className="page-header">
          <h1 className="page-title">Weekly Mileage</h1>
          {isAdmin && (
            <button className="btn btn-solid" onClick={openCreate}>+ Add Entry</button>
          )}
        </div>

        {/* Filters */}
        <div className="toolbar" style={{ flexWrap: 'wrap', gap: '0.5rem' }}>
          <input
            type="date"
            className="form-input toolbar-select"
            style={{ width: '160px' }}
            title="Filter by week (pick any day — shows that week)"
            value={weekFilter}
            onChange={e => applyFilters(e.target.value ? mondayOf(e.target.value) : '', userFilter)}
          />

          <select className="form-select toolbar-select" style={{ width: '200px' }}
            value={userFilter}
            onChange={e => applyFilters(weekFilter, e.target.value)}>
            <option value="">All Employees</option>
            {employees.map(emp => (
              <option key={emp.id} value={emp.id}>{emp.first_name} {emp.last_name}</option>
            ))}
          </select>

          <button className="btn btn-outline toolbar-reset"
            onClick={() => applyFilters('', '')}>
            Reset
          </button>
        </div>

        {error && !modal && <div className="error-banner">{error}</div>}

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Week</th>
                <th>Employee</th>
                <th>Mileage (km)</th>
                <th>Updated</th>
                {isAdmin && <th>Actions</th>}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr className="empty-row"><td colSpan={isAdmin ? 5 : 4}>Loading…</td></tr>
              ) : items.length === 0 ? (
                <tr className="empty-row"><td colSpan={isAdmin ? 5 : 4}>No mileage records found.</td></tr>
              ) : items.map(item => (
                <tr key={`${item.user_id}-${item.week_start}`}>
                  <td style={{ whiteSpace: 'nowrap' }}>{fmtWeek(item.week_start)}</td>
                  <td>
                    <span style={{ fontWeight: 500 }}>{item.employee_name}</span>
                    <span style={{ marginLeft: 6, fontSize: '0.8rem', color: 'var(--color-grey-600)' }}>
                      {item.employee_code}
                    </span>
                  </td>
                  <td style={{ fontWeight: 600 }}>{item.mileage_km} km</td>
                  <td style={{ whiteSpace: 'nowrap', color: 'var(--color-grey-600)' }}>
                    {fmtDate(item.updated_at)}
                  </td>
                  {isAdmin && (
                    <td>
                      <button className="btn-ghost" onClick={() => openEdit(item)}>Edit</button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {modal && (
        <div className="modal-backdrop" onClick={() => setModal(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h2 className="modal-title">
              {modal.mode === 'create' ? 'Add Mileage Entry' : 'Edit Mileage'}
            </h2>
            <form onSubmit={handleSave}>
              {error && <div className="error-banner">{error}</div>}

              <div className="form-group">
                <label className="form-label">Employee *</label>
                <select className="form-select" required value={form.user_id}
                  onChange={e => setForm(f => ({ ...f, user_id: e.target.value }))}>
                  <option value="">— Select employee —</option>
                  {employees.map(emp => (
                    <option key={emp.id} value={emp.id}>
                      {emp.first_name} {emp.last_name} ({emp.employee_code})
                    </option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label className="form-label">Week (pick any day in the week) *</label>
                <input
                  type="date"
                  className="form-input"
                  required
                  value={form.week_start}
                  onChange={e => setForm(f => ({ ...f, week_start: e.target.value }))}
                />
              </div>

              <div className="form-group">
                <label className="form-label">Mileage (km) *</label>
                <input
                  type="number"
                  className="form-input"
                  required
                  min="0.01"
                  step="0.01"
                  placeholder="e.g. 142.5"
                  value={form.mileage_km}
                  onChange={e => setForm(f => ({ ...f, mileage_km: e.target.value }))}
                />
              </div>

              <div className="modal-footer">
                <button type="button" className="btn btn-outline" onClick={() => setModal(null)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-solid" disabled={saving}>
                  {saving ? 'Saving…' : modal.mode === 'create' ? 'Save' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </AppShell>
  );
}
