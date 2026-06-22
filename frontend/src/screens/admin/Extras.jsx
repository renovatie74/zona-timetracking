import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api }      from '../../api.js';
import { useAuth }  from '../../auth.jsx';
import AppShell     from '../AppShell.jsx';

const TYPE_LABELS = { extra_work: 'Extra Work', own_cost: 'Own Cost', mileage: 'Mileage' };
const EMPTY_FORM  = { user_id: '', project_id: '', type: 'own_cost', description: '', mileage_km: '' };

function fmtDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

function TypeBadge({ type }) {
  const cls = type === 'extra_work' ? 'ex-badge-work'
            : type === 'mileage'    ? 'ex-badge-mileage'
            :                        'ex-badge-cost';
  return <span className={`ex-type-badge ${cls}`}>{TYPE_LABELS[type] ?? type}</span>;
}

function StatusBadge({ status }) {
  return (
    <span className={`ex-status-badge ${status === 'open' ? 'ex-status-open' : 'ex-status-processed'}`}>
      {status === 'open' ? 'Open' : 'Processed'}
    </span>
  );
}

function ExtraValue({ ex }) {
  if (ex.type === 'mileage') return <span>{ex.mileage_km} km</span>;
  return <span className="ex-description-cell">{ex.description}</span>;
}

