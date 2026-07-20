import { useState, useEffect } from 'react';
import { api }      from '../../api.js';
import AppShell     from '../AppShell.jsx';
import { useToast } from '../../hooks/useToast.jsx';
import { weekStartFor } from '../../lib/weekUtils.js';

function addWeeks(dateStr, n) {
  const d = new Date(dateStr + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n * 7);
  return d.toISOString().slice(0, 10);
}

function fmtWeek(weekStart) {
  if (!weekStart) return '—';
  const d   = new Date(weekStart + 'T00:00:00Z');
  const end = new Date(weekStart + 'T00:00:00Z');
  end.setUTCDate(d.getUTCDate() + 6);
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${months[d.getUTCMonth()]} ${d.getUTCDate()} – ${months[end.getUTCMonth()]} ${end.getUTCDate()}, ${end.getUTCFullYear()}`;
}

function fmtDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso + 'T00:00:00Z');
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${months[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}`;
}

const TODAY = new Date().toISOString().slice(0, 10);

export default function AdminMileage() {
  const { toast } = useToast();

  const [weekFilter,    setWeekFilter]    = useState(() => weekStartFor(TODAY));
  const [userFilter,    setUserFilter]    = useState('');
  const [projectFilter, setProjectFilter] = useState('');
  const [statusFilter,  setStatusFilter]  = useState('all');

  const [items,      setItems]      = useState([]);
  const [employees,  setEmployees]  = useState([]);
  const [projects,   setProjects]   = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState('');
  const [completing, setCompleting] = useState(null);
  const [reopening,  setReopening]  = useState(null);

  useEffect(() => {
    api.get('/api/employees?status=active')
      .then(d => setEmployees(Array.isArray(d) ? d : (d ?? [])))
      .catch(() => {});
    api.get('/api/projects')
      .then(d => setProjects(Array.isArray(d) ? d : (d?.data ?? d ?? [])))
      .catch(() => {});
    load(weekStartFor(TODAY), '', '', 'all');
  }, []); // eslint-disable-line

  async function load(week, uid, pid, sf) {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams();
      if (week) params.set('week', week);
      if (uid)  params.set('user_id', uid);
      if (pid)  params.set('project_id', pid);
      if (sf !== 'all') params.set('status', sf);
      const data = await api.get('/api/mileage?' + params.toString());
      setItems(data?.data ?? data ?? []);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  function applyFilters(week, uid, pid, sf) {
    setWeekFilter(week);
    setUserFilter(uid);
    setProjectFilter(pid);
    setStatusFilter(sf);
    load(week, uid, pid, sf);
  }

  function goWeek(delta) {
    const ws = addWeeks(weekFilter, delta);
    applyFilters(ws, userFilter, projectFilter, statusFilter);
  }

  async function handleComplete(item) {
    setCompleting(item.id);
    try {
      await api.post(`/api/mileage/${item.id}/complete`, {});
      toast('Mileage entry marked complete.');
      load(weekFilter, userFilter, projectFilter, statusFilter);
    } catch (e) {
      setError(e.message);
    } finally {
      setCompleting(null);
    }
  }

  async function handleReopen(item) {
    setReopening(item.id);
    try {
      await api.post(`/api/mileage/${item.id}/reopen`, {});
      toast('Mileage entry reopened.');
      load(weekFilter, userFilter, projectFilter, statusFilter);
    } catch (e) {
      setError(e.message);
    } finally {
      setReopening(null);
    }
  }

  function resetFilters() {
    applyFilters(weekStartFor(TODAY), '', '', 'all');
  }

  const totalKm = items.reduce((s, i) => s + i.km, 0);

  return (
    <AppShell title="Mileage">
      <div className="page">
        <div className="page-header">
          <h1 className="page-title">Mileage</h1>
        </div>

        {/* Week nav */}
        <div className="toolbar" style={{ alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
            <button className="btn btn-outline" style={{ padding: '0.4rem 0.75rem' }} onClick={() => goWeek(-1)}>‹ Prev</button>
            <span style={{ padding: '0 0.5rem', fontSize: '0.875rem', fontWeight: 500, whiteSpace: 'nowrap' }}>
              {fmtWeek(weekFilter)}
            </span>
            <button className="btn btn-outline" style={{ padding: '0.4rem 0.75rem' }} onClick={() => goWeek(1)}>Next ›</button>
          </div>

          {/* Employee filter */}
          <select
            className="form-select toolbar-select"
            style={{ width: '200px' }}
            value={userFilter}
            onChange={e => applyFilters(weekFilter, e.target.value, projectFilter, statusFilter)}
          >
            <option value="">All Employees</option>
            {employees.map(emp => (
              <option key={emp.id} value={emp.id}>
                {emp.first_name} {emp.last_name}
              </option>
            ))}
          </select>

          {/* Project filter */}
          <select
            className="form-select toolbar-select"
            style={{ width: '200px' }}
            value={projectFilter}
            onChange={e => applyFilters(weekFilter, userFilter, e.target.value, statusFilter)}
          >
            <option value="">All Projects</option>
            {projects.map(p => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>

          {/* Status filter */}
          <select
            className="form-select toolbar-select"
            style={{ width: '140px' }}
            value={statusFilter}
            onChange={e => applyFilters(weekFilter, userFilter, projectFilter, e.target.value)}
          >
            <option value="all">All Statuses</option>
            <option value="open">Open</option>
            <option value="completed">Completed</option>
          </select>

          <button className="btn btn-outline toolbar-reset" onClick={resetFilters}>Reset</button>
        </div>

        {error && <div className="error-banner">{error}</div>}

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Employee</th>
                <th>Project</th>
                <th>Km</th>
                <th>Note</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr className="empty-row"><td colSpan={7}>Loading…</td></tr>
              ) : items.length === 0 ? (
                <tr className="empty-row"><td colSpan={7}>No mileage entries found.</td></tr>
              ) : items.map(item => (
                <tr key={item.id}>
                  <td style={{ whiteSpace: 'nowrap' }}>{fmtDate(item.work_date)}</td>
                  <td>
                    <span style={{ fontWeight: 500 }}>{item.employee_name}</span>
                    {item.employee_code && (
                      <span style={{ marginLeft: 6, fontSize: '0.8rem', color: 'var(--color-grey-600)' }}>
                        {item.employee_code}
                      </span>
                    )}
                  </td>
                  <td>
                    <span>{item.project_name}</span>
                    {item.project_code && (
                      <span style={{ marginLeft: 6, fontSize: '0.8rem', color: 'var(--color-grey-600)' }}>
                        {item.project_code}
                      </span>
                    )}
                  </td>
                  <td style={{ fontWeight: 600, whiteSpace: 'nowrap' }}>{item.km} km</td>
                  <td style={{ color: 'var(--color-grey-700)', fontSize: '0.875rem' }}>
                    {item.note ?? '—'}
                  </td>
                  <td>
                    {item.status === 'completed' ? (
                      <span className="badge" style={{ background: 'var(--color-green-50,#f0fdf4)', color: 'var(--color-green)', border: '1px solid currentColor' }}>
                        Completed
                      </span>
                    ) : (
                      <span className="badge" style={{ background: 'var(--color-amber-50,#fffbeb)', color: 'var(--color-amber-dark,#92660a)', border: '1px solid currentColor' }}>
                        Open
                      </span>
                    )}
                  </td>
                  <td>
                    {item.status === 'open' && (
                      <button
                        className="btn-ghost btn-ghost-green"
                        disabled={completing === item.id}
                        onClick={() => handleComplete(item)}
                      >
                        {completing === item.id ? 'Saving…' : 'Mark Complete'}
                      </button>
                    )}
                    {item.status === 'completed' && (
                      <button
                        className="btn-ghost"
                        disabled={reopening === item.id}
                        onClick={() => handleReopen(item)}
                      >
                        {reopening === item.id ? 'Saving…' : 'Reopen'}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {!loading && items.length > 0 && (
          <div style={{ marginTop: '0.75rem', fontSize: '0.875rem', color: 'var(--color-grey-700)', textAlign: 'right' }}>
            Total: <strong>{totalKm.toFixed(1)} km</strong> ({items.length} {items.length === 1 ? 'entry' : 'entries'})
          </div>
        )}
      </div>
    </AppShell>
  );
}
