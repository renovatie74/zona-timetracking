import { useState, useEffect } from 'react';
import { useNavigate }         from 'react-router-dom';
import { api }                 from '../../api.js';
import { useAuth }             from '../../auth.jsx';
import AppShell                from '../AppShell.jsx';
import PhoneInput              from '../../components/PhoneInput.jsx';

const ROLES = ['employee', 'manager', 'administrator'];
const EMPTY = { first_name: '', last_name: '', email: '', phone: '', role: 'employee', team_id: '' };

export default function Employees() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const isAdmin  = user?.role === 'administrator';

  const [items,        setItems]        = useState([]);
  const [teams,        setTeams]        = useState([]);
  const [loading,      setLoading]      = useState(true);
  const [search,       setSearch]       = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [roleFilter,   setRoleFilter]   = useState('');
  const [teamFilter,   setTeamFilter]   = useState('');
  const [modal,        setModal]        = useState(null);
  const [confirm,      setConfirm]      = useState(null);
  const [saving,       setSaving]       = useState(false);
  const [error,        setError]        = useState('');
  const [form,         setForm]         = useState(EMPTY);

  useEffect(() => {
    load('', '', '', '');
    api.get('/api/teams?status=all').then(setTeams).catch(() => {});
  }, []);  // eslint-disable-line

  async function load(q, sf, rf, tf) {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams();
      if (q)  params.set('search', q);
      if (sf) params.set('status', sf);
      if (rf) params.set('role', rf);
      if (tf) params.set('team', tf);
      const qs = params.toString();
      const data = await api.get('/api/employees' + (qs ? `?${qs}` : ''));
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
    load(q, statusFilter, roleFilter, teamFilter);
  }

  function handleStatusFilter(e) {
    const sf = e.target.value;
    setStatusFilter(sf);
    load(search, sf, roleFilter, teamFilter);
  }

  function handleRoleFilter(e) {
    const rf = e.target.value;
    setRoleFilter(rf);
    load(search, statusFilter, rf, teamFilter);
  }

  function handleTeamFilter(e) {
    const tf = e.target.value;
    setTeamFilter(tf);
    load(search, statusFilter, roleFilter, tf);
  }

  function openCreate() {
    setForm(EMPTY);
    setError('');
    setModal({ mode: 'create' });
  }

  function openEdit(item) {
    setForm({
      first_name: item.first_name        ?? '',
      last_name:  item.last_name         ?? '',
      email:      item.email             ?? '',
      phone:      item.phone             ?? '',
      role:       item.role              ?? 'employee',
      team_id:    item.team_id != null   ? String(item.team_id) : '',
    });
    setError('');
    setModal({ mode: 'edit', id: item.id, item });
  }

  function handleReset() {
    setSearch('');
    setStatusFilter('');
    setRoleFilter('');
    setTeamFilter('');
    load('', '', '', '');
  }

  async function handleSave(e) {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const body = {
        first_name: form.first_name,
        last_name:  form.last_name,
        email:      form.email,
        phone:      form.phone   || null,
        role:       form.role,
        team_id:    form.team_id ? Number(form.team_id) : null,
      };
      if (modal.mode === 'create') {
        await api.post('/api/employees', body);
      } else {
        await api.put(`/api/employees/${modal.id}`, body);
      }
      setModal(null);
      load(search, statusFilter, roleFilter, teamFilter);
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleLifecycle() {
    if (!confirm) return;
    setSaving(true);
    try {
      if (confirm.action === 'deactivate') {
        await api.delete(`/api/employees/${confirm.id}`);
      } else {
        await api.post(`/api/employees/${confirm.id}/reactivate`, {});
      }
      setConfirm(null);
      setModal(null);
      load(search, statusFilter, roleFilter, teamFilter);
    } catch (e) {
      setError(e.message);
      setSaving(false);
    }
  }

  const colSpan = isAdmin ? 7 : 6;

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
          <select className="form-select toolbar-select" style={{ width: '160px' }}
            value={statusFilter} onChange={handleStatusFilter}>
            <option value="">Active + Pending</option>
            <option value="active">Active</option>
            <option value="pending">Pending Activation</option>
            <option value="inactive">Inactive</option>
            <option value="all">All</option>
          </select>
          <select className="form-select toolbar-select" style={{ width: '160px' }}
            value={roleFilter} onChange={handleRoleFilter}>
            <option value="">All Roles</option>
            <option value="administrator">Administrator</option>
            <option value="manager">Manager</option>
            <option value="employee">Employee</option>
          </select>
          <select className="form-select toolbar-select" style={{ width: '180px' }}
            value={teamFilter} onChange={handleTeamFilter}>
            <option value="">All Teams</option>
            <option value="none">No Team</option>
            {teams.map(t => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
          <button className="btn btn-outline toolbar-reset" onClick={handleReset}>Reset</button>
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
                <tr className="empty-row"><td colSpan={colSpan}>Loading…</td></tr>
              ) : items.length === 0 ? (
                <tr className="empty-row"><td colSpan={colSpan}>No employees found.</td></tr>
              ) : items.map(emp => (
                <tr key={emp.id}>
                  <td><code style={{ fontSize: '0.8125rem' }}>{emp.employee_code}</code></td>
                  <td style={{ fontWeight: 500 }}>{emp.first_name} {emp.last_name}</td>
                  <td style={{ fontSize: '0.875rem', color: 'var(--color-grey-600)' }}>{emp.email}</td>
                  <td>{emp.team_name ?? '—'}</td>
                  <td>
                    <span className="badge badge-planning" style={{ textTransform: 'capitalize' }}>
                      {emp.role}
                    </span>
                  </td>
                  <td>
                    {emp.status === 'active'   && <span className="badge badge-active">Active</span>}
                    {emp.status === 'pending'  && <span className="badge badge-pending">Pending Activation</span>}
                    {emp.status === 'inactive' && <span className="badge badge-inactive">Inactive</span>}
                  </td>
                  {isAdmin && (
                    <td>
                      <div className="td-actions">
                        <button className="btn-ghost" onClick={() => openEdit(emp)}>Edit</button>
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

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                <div className="form-group">
                  <label className="form-label">First Name *</label>
                  <input className="form-input" required value={form.first_name}
                    onChange={e => setForm(f => ({ ...f, first_name: e.target.value }))} />
                </div>
                <div className="form-group">
                  <label className="form-label">Last Name *</label>
                  <input className="form-input" required value={form.last_name}
                    onChange={e => setForm(f => ({ ...f, last_name: e.target.value }))} />
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Email *</label>
                <input
                  className="form-input"
                  type="email"
                  required
                  value={form.email}
                  disabled={modal.mode === 'edit'}
                  onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                />
                {modal.mode === 'edit' && (
                  <p className="form-hint">Email cannot be changed after account creation.</p>
                )}
              </div>

              <div className="form-group">
                <label className="form-label">Phone</label>
                <PhoneInput
                  value={form.phone}
                  onChange={v => setForm(f => ({ ...f, phone: v }))}
                />
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
                  {teams.filter(t => t.is_active).map(t => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
              </div>

              <div className="modal-footer" style={{ justifyContent: 'space-between' }}>
                <div>
                  {modal.mode === 'edit' && modal.item?.status !== 'inactive' && (
                    <button type="button"
                      className="btn btn-outline"
                      style={{ color: 'var(--color-amber)', borderColor: 'var(--color-amber)' }}
                      onClick={() => setConfirm({ id: modal.id, name: `${modal.item.first_name} ${modal.item.last_name}`, action: 'deactivate' })}>
                      Deactivate
                    </button>
                  )}
                  {modal.mode === 'edit' && modal.item?.status === 'inactive' && (
                    <button type="button"
                      className="btn btn-outline"
                      style={{ color: 'var(--color-green)', borderColor: 'var(--color-green)' }}
                      onClick={() => setConfirm({ id: modal.id, name: `${modal.item.first_name} ${modal.item.last_name}`, action: 'reactivate' })}>
                      Reactivate
                    </button>
                  )}
                </div>
                <div style={{ display: 'flex', gap: '0.75rem' }}>
                  <button type="button" className="btn btn-outline" onClick={() => setModal(null)}>
                    Cancel
                  </button>
                  <button type="submit" className="btn btn-solid" disabled={saving}>
                    {saving ? 'Saving…' : modal.mode === 'create' ? 'Send Invitation' : 'Save'}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {confirm && (
        <div className="modal-backdrop" onClick={() => setConfirm(null)}>
          <div className="modal" style={{ maxWidth: 440 }} onClick={e => e.stopPropagation()}>
            <h2 className="modal-title">
              {confirm.action === 'deactivate' ? 'Deactivate employee?' : 'Reactivate employee?'}
            </h2>
            {confirm.action === 'deactivate' ? (
              <p style={{ fontSize: '0.9rem', color: 'var(--color-grey-600)' }}>
                This employee has historical records. Deactivation is recommended instead of deletion. Continue?
              </p>
            ) : (
              <p style={{ fontSize: '0.9rem', color: 'var(--color-grey-600)' }}>
                This will allow <strong>{confirm.name}</strong> to log in and use the system again.
              </p>
            )}
            <div className="modal-footer">
              <button className="btn btn-outline" onClick={() => setConfirm(null)}>Cancel</button>
              <button
                className={confirm.action === 'deactivate' ? 'btn btn-amber' : 'btn btn-solid'}
                disabled={saving}
                onClick={handleLifecycle}>
                {saving
                  ? (confirm.action === 'deactivate' ? 'Deactivating…' : 'Reactivating…')
                  : (confirm.action === 'deactivate' ? 'Deactivate' : 'Reactivate')}
              </button>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}