export default function AdminExtras() {
  const { user }    = useAuth();
  const navigate    = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const isAdmin = user?.role === 'administrator';

  const [statusFilter,  setStatusFilter]  = useState(searchParams.get('status')     ?? 'open');
  const [projectFilter, setProjectFilter] = useState(searchParams.get('project_id') ?? '');
  const [userFilter,    setUserFilter]    = useState(searchParams.get('user_id')    ?? '');
  const [typeFilter,    setTypeFilter]    = useState(searchParams.get('type')       ?? '');
  const [dateFrom,      setDateFrom]      = useState(searchParams.get('date_from')  ?? '');
  const [dateTo,        setDateTo]        = useState(searchParams.get('date_to')    ?? '');

  const [items,      setItems]      = useState([]);
  const [employees,  setEmployees]  = useState([]);
  const [projects,   setProjects]   = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState('');
  const [modal,      setModal]      = useState(null);
  const [confirm,    setConfirm]    = useState(null);
  const [saving,     setSaving]     = useState(false);
  const [form,       setForm]       = useState(EMPTY_FORM);

  useEffect(() => {
    api.get('/api/employees?status=active').then(d => setEmployees(Array.isArray(d) ? d : (d ?? []))).catch(() => {});
    api.get('/api/projects?status=all').then(d => setProjects(Array.isArray(d) ? d : (d?.data ?? []))).catch(() => {});
    load(statusFilter, projectFilter, userFilter, typeFilter, dateFrom, dateTo);
  }, []); // eslint-disable-line

  async function load(sf, pf, uf, tf, df, dt) {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams();
      if (sf) params.set('status',     sf);
      if (pf) params.set('project_id', pf);
      if (uf) params.set('user_id',    uf);
      if (tf) params.set('type',       tf);
      if (df) params.set('date_from',  df);
      if (dt) params.set('date_to',    dt);
      const qs = params.toString();
      const data = await api.get('/api/extras' + (qs ? `?${qs}` : ''));
      setItems(data?.data ?? data ?? []);
    } catch (e) {
      if (e.status === 401) { navigate('/login', { replace: true }); return; }
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  function applyFilters(sf, pf, uf, tf, df, dt) {
    setStatusFilter(sf);
    setProjectFilter(pf);
    setUserFilter(uf);
    setTypeFilter(tf);
    setDateFrom(df);
    setDateTo(dt);
    load(sf, pf, uf, tf, df, dt);
  }

  function handleReset() {
    applyFilters('open', '', '', '', '', '');
  }

  function openCreate() {
    setForm(EMPTY_FORM);
    setError('');
    setModal({ mode: 'create' });
  }

  function openEdit(item) {
    setForm({
      user_id:     String(item.user_id),
      project_id:  String(item.project_id),
      type:        item.type,
      description: item.description ?? '',
      mileage_km:  item.mileage_km != null ? String(item.mileage_km) : '',
    });
    setError('');
    setModal({ mode: 'edit', id: item.id, item });
  }

  async function handleSave(e) {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const body = {
        user_id:    Number(form.user_id),
        project_id: Number(form.project_id),
        type:       form.type,
      };
      if (form.type === 'mileage') {
        body.mileage_km = Number(form.mileage_km);
      } else {
        body.description = form.description;
      }
      if (modal.mode === 'create') {
        await api.post('/api/extras', body);
      } else {
        await api.put(`/api/extras/${modal.id}`, body);
      }
      setModal(null);
      load(statusFilter, projectFilter, userFilter, typeFilter, dateFrom, dateTo);
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleProcess(id) {
    setSaving(true);
    try {
      await api.post(`/api/extras/${id}/process`, {});
      load(statusFilter, projectFilter, userFilter, typeFilter, dateFrom, dateTo);
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleReopen(id) {
    setSaving(true);
    try {
      await api.post(`/api/extras/${id}/reopen`, {});
      load(statusFilter, projectFilter, userFilter, typeFilter, dateFrom, dateTo);
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
      await api.delete(`/api/extras/${confirm.id}`);
      setConfirm(null);
      load(statusFilter, projectFilter, userFilter, typeFilter, dateFrom, dateTo);
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  const colCount = 7;

  return (
    <AppShell title="Extras">
      <div className="page">
        <div className="page-header">
          <h1 className="page-title">Extras</h1>
          {isAdmin && (
            <button className="btn btn-solid" onClick={openCreate}>+ New Extra</button>
          )}
        </div>

        {/* Filters */}
        <div className="toolbar" style={{ flexWrap: 'wrap', gap: '0.5rem' }}>
          <select className="form-select toolbar-select" style={{ width: '140px' }}
            value={statusFilter}
            onChange={e => applyFilters(e.target.value, projectFilter, userFilter, typeFilter, dateFrom, dateTo)}>
            <option value="open">Open</option>
            <option value="processed">Processed</option>
            <option value="all">All</option>
          </select>

          <select className="form-select toolbar-select" style={{ width: '200px' }}
            value={projectFilter}
            onChange={e => applyFilters(statusFilter, e.target.value, userFilter, typeFilter, dateFrom, dateTo)}>
            <option value="">All Projects</option>
            {projects.map(p => (
              <option key={p.id} value={p.id}>[{p.project_code}] {p.name}</option>
            ))}
          </select>

          <select className="form-select toolbar-select" style={{ width: '180px' }}
            value={userFilter}
            onChange={e => applyFilters(statusFilter, projectFilter, e.target.value, typeFilter, dateFrom, dateTo)}>
            <option value="">All Employees</option>
            {employees.map(emp => (
              <option key={emp.id} value={emp.id}>{emp.first_name} {emp.last_name}</option>
            ))}
          </select>

          <select className="form-select toolbar-select" style={{ width: '150px' }}
            value={typeFilter}
            onChange={e => applyFilters(statusFilter, projectFilter, userFilter, e.target.value, dateFrom, dateTo)}>
            <option value="">All Types</option>
            <option value="own_cost">Own Cost</option>
            <option value="extra_work">Extra Work</option>
            <option value="mileage">Mileage</option>
          </select>

          <input type="date" className="form-input toolbar-select" style={{ width: '145px' }}
            value={dateFrom}
            onChange={e => applyFilters(statusFilter, projectFilter, userFilter, typeFilter, e.target.value, dateTo)} />
          <input type="date" className="form-input toolbar-select" style={{ width: '145px' }}
            value={dateTo}
            onChange={e => applyFilters(statusFilter, projectFilter, userFilter, typeFilter, dateFrom, e.target.value)} />

          <button className="btn btn-outline toolbar-reset" onClick={handleReset}>Reset</button>
        </div>

        {error && !modal && <div className="error-banner">{error}</div>}

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Employee</th>
                <th>Project</th>
                <th>Type</th>
                <th>Value</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr className="empty-row"><td colSpan={colCount}>Loading…</td></tr>
              ) : items.length === 0 ? (
                <tr className="empty-row"><td colSpan={colCount}>No extras found.</td></tr>
              ) : items.map(ex => (
                <tr key={ex.id}>
                  <td style={{ whiteSpace: 'nowrap' }}>{fmtDate(ex.created_at)}</td>
                  <td>
                    <span style={{ fontWeight: 500 }}>{ex.employee_name}</span>
                    <span style={{ marginLeft: 6, fontSize: '0.8rem', color: 'var(--color-grey-600)' }}>
                      {ex.employee_code}
                    </span>
                  </td>
                  <td>
                    <span style={{ fontWeight: 500 }}>{ex.project_name}</span>
                    {ex.project_code && (
                      <span style={{ marginLeft: 6, fontSize: '0.8rem', color: 'var(--color-grey-600)' }}>
                        {ex.project_code}
                      </span>
                    )}
                  </td>
                  <td><TypeBadge type={ex.type} /></td>
                  <td style={{ maxWidth: 320 }}><ExtraValue ex={ex} /></td>
                  <td><StatusBadge status={ex.status} /></td>
                  <td>
                    <div className="td-actions">
                      {ex.status === 'open' ? (
                        <button className="btn-ghost btn-ghost-green" disabled={saving}
                          onClick={() => handleProcess(ex.id)}>
                          Mark Processed
                        </button>
                      ) : (
                        <button className="btn-ghost" disabled={saving}
                          onClick={() => handleReopen(ex.id)}>
                          Reopen
                        </button>
                      )}
                      {isAdmin && (
                        <>
                          <button className="btn-ghost" onClick={() => openEdit(ex)}>Edit</button>
                          <button className="btn-ghost btn-ghost-danger"
                            onClick={() => setConfirm({ id: ex.id })}>
                            Delete
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Create/Edit modal */}
      {modal && (
        <div className="modal-backdrop" onClick={() => setModal(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h2 className="modal-title">
              {modal.mode === 'create' ? 'New Extra' : 'Edit Extra'}
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
                <label className="form-label">Project *</label>
                <select className="form-select" required value={form.project_id}
                  onChange={e => setForm(f => ({ ...f, project_id: e.target.value }))}>
                  <option value="">— Select project —</option>
                  {projects.map(p => (
                    <option key={p.id} value={p.id}>[{p.project_code}] {p.name}</option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label className="form-label">Type *</label>
                <select className="form-select" value={form.type}
                  onChange={e => setForm(f => ({ ...f, type: e.target.value }))}>
                  <option value="own_cost">Own Cost</option>
                  <option value="extra_work">Extra Work</option>
                  <option value="mileage">Mileage</option>
                </select>
              </div>

              {form.type === 'mileage' ? (
                <div className="form-group">
                  <label className="form-label">Mileage (km) *</label>
                  <input
                    type="number"
                    className="form-input"
                    required
                    min="0.01"
                    step="0.01"
                    placeholder="e.g. 42 or 18.5"
                    value={form.mileage_km}
                    onChange={e => setForm(f => ({ ...f, mileage_km: e.target.value }))}
                  />
                </div>
              ) : (
                <div className="form-group">
                  <label className="form-label">Description *</label>
                  <textarea className="form-input" required rows={4}
                    style={{ resize: 'vertical', minHeight: 80 }}
                    value={form.description}
                    onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                  />
                </div>
              )}

              <div className="modal-footer">
                <button type="button" className="btn btn-outline" onClick={() => setModal(null)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-solid" disabled={saving}>
                  {saving ? 'Saving…' : modal.mode === 'create' ? 'Create' : 'Save'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete confirmation */}
      {confirm && (
        <div className="modal-backdrop" onClick={() => setConfirm(null)}>
          <div className="modal" style={{ maxWidth: 400 }} onClick={e => e.stopPropagation()}>
            <h2 className="modal-title">Delete Extra?</h2>
            <p style={{ color: 'var(--color-grey-700)', margin: '0 0 1.5rem' }}>
              This will permanently remove the extra from the queue.
            </p>
            <div className="modal-footer">
              <button className="btn btn-outline" onClick={() => setConfirm(null)}>Cancel</button>
              <button className="btn btn-solid"
                style={{ background: 'var(--color-danger, #dc2626)' }}
                onClick={handleDelete} disabled={saving}>
                {saving ? 'Deleting…' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}
