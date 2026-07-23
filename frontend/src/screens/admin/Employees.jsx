import { useState, useEffect } from 'react';
import { useNavigate }         from 'react-router-dom';
import { api }                 from '../../api.js';
import { useAuth }             from '../../auth.jsx';
import AppShell                from '../AppShell.jsx';
import PhoneInput              from '../../components/PhoneInput.jsx';
import { AssignmentChecklist } from '../../components/AssignmentChecklist.jsx';
import { useToast }            from '../../hooks/useToast.jsx';
import { useDebounce }         from '../../hooks/useDebounce.js';

const ROLES = ['employee', 'manager', 'supervisor', 'administrator'];
const EMPTY = { first_name: '', last_name: '', email: '', phone: '', role: 'employee', team_id: '' };

function fmtMins(m) {
  if (!m) return '—';
  const h = Math.floor(m / 60);
  const mm = m % 60;
  return mm > 0 ? `${h}h ${mm}m` : `${h}h`;
}


export default function Employees() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const isAdmin  = user?.role === 'administrator';
  const { toast } = useToast();

  const [items,        setItems]        = useState([]);
  const [teams,        setTeams]        = useState([]);
  const [loading,      setLoading]      = useState(true);
  const [search,       setSearch]       = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [roleFilter,   setRoleFilter]   = useState('');
  const [teamFilter,   setTeamFilter]   = useState('');
  const [modal,            setModal]            = useState(null);
  const [confirm,          setConfirm]          = useState(null);
  const [saving,           setSaving]           = useState(false);
  const [error,            setError]            = useState('');
  const [form,             setForm]             = useState(EMPTY);
  const [modalExtras,      setModalExtras]      = useState([]);
  const [accessBusy,       setAccessBusy]       = useState(false);
  const [generatedPwd,     setGeneratedPwd]     = useState(null);
  const [generatePwdConfirm, setGeneratePwdConfirm] = useState(null);
  const [copied,           setCopied]           = useState(false);
  const [resendMsg,        setResendMsg]        = useState('');
  const [allProjects,      setAllProjects]      = useState([]);
  const [assignedProjectIds, setAssignedProjectIds] = useState([]);
  const [projectAccess,    setProjectAccess]    = useState('all');

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
      setModal(m => { if (!m) setError(e.message); return m; });
    } finally {
      setLoading(false);
    }
  }

  const debouncedLoad = useDebounce(load, 300);

  function handleSearchChange(e) {
    const q = e.target.value;
    setSearch(q);
    debouncedLoad(q, statusFilter, roleFilter, teamFilter);
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
    setResendMsg('');
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
    setModalExtras([]);
    setAssignedProjectIds([]);
    setProjectAccess('all');
    api.get(`/api/extras?user_id=${item.id}&status=open`).then(data => {
      setModalExtras(data?.data ?? []);
    }).catch(() => {});
    if (isAdmin) {
      api.get('/api/projects').then(data => {
        setAllProjects((Array.isArray(data) ? data : data?.data ?? []).filter(p => p.is_active));
      }).catch(() => {});
      api.get(`/api/employees/${item.id}/assignments`).then(data => {
        const ids = (Array.isArray(data) ? data : data?.data ?? []).map(p => p.id);
        setAssignedProjectIds(ids);
        setProjectAccess(ids.length > 0 ? 'selected' : 'all');
      }).catch(() => {});
    }
  }

  useEffect(() => {
    function onKey(e) {
      if (e.key !== 'Escape') return;
      if (confirm) { setConfirm(null); return; }
      if (generatePwdConfirm) { setGeneratePwdConfirm(null); return; }
      if (generatedPwd) { setGeneratedPwd(null); return; }
      if (modal) { setModal(null); setGeneratedPwd(null); setResendMsg(''); return; }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [modal, confirm, generatePwdConfirm, generatedPwd]);

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
        toast('Employee created. Activation email sent.');
      } else {
        await api.put(`/api/employees/${modal.id}`, body);
        if (isAdmin) {
          await api.put(`/api/employees/${modal.id}/assignments`, {
            project_ids: projectAccess === 'all' ? [] : assignedProjectIds,
          });
        }
        toast('Employee updated.');
      }
      setModal(null);
      load(search, statusFilter, roleFilter, teamFilter);
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleActivate(id) {
    setAccessBusy(true);
    setError('');
    try {
      await api.post(`/api/employees/${id}/activate`, {});
      toast('Account activated.');
      setModal(null);
      load(search, statusFilter, roleFilter, teamFilter);
    } catch (e) {
      setError(e.message);
    } finally {
      setAccessBusy(false);
    }
  }

  async function handleGeneratePassword(id, name, email) {
    setAccessBusy(true);
    setError('');
    try {
      const res = await api.post(`/api/employees/${id}/generate-password`, {});
      setGeneratedPwd({ name: res.employee?.name ?? name, email: res.employee?.email ?? email, password: res.password });
      setCopied(false);
      load(search, statusFilter, roleFilter, teamFilter);
    } catch (e) {
      setError(e.message);
    } finally {
      setAccessBusy(false);
    }
  }

  async function handleResendActivation(id, email) {
    setAccessBusy(true);
    setResendMsg('');
    setError('');
    try {
      await api.post(`/api/employees/${id}/resend-activation`, {});
      setResendMsg(`Activation email sent to ${email}.`);
    } catch (e) {
      setError(e.message);
    } finally {
      setAccessBusy(false);
    }
  }

  function handleCopyPassword() {
    if (!generatedPwd) return;
    navigator.clipboard.writeText(generatedPwd.password).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    });
  }

  async function handleLifecycle() {
    if (!confirm) return;
    setSaving(true);
    try {
      if (confirm.action === 'deactivate') {
        await api.delete(`/api/employees/${confirm.id}`);
        toast('Employee deactivated.');
      } else {
        await api.post(`/api/employees/${confirm.id}/reactivate`, {});
        toast('Employee reactivated.');
      }
      setConfirm(null);
      setModal(null);
      load(search, statusFilter, roleFilter, teamFilter);
    } catch (e) {
      setError(e.message);
      setSaving(false);
    }
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
                <th>Open Extras</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr className="empty-row"><td colSpan={8}>Loading…</td></tr>
              ) : items.length === 0 ? (
                <tr className="empty-row"><td colSpan={8}>No employees found.</td></tr>
              ) : items.map(emp => (
                <tr key={emp.id} style={{ cursor: 'pointer' }} onClick={() => navigate(`/employees/${emp.id}/timesheet`)}>
                  <td onClick={e => e.stopPropagation()}><code style={{ fontSize: '0.8125rem' }}>{emp.employee_code}</code></td>
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
                  <td onClick={e => e.stopPropagation()}>
                    {(emp.open_extras_count ?? 0) > 0 ? (
                      <button
                        className="ex-count-badge"
                        onClick={() => navigate(`/admin/extras?user_id=${emp.id}&status=open`)}
                        title="View open extras for this employee"
                      >
                        {emp.open_extras_count}
                      </button>
                    ) : (
                      <span style={{ color: 'var(--color-grey-400)', fontSize: '0.875rem' }}>—</span>
                    )}
                  </td>
                  <td onClick={e => e.stopPropagation()}>
                    <div className="td-actions">
                      <button className="btn-ghost" onClick={() => navigate(`/employees/${emp.id}/timesheet`)}>Timesheet</button>
                      {isAdmin && <button className="btn-ghost" onClick={() => openEdit(emp)}>Edit</button>}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {modal && (
        <div className="modal-backdrop" onClick={() => { setModal(null); setGeneratedPwd(null); setResendMsg(''); }}>
          <div className="modal" style={modal?.mode === 'edit' ? { maxWidth: 820, width: '92vw' } : undefined}
            onClick={e => e.stopPropagation()}>

            {/* ── Generated password success display ── */}
            {generatedPwd ? (
              <div>
                <h2 className="modal-title">Password Generated</h2>
                <div style={{ background: 'var(--color-green-50, #f0fdf4)', border: '1px solid var(--color-green-200, #bbf7d0)', borderRadius: '8px', padding: '16px', marginBottom: '1rem' }}>
                  <div style={{ fontSize: '0.8125rem', color: 'var(--color-grey-500)', marginBottom: '6px' }}>
                    {generatedPwd.name} &middot; {generatedPwd.email}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
                    <code style={{ fontFamily: 'monospace', fontSize: '1.125rem', fontWeight: 700, letterSpacing: '0.06em', color: 'var(--color-grey-900)', background: '#fff', border: '1px solid var(--color-grey-200)', borderRadius: '6px', padding: '8px 14px', flex: 1 }}>
                      {generatedPwd.password}
                    </code>
                    <button
                      type="button"
                      className="btn btn-outline"
                      style={{ whiteSpace: 'nowrap' }}
                      onClick={handleCopyPassword}
                    >
                      {copied ? '✓ Copied' : 'Copy'}
                    </button>
                  </div>
                  <p style={{ fontSize: '0.8125rem', color: 'var(--color-grey-600)', margin: 0 }}>
                    Share this password securely with the employee. The previous password is no longer valid.
                  </p>
                </div>
                <div className="modal-footer" style={{ justifyContent: 'flex-end' }}>
                  <button className="btn btn-solid" onClick={() => { setGeneratedPwd(null); setModal(null); }}>Done</button>
                </div>
              </div>
            ) : (
            <>
            <h2 className="modal-title">
              {modal.mode === 'create' ? 'New Employee' : 'Edit Employee'}
            </h2>
            <form onSubmit={handleSave}>
              {error && <div className="error-banner">{error}</div>}

              {/* ── Two-column layout in edit mode ── */}
              <div style={modal.mode === 'edit' ? {
                display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 2rem', alignItems: 'start',
              } : undefined}>

                {/* Left column: form fields */}
                <div>
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

                  {/* Admin Actions — left column, edit mode only */}
                  {modal.mode === 'edit' && isAdmin && modal.item?.status !== 'inactive' && (
                    <div style={{ borderTop: '1px solid var(--color-grey-100)', paddingTop: '1rem', marginTop: '0.5rem' }}>
                      <p style={{ fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--color-grey-400)', marginBottom: '0.75rem' }}>
                        Admin Actions
                      </p>
                      {resendMsg && (
                        <div className="success-banner" style={{ marginBottom: '0.75rem' }}>{resendMsg}</div>
                      )}
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                        {modal.item?.status === 'pending' && (
                          <>
                            <button type="button" className="btn btn-outline" disabled={accessBusy}
                              onClick={() => handleResendActivation(modal.id, modal.item?.email)}>
                              {accessBusy ? 'Sending…' : 'Resend Activation Email'}
                            </button>
                            <button type="button" className="btn btn-outline" disabled={accessBusy}
                              onClick={() => handleActivate(modal.id)}>
                              {accessBusy ? 'Activating…' : 'Activate Account'}
                            </button>
                          </>
                        )}
                        {modal.item?.status === 'active' && (
                          <button type="button" className="btn btn-outline" disabled={accessBusy}
                            onClick={() => setGeneratePwdConfirm({ id: modal.id, name: `${modal.item?.first_name} ${modal.item?.last_name}`, email: modal.item?.email })}>
                            {accessBusy ? 'Generating…' : 'Generate New Password'}
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                {/* Right column: project access + open extras (edit mode only) */}
                {modal.mode === 'edit' && (
                  <div style={{ borderLeft: '1px solid var(--color-border)', paddingLeft: '2rem' }}>
                    {isAdmin && (
                      <div className="form-group">
                        <label className="form-label">Project Access</label>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', margin: '4px 0 10px' }}>
                          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: '0.875rem' }}>
                            <input type="radio" name="empProjectAccess"
                              checked={projectAccess === 'all'} onChange={() => setProjectAccess('all')} />
                            All Active Projects
                          </label>
                          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: '0.875rem' }}>
                            <input type="radio" name="empProjectAccess"
                              checked={projectAccess === 'selected'} onChange={() => setProjectAccess('selected')} />
                            Selected Projects Only
                          </label>
                        </div>
                        {projectAccess === 'selected' && (
                          <AssignmentChecklist
                            items={allProjects.map(p => ({
                              id:         p.id,
                              name:       p.name,
                              sub:        p.project_code,
                              searchText: `${p.name} ${p.project_code} ${p.client_name ?? ''}`.toLowerCase(),
                            }))}
                            checkedIds={assignedProjectIds}
                            onToggle={id => setAssignedProjectIds(ids =>
                              ids.includes(id) ? ids.filter(i => i !== id) : [...ids, id]
                            )}
                            placeholder="Search projects…"
                            countLabel={n => `${n} project${n !== 1 ? 's' : ''} assigned`}
                          />
                        )}
                      </div>
                    )}

                    <div className="form-group">
                      <label className="form-label" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <span>Open Extras {modalExtras.length > 0 && <span className="ex-modal-count">{modalExtras.length}</span>}</span>
                        {modalExtras.length > 0 && (
                          <button type="button" className="btn-ghost"
                            style={{ fontSize: '0.8rem', padding: '2px 8px' }}
                            onClick={() => { setModal(null); navigate(`/admin/extras?user_id=${modal.id}&status=open`); }}>
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
                              <span style={{ fontSize: '0.875rem', color: 'var(--color-grey-700)' }}>{ex.project_name}</span>
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
                  </div>
                )}
              </div>{/* end grid */}

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
            </>
            )} {/* end generatedPwd ternary */}
          </div>
        </div>
      )}

      {generatePwdConfirm && (
        <div className="modal-backdrop" onClick={() => setGeneratePwdConfirm(null)}>
          <div className="modal" style={{ maxWidth: 440 }} onClick={e => e.stopPropagation()}>
            <h2 className="modal-title">Generate New Password?</h2>
            <p style={{ fontSize: '0.9rem', color: 'var(--color-grey-600)' }}>
              This will immediately invalidate the current password for <strong>{generatePwdConfirm.name}</strong> and generate a new one. The new password will be sent to <strong>{generatePwdConfirm.email}</strong>.
            </p>
            <div className="modal-footer">
              <button className="btn btn-outline" onClick={() => setGeneratePwdConfirm(null)}>Cancel</button>
              <button
                className="btn btn-amber"
                disabled={accessBusy}
                onClick={() => { setGeneratePwdConfirm(null); handleGeneratePassword(generatePwdConfirm.id, generatePwdConfirm.name, generatePwdConfirm.email); }}>
                {accessBusy ? 'Generating…' : 'Generate Password'}
              </button>
            </div>
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
