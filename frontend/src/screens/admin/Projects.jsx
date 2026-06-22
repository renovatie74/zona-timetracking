import { useState, useEffect } from 'react';
import { useNavigate }         from 'react-router-dom';
import { api }                 from '../../api.js';
import { useAuth }             from '../../auth.jsx';
import AppShell                from '../AppShell.jsx';

const STATUSES = ['planning', 'active', 'completed', 'cancelled'];

function statusBadge(s) {
  return <span className={`badge badge-${s}`}>{s.charAt(0).toUpperCase() + s.slice(1)}</span>;
}

const EMPTY = { name: '', client_id: '', location: '', status: 'planning', start_date: '', end_date: '' };

export default function Projects() {
  const { user }   = useAuth();
  const navigate   = useNavigate();
  const isAdmin    = user?.role === 'administrator';

  const [items,        setItems]        = useState([]);
  const [clients,      setClients]      = useState([]);
  const [employees,    setEmployees]    = useState([]);    // active employees for assignment list
  const [assignedIds,  setAssignedIds]  = useState([]);    // currently assigned user_ids in edit modal
  const [modalExtras,  setModalExtras]  = useState([]);    // open extras shown in edit modal
  const [loading,      setLoading]      = useState(true);
  const [search,       setSearch]       = useState('');
  const [statusFilter, setStatusFilter] = useState('');   // '' = planning+active (default)
  const [clientFilter, setClientFilter] = useState('');
  const [modal,        setModal]        = useState(null);
  const [confirm,      setConfirm]      = useState(null);
  const [saving,       setSaving]       = useState(false);
  const [error,        setError]        = useState('');
  const [form,         setForm]         = useState(EMPTY);

  useEffect(() => {
    load('', '', '');
    api.get('/api/clients').then(setClients).catch(() => {});
    api.get('/api/employees?status=active').then(emps => {
      setEmployees(Array.isArray(emps) ? emps : (emps ?? []));
    }).catch(() => {});
  }, []);  // eslint-disable-line

  async function load(q, sf, cf) {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams();
      if (q)  params.set('search', q);
      if (sf) params.set('status', sf);
      if (cf) params.set('client_id', cf);
      const qs = params.toString();
      const data = await api.get('/api/projects' + (qs ? `?${qs}` : ''));
      setItems(data);
    } catch (e) {
      if (e.status === 401) navigate('/login', { replace: true });
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  function handleSearchChange(e) {
    const q = e.target.value;
    setSearch(q);
    load(q, statusFilter, clientFilter);
  }

  function handleStatusFilter(e) {
    const sf = e.target.value;
    setStatusFilter(sf);
    load(search, sf, clientFilter);
  }

  function handleClientFilter(e) {
    const cf = e.target.value;
    setClientFilter(cf);
    load(search, statusFilter, cf);
  }

  function openCreate() {
    setForm(EMPTY);
    setError('');
    setModal({ mode: 'create' });
  }

  function openEdit(item) {
    setForm({
      name:      item.name      ?? '',
      client_id: item.client_id ? String(item.client_id) : '',
      location:  item.location  ?? '',
      status:    item.status    ?? 'planning',
      start_date: item.start_date ?? '',
      end_date:  item.end_date   ?? '',
    });
    setAssignedIds([]);
    setError('');
    setModal({ mode: 'edit', id: item.id, item });
    // Load current assignments and open extras asynchronously
    api.get(`/api/projects/${item.id}/assignments`).then(data => {
      const rows = Array.isArray(data) ? data : (data ?? []);
      setAssignedIds(rows.map(r => r.id));
    }).catch(() => {});
    setModalExtras([]);
    api.get(`/api/extras?project_id=${item.id}&status=open`).then(data => {
      setModalExtras(data?.data ?? []);
    }).catch(() => {});
  }

  async function handleSave(e) {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const body = {
        ...form,
        client_id: form.client_id ? Number(form.client_id) : null,
        end_date: form.end_date || null,
      };
      if (modal.mode === 'create') {
        await api.post('/api/projects', body);
      } else {
        await Promise.all([
          api.put(`/api/projects/${modal.id}`, body),
          api.put(`/api/projects/${modal.id}/assignments`, { user_ids: assignedIds }),
        ]);
      }
      setModal(null);
      load(search, statusFilter, clientFilter);
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleDeactivate() {
    if (!confirm) return;
    setSaving(true);
    try {
      await api.delete(`/api/projects/${confirm.id}`);
      setConfirm(null);
      setModal(null);
      load(search, statusFilter, clientFilter);
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <AppShell title="Projects">
      <div className="page">
        <div className="page-header">
          <h1 className="page-title">Projects</h1>
          {isAdmin && (
            <button className="btn btn-solid" onClick={openCreate}>+ New Project</button>
          )}
        </div>

        <div className="toolbar">
          <input
            className="search-input"
            placeholder="Search by name, code, client…"
            value={search}
            onChange={handleSearchChange}
          />
          <select className="form-select toolbar-select" style={{ width: '160px' }}
            value={statusFilter} onChange={handleStatusFilter}>
            <option value="">Planning + Active</option>
            <option value="planning">Planning</option>
            <option value="active">Active</option>
            <option value="completed">Completed</option>
            <option value="cancelled">Cancelled</option>
            <option value="all">All</option>
          </select>
          <select className="form-select toolbar-select" style={{ width: '220px' }}
            value={clientFilter} onChange={handleClientFilter}>
            <option value="">All Clients</option>
            {clients.map(c => (
              <option key={c.id} value={c.id}>[{c.client_code}] {c.name}</option>
            ))}
          </select>
          <button className="btn btn-outline toolbar-reset" onClick={() => {
            setSearch(''); setStatusFilter(''); setClientFilter(''); load('', '', '');
          }}>Reset</button>
        </div>

        {error && !modal && <div className="error-banner">{error}</div>}

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Code</th>
                <th>Name</th>
                <th>Client</th>
                <th>Location</th>
                <th>Status</th>
                <th>Start Date</th>
                <th>Open Extras</th>
                {isAdmin && <th>Actions</th>}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr className="empty-row"><td colSpan={isAdmin ? 8 : 7}>Loading…</td></tr>
              ) : items.length === 0 ? (
                <tr className="empty-row"><td colSpan={isAdmin ? 8 : 7}>No projects found.</td></tr>
              ) : items.map(p => (
                <tr key={p.id}>
                  <td><code style={{ fontSize: '0.8125rem' }}>{p.project_code}</code></td>
                  <td style={{ fontWeight: 500 }}>{p.name}</td>
                  <td>{p.client_name ?? '—'}</td>
                  <td>{p.location   ?? '—'}</td>
                  <td>{statusBadge(p.status)}</td>
                  <td>{p.start_date}</td>
                  <td>
                    {(p.open_extras_count ?? 0) > 0 ? (
                      <button
                        className="ex-count-badge"
                        onClick={() => navigate(`/admin/extras?project_id=${p.id}&status=open`)}
                        title="View open extras for this project"
                      >
                        {p.open_extras_count}
                      </button>
                    ) : (
                      <span style={{ color: 'var(--color-grey-400)', fontSize: '0.875rem' }}>—</span>
                    )}
                  </td>
                  {isAdmin && (
                    <td>
                      <div className="td-actions">
                        <button className="btn-ghost" onClick={() => openEdit(p)}>Edit</button>
                      </div>
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
              {modal.mode === 'create' ? 'New Project' : 'Edit Project'}
            </h2>
            <form onSubmit={handleSave}>
              {error && <div className="error-banner">{error}</div>}

              <div className="form-group">
                <label className="form-label">Name *</label>
                <input className="form-input" required value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
              </div>

              <div className="form-group">
                <label className="form-label">Client</label>
                <select className="form-select" value={form.client_id}
                  onChange={e => setForm(f => ({ ...f, client_id: e.target.value }))}>
                  <option value="">— No client —</option>
                  {clients.map(c => (
                    <option key={c.id} value={c.id}>[{c.client_code}] {c.name}</option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label className="form-label">Location</label>
                <input className="form-input" value={form.location}
                  onChange={e => setForm(f => ({ ...f, location: e.target.value }))} />
              </div>

              <div className="form-group">
                <label className="form-label">Status</label>
                <select className="form-select" value={form.status}
                  onChange={e => setForm(f => ({ ...f, status: e.target.value }))}>
                  {STATUSES.map(s => (
                    <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label className="form-label">Start Date *</label>
                <input className="form-input" type="date" required value={form.start_date}
                  onChange={e => setForm(f => ({ ...f, start_date: e.target.value }))} />
              </div>

              <div className="form-group">
                <label className="form-label">End Date</label>
                <input className="form-input" type="date" value={form.end_date}
                  onChange={e => setForm(f => ({ ...f, end_date: e.target.value }))} />
              </div>

              {modal.mode === 'edit' && isAdmin && (
                <div className="form-group">
                  <label className="form-label">Assigned Employees</label>
                  <p style={{ fontSize: '0.8rem', color: 'var(--color-grey-600)', margin: '0 0 8px' }}>
                    Leave empty to allow all active employees to log time.
                  </p>
                  <div style={{
                    maxHeight: 180, overflowY: 'auto',
                    border: '1px solid var(--color-border)',
                    borderRadius: 6, padding: '6px 0',
                  }}>
                    {employees.length === 0 ? (
                      <div style={{ padding: '8px 12px', color: 'var(--color-grey-600)', fontSize: '0.875rem' }}>
                        No active employees
                      </div>
                    ) : employees.map(emp => {
                      const checked = assignedIds.includes(emp.id);
                      return (
                        <label key={emp.id} style={{
                          display: 'flex', alignItems: 'center', gap: 10,
                          padding: '6px 12px', cursor: 'pointer',
                          background: checked ? 'rgba(200,164,106,0.06)' : undefined,
                        }}>
                          <input type="checkbox" checked={checked}
                            onChange={ev => {
                              if (ev.target.checked) {
                                setAssignedIds(ids => [...ids, emp.id]);
                              } else {
                                setAssignedIds(ids => ids.filter(id => id !== emp.id));
                              }
                            }}
                          />
                          <span style={{ fontSize: '0.875rem' }}>
                            <strong>{emp.first_name} {emp.last_name}</strong>
                            <span style={{ marginLeft: 6, fontSize: '0.8rem', color: 'var(--color-grey-600)' }}>
                              {emp.employee_code}
                            </span>
                          </span>
                        </label>
                      );
                    })}
                  </div>
                  {assignedIds.length > 0 && (
                    <p style={{ fontSize: '0.8rem', color: 'var(--color-grey-600)', margin: '6px 0 0' }}>
                      {assignedIds.length} employee{assignedIds.length !== 1 ? 's' : ''} assigned
                    </p>
                  )}
                </div>
              )}

              {modal.mode === 'edit' && (
                <div className="form-group">
                  <label className="form-label" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span>Open Extras {modalExtras.length > 0 && <span className="ex-modal-count">{modalExtras.length}</span>}</span>
                    {modalExtras.length > 0 && (
                      <button type="button" className="btn-ghost"
                        style={{ fontSize: '0.8rem', padding: '2px 8px' }}
                        onClick={() => { setModal(null); navigate(`/admin/extras?project_id=${modal.id}&status=open`); }}>
                        View all →
                      </button>
                    )}
                  </label>
                  {modalExtras.length === 0 ? (
                    <p style={{ fontSize: '0.875rem', color: 'var(--color-grey-500)', margin: 0 }}>No open extras.</p>
                  ) : (
                    <div className="ex-modal-list">
                      {modalExtras.slice(0, 5).map(ex => (
                        <div key={ex.id} className="ex-modal-item">
                          <span className={`ex-type-badge ${ex.type === 'extra_work' ? 'ex-badge-work' : 'ex-badge-cost'}`}>
                            {ex.type === 'extra_work' ? 'Extra Work' : 'Own Cost'}
                          </span>
                          <span style={{ fontSize: '0.875rem', color: 'var(--color-grey-700)' }}>{ex.employee_name}</span>
                          <span style={{ fontSize: '0.8125rem', color: 'var(--color-grey-600)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {ex.description}
                          </span>
                        </div>
                      ))}
                      {modalExtras.length > 5 && (
                        <p style={{ fontSize: '0.8rem', color: 'var(--color-grey-500)', margin: '4px 0 0' }}>
                          +{modalExtras.length - 5} more
                        </p>
                      )}
                    </div>
                  )}
                </div>
              )}

              <div className="modal-footer" style={{ justifyContent: 'space-between' }}>
                <div>
                  {modal.mode === 'edit' && modal.item?.is_active ? (
                    <button type="button" className="btn btn-outline"
                      style={{ color: 'var(--color-amber)', borderColor: 'var(--color-amber)' }}
                      onClick={() => setConfirm({ id: modal.id, name: modal.item.name })}>
                      Deactivate
                    </button>
                  ) : null}
                </div>
                <div style={{ display: 'flex', gap: '0.75rem' }}>
                  <button type="button" className="btn btn-outline" onClick={() => setModal(null)}>
                    Cancel
                  </button>
                  <button type="submit" className="btn btn-solid" disabled={saving}>
                    {saving ? 'Saving…' : 'Save'}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {confirm && (
        <div className="modal-backdrop" onClick={() => setConfirm(null)}>
          <div className="modal" style={{ maxWidth: 380 }} onClick={e => e.stopPropagation()}>
            <h2 className="modal-title">Deactivate project?</h2>
            <p style={{ fontSize: '0.9rem', color: 'var(--color-grey-600)' }}>
              "{confirm.name}" will be hidden from all lists. Existing time entries are preserved.
            </p>
            <div className="modal-footer">
              <button className="btn btn-outline" onClick={() => setConfirm(null)}>Cancel</button>
              <button className="btn btn-amber" disabled={saving} onClick={handleDeactivate}>
                {saving ? 'Deactivating…' : 'Deactivate'}
              </button>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}
