import { useState, useEffect } from 'react';
import { useNavigate }         from 'react-router-dom';
import { api }                 from '../../api.js';
import { useAuth }             from '../../auth.jsx';
import AppShell                from '../AppShell.jsx';

const ROLES = ['employee', 'manager', 'administrator'];

const EMPTY = { name: '', email: '', phone: '', role: 'employee', team_id: '' };

export default function Employees() {
  const { user }   = useAuth();
  const navigate   = useNavigate();
  const isAdmin    = user?.role === 'administrator';

  const [items,   setItems]   = useState([]);
  const [teams,   setTeams]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [search,  setSearch]  = useState('');
  const [modal,   setModal]   = useState(null);
  const [confirm, setConfirm] = useState(null);
  const [saving,  setSaving]  = useState(false);
  const [error,   setError]   = useState('');
  const [form,    setForm]    = useState(EMPTY);

  useEffect(() => {
    load('');
    api.get('/api/teams').then(setTeams).catch(() => {});
  }, []);  // eslint-disable-line

  async function load(q = '') {
    setLoading(true);
    setError('');
    try {
      const data = await api.get('/api/employees' + (q ? `?search=${encodeURIComponent(q)}` : ''));
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
    load(q);
  }

  function openCreate() {
    setForm(EMPTY);
    setError('');
    setModal({ mode: 'create' });
  }

  function openEdit(item) {
    setForm({
      name:    item.name    ?? '',
      email:   item.email   ?? '',
      phone:   item.phone   ?? '',
      role:    item.role    ?? 'employee',
      team_id: item.team_id ?? '',
    });
    setError('');
    setModal({ mode: 'edit', id: item.id });
  }

  async function handleSave(e) {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const body = {
        ...form,
        team_id: form.team_id ? Number(form.team_id) : null,
        phone:   form.phone || null,
      };
      if (modal.mode === 'create') {
        await api.post('/api/employees', body);
      } else {
        await api.put(`/api/employees/${modal.id}`, body);
      }
      setModal(null);
      load(search);
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
      await api.delete(`/api/employees/${confirm.id}`);
      setConfirm(null);
      load(search);
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  function roleBadge(role) {
    const cls = { administrator: 'badge-active', manager: 'badge-planning', employee: 'badge-completed' };
    return <span className={`badge ${cls[role] ?? 'badge-completed'}`}>{role}</span>;
  }

  function statusBadge(is_active) {
    return is_active
      ? <span className="badge badge-active">Active</span>
      : <span className="badge badge-pending">Pending</span>;
  }

  return (
    <AppShell title="Employees">
      <div className="page">
        <div className="page-header">
          <h1 className="page-title">Employees</h1>
          {isAdmin && (
            <button className="btn btn-solid" onClick={openCreate}>+ New Employee</button>
          )}
        </div>

        <div className="toolbar">
          <input
            className="search-input"
            placeholder="Search by name, email, code…"
            value={search}
            onChange={handleSearchChange}
          />
        </div>

        {error && !modal && <div className="error-banner">{error}</div>}

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Code</th>
                <th>Name</th>
                <th>Email</th>
                <th>Team</th>
                <th>Role</th>
                <th>Status</th>
                {isAdmin && <th>Actions</th>}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr className="empty-row"><td colSpan={isAdmin ? 7 : 6}>Loading…</td></tr>
              ) : items.length === 0 ? (
                <tr className="empty-row"><td colSpan={isAdmin ? 7 : 6}>No employees found.</td></tr>
              ) : items.map(emp => (
                <tr key={emp.id}>
                  <td><code style={{ fontSize: '0.8125rem' }}>{emp.employee_code}</code></td>
                  <td style={{ fontWeight: 500 }}>{emp.name}</td>
                  <td style={{ color: 'var(--color-grey-600)' }}>{emp.email}</td>
                  <td>{emp.team_name ?? '—'}</td>
                  <td>{roleBadge(emp.role)}</td>
                  <td>{statusBadge(emp.is_active)}</td>
                  {isAdmin && (
                    <td>
                      <div className="td-actions">
                        <button className="btn-ghost" onClick={() => openEdit(emp)}>Edit</button>
                        <button className="btn-ghost" style={{ color: 'var(--color-red)' }}
                          onClick={() => setConfirm({ id: emp.id, name: emp.name })}>Delete</button>
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
              {modal.mode === 'create' ? 'New Employee' : 'Edit Employee'}
            </h2>
            <form onSubmit={handleSave}>
              {error && <div className="error-banner">{error}</div>}

              <div className="form-group">
                <label className="form-label">Full Name *</label>
                <input className="form-input" required value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
              </div>

              <div className="form-group">
                <label className="form-label">Email *</label>
                <input className="form-input" type="email" required
                  value={form.email} readOnly={modal.mode === 'edit'}
                  style={modal.mode === 'edit' ? { background: 'var(--color-grey-50)' } : {}}
                  onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
                {modal.mode === 'create' && (
                  <p className="form-hint">An invitation email will be sent to this address.</p>
                )}
              </div>

              <div className="form-group">
                <label className="form-label">Phone</label>
                <input className="form-input" type="tel" value={form.phone}
                  onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} />
              </div>

              <div className="form-group">
                <label className="form-label">Role</label>
                <select className="form-select" value={form.role}
                  onChange={e => setForm(f => ({ ...f, role: e.target.value }))}>
                  {ROLES.map(r => (
                    <option key={r} value={r}>{r.charAt(0).toUpperCase() + r.slice(1)}</option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label className="form-label">Team</label>
                <select className="form-select" value={form.team_id}
                  onChange={e => setForm(f => ({ ...f, team_id: e.target.value }))}>
                  <option value="">— No team —</option>
                  {teams.map(t => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
              </div>

              <div className="modal-footer">
                <button type="button" className="btn btn-outline" onClick={() => setModal(null)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-solid" disabled={saving}>
                  {saving ? 'Saving…' : 'Save'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {confirm && (
        <div className="modal-backdrop" onClick={() => setConfirm(null)}>
          <div className="modal" style={{ maxWidth: 380 }} onClick={e => e.stopPropagation()}>
            <h2 className="modal-title">Deactivate employee?</h2>
            <p style={{ fontSize: '0.9rem', color: 'var(--color-grey-600)' }}>
              "{confirm.name}" will be deactivated. Their time history is preserved.
            </p>
            <div className="modal-footer">
              <button className="btn btn-outline" onClick={() => setConfirm(null)}>Cancel</button>
              <button className="btn btn-danger" disabled={saving} onClick={handleDelete}>
                {saving ? 'Deactivating…' : 'Deactivate'}
              </button>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}
