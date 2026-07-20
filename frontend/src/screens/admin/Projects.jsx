import { useState, useEffect, useMemo } from 'react';
import { useNavigate }         from 'react-router-dom';
import { api }                 from '../../api.js';
import { useAuth }             from '../../auth.jsx';
import AppShell                from '../AppShell.jsx';
import { weekStartFor, isoWeekNumber, addDays } from '../../lib/weekUtils.js';
import WeekSelector from '../../components/WeekSelector.jsx';
import { AssignmentChecklist } from '../../components/AssignmentChecklist.jsx';
import { useToast }            from '../../hooks/useToast.jsx';
import { useDebounce }         from '../../hooks/useDebounce.js';

const STATUSES = ['planning', 'active', 'completed', 'cancelled'];

function fmtMins(m) {
  if (!m) return '—';
  const h = Math.floor(m / 60);
  const mm = m % 60;
  return mm > 0 ? `${h}h ${mm}m` : `${h}h`;
}

function fmtHours(minutes) {
  if (!minutes) return '';
  const h = Math.round(minutes / 60 * 10) / 10;
  return h % 1 === 0 ? `${h}h` : `${h.toFixed(1)}h`;
}

const EMPTY = { name: '', client_id: '', location: '', status: 'planning', start_date: '', end_date: '' };

// ── Billing Horizon strip ─────────────────────────────────────────────────────
function BillingHorizonStrip({ weeks, projectId, horizon, onMarkerClick }) {
  if (!weeks?.length) return null;

  return (
    <div className="bh-strip">
      {weeks.map(wk => {
        const row = horizon?.find(r => r.week_start === wk.week_start);
        const mins   = row?.total_minutes ?? 0;
        const status = row?.invoice_status ?? null;

        let marker, cls, tipStatus;
        if (status === 'invoiced') {
          marker = '✓'; cls = 'bh-marker bh-invoiced'; tipStatus = 'Invoiced';
        } else if (mins > 0) {
          marker = '○'; cls = 'bh-marker bh-pending'; tipStatus = 'Pending';
        } else {
          marker = '–'; cls = 'bh-marker bh-none'; tipStatus = 'No hours';
        }

        const tipHours = mins > 0 ? `\n${fmtHours(mins)}` : '';
        const tip = `W${wk.week_number}\n${tipStatus}${tipHours}`;

        return (
          <div key={wk.week_start} className="bh-week">
            <span className="bh-label">W{wk.week_number}</span>
            <button
              className={cls}
              title={tip}
              onClick={e => { e.stopPropagation(); onMarkerClick(projectId, wk.week_start); }}
            >
              {marker}
            </button>
          </div>
        );
      })}
    </div>
  );
}

// ── billing horizon filter logic ──────────────────────────────────────────────
function horizonCategory(horizon) {
  if (!horizon?.length) return 'no_hours';
  const withHours = horizon.filter(w => w.total_minutes > 0);
  if (withHours.length === 0) return 'no_hours';
  const allInvoiced = withHours.every(w => w.invoice_status);
  if (allInvoiced) return 'invoiced';
  return 'pending';
}

export default function Projects() {
  const { user }   = useAuth();
  const navigate   = useNavigate();
  const isAdmin    = user?.role === 'administrator';
  const { toast }  = useToast();

  const [items,          setItems]          = useState([]);
  const [clients,        setClients]        = useState([]);
  const [employees,      setEmployees]      = useState([]);
  const [assignedIds,    setAssignedIds]    = useState([]);
  const [projectAccess,  setProjectAccess]  = useState('open');
  const [modalExtras,    setModalExtras]    = useState([]);
  const [loading,        setLoading]        = useState(true);
  const [search,         setSearch]         = useState('');
  const [statusFilter,   setStatusFilter]   = useState('');
  const [clientFilter,   setClientFilter]   = useState('');
  const [billingFilter,  setBillingFilter]  = useState('');
  const [modal,          setModal]          = useState(null);
  const [confirm,        setConfirm]        = useState(null);
  const [saving,         setSaving]         = useState(false);
  const [error,          setError]          = useState('');
  const [form,           setForm]           = useState(EMPTY);
  const [selectedWeek,   setSelectedWeek]   = useState(() => weekStartFor(new Date().toISOString().slice(0, 10)));
  const [horizonWeeks,   setHorizonWeeks]   = useState([]);   // week meta objects
  const [billingHorizon, setBillingHorizon] = useState({});   // { project_id: [{ week_start, total_minutes, invoice_status }] }

  useEffect(() => {
    load('', '', '', selectedWeek);
    api.get('/api/clients').then(setClients).catch(() => {});
    api.get('/api/employees?status=active').then(emps => {
      setEmployees(Array.isArray(emps) ? emps : (emps ?? []));
    }).catch(() => {});
  }, []);  // eslint-disable-line

  async function loadBillingHorizon(week) {
    try {
      const result = await api.get(`/api/projects/billing-horizon?end_week_start=${week}`);
      setHorizonWeeks(result.weeks ?? []);
      setBillingHorizon(result.by_project ?? {});
    } catch {
      // Non-fatal — horizon column stays empty
    }
  }

  async function load(q, sf, cf, week) {
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
      setError(e.message);
    } finally {
      setLoading(false);
    }
    loadBillingHorizon(week ?? selectedWeek);
  }

  const debouncedLoad = useDebounce(load, 300);

  function handleSearchChange(e) {
    const q = e.target.value;
    setSearch(q);
    debouncedLoad(q, statusFilter, clientFilter, selectedWeek);
  }

  function handleStatusFilter(e) {
    const sf = e.target.value;
    setStatusFilter(sf);
    load(search, sf, clientFilter, selectedWeek);
  }

  function handleClientFilter(e) {
    const cf = e.target.value;
    setClientFilter(cf);
    load(search, statusFilter, cf, selectedWeek);
  }

  function handleWeekChange(w) {
    setSelectedWeek(w);
    loadBillingHorizon(w);
  }

  function handleMarkerClick(projectId, weekStart) {
    navigate(`/projects/${projectId}/timesheet?week=${weekStart}`);
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
    setProjectAccess('open');
    setError('');
    setModal({ mode: 'edit', id: item.id, item });
    api.get(`/api/projects/${item.id}/assignments`).then(data => {
      const rows = Array.isArray(data) ? data : (data ?? []);
      const ids = rows.map(r => r.id);
      setAssignedIds(ids);
      setProjectAccess(ids.length > 0 ? 'restricted' : 'open');
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
        toast('Project created.');
      } else {
        await Promise.all([
          api.put(`/api/projects/${modal.id}`, body),
          api.put(`/api/projects/${modal.id}/assignments`, {
            user_ids: projectAccess === 'restricted' ? assignedIds : [],
          }),
        ]);
        toast('Project updated.');
      }
      setModal(null);
      load(search, statusFilter, clientFilter);
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
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

  async function handleDeactivate() {
    if (!confirm) return;
    setSaving(true);
    try {
      await api.delete(`/api/projects/${confirm.id}`);
      toast('Project deactivated.');
      setConfirm(null);
      setModal(null);
      load(search, statusFilter, clientFilter);
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  // Derive week hours for selected week from billing horizon data
  const weeklyHours = useMemo(() => {
    const map = {};
    Object.entries(billingHorizon).forEach(([pid, weeks]) => {
      const thisWeek = weeks.find(w => w.week_start === selectedWeek);
      if (thisWeek?.total_minutes) map[Number(pid)] = thisWeek.total_minutes;
    });
    return map;
  }, [billingHorizon, selectedWeek]);

  // Apply billing filter on top of loaded items
  const filteredItems = useMemo(() => {
    if (!billingFilter) return items;
    return items.filter(p => {
      const cat = horizonCategory(billingHorizon[p.id]);
      if (billingFilter === 'pending')   return cat === 'pending';
      if (billingFilter === 'invoiced')  return cat === 'invoiced';
      if (billingFilter === 'no_hours')  return cat === 'no_hours';
      return true;
    });
  }, [items, billingHorizon, billingFilter]);

  const colSpan = 7; // Code + Name + Client + Week Hours + Billing Horizon + Open Extras + Actions

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
          <select className="form-select toolbar-select" style={{ width: '180px' }}
            value={billingFilter} onChange={e => setBillingFilter(e.target.value)}>
            <option value="">All Invoice Status</option>
            <option value="pending">Has pending billing</option>
            <option value="invoiced">Fully invoiced</option>
            <option value="no_hours">No hours</option>
          </select>
          <button className="btn btn-outline toolbar-reset" onClick={() => {
            setSearch(''); setStatusFilter(''); setClientFilter(''); setBillingFilter('');
            load('', '', '', selectedWeek);
          }}>Reset</button>
        </div>

        {/* Billing week selector */}
        <div className="week-nav-row" style={{ gap: '0.75rem' }}>
          <span style={{ fontSize: '0.8125rem', color: 'var(--color-grey-600)', whiteSpace: 'nowrap' }}>Billing week:</span>
          <WeekSelector weekStart={selectedWeek} onChange={handleWeekChange} />
        </div>

        {error && !modal && <div className="error-banner">{error}</div>}

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Code</th>
                <th>Name</th>
                <th>Client</th>
                <th>Week Hours</th>
                <th>Billing Horizon</th>
                <th>Open Extras</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr className="empty-row"><td colSpan={colSpan}>Loading…</td></tr>
              ) : filteredItems.length === 0 ? (
                <tr className="empty-row"><td colSpan={colSpan}>No projects found.</td></tr>
              ) : filteredItems.map(p => (
                <tr key={p.id} style={{ cursor: 'pointer' }} onClick={() => navigate(`/projects/${p.id}/timesheet`)}>
                  <td onClick={e => e.stopPropagation()}><code style={{ fontSize: '0.8125rem' }}>{p.project_code}</code></td>
                  <td style={{ fontWeight: 500 }}>
                    {p.name}
                    {(p.assignment_count ?? 0) > 0 && (
                      <span style={{
                        display: 'inline-block', marginLeft: 8,
                        fontSize: '0.7rem', fontWeight: 500,
                        padding: '1px 6px', borderRadius: 10,
                        background: 'rgba(200,164,106,0.15)',
                        color: 'var(--color-amber-dark, #92660a)',
                        border: '1px solid rgba(200,164,106,0.4)',
                        verticalAlign: 'middle',
                        letterSpacing: '0.02em',
                      }}>
                        restricted
                      </span>
                    )}
                  </td>
                  <td>{p.client_name ?? '—'}</td>
                  <td style={{ fontWeight: weeklyHours[p.id] ? 600 : 'normal', color: weeklyHours[p.id] ? 'inherit' : 'var(--color-grey-400)' }}>
                    {fmtMins(weeklyHours[p.id])}
                  </td>
                  <td onClick={e => e.stopPropagation()}>
                    <BillingHorizonStrip
                      weeks={horizonWeeks}
                      projectId={p.id}
                      horizon={billingHorizon[p.id]}
                      onMarkerClick={handleMarkerClick}
                    />
                  </td>
                  <td onClick={e => e.stopPropagation()}>
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
                  <td onClick={e => e.stopPropagation()}>
                    <div className="td-actions">
                      <button className="btn-ghost" onClick={() => navigate(`/projects/${p.id}/timesheet`)}>Timesheet</button>
                      {isAdmin && <button className="btn-ghost" onClick={() => openEdit(p)}>Edit</button>}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {modal && (
        <div className="modal-backdrop" onClick={() => setModal(null)}>
          <div className="modal" style={modal.mode === 'edit' ? { maxWidth: 820, width: '92vw' } : undefined}
            onClick={e => e.stopPropagation()}>
            <h2 className="modal-title">
              {modal.mode === 'create' ? 'New Project' : 'Edit Project'}
            </h2>
            <form onSubmit={handleSave}>
              {error && <div className="error-banner">{error}</div>}

              <div style={modal.mode === 'edit' ? {
                display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 2rem', alignItems: 'start',
              } : undefined}>

                <div>
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
                </div>

                {modal.mode === 'edit' && (
                  <div style={{ borderLeft: '1px solid var(--color-border)', paddingLeft: '2rem' }}>
                    {isAdmin && (
                      <div className="form-group">
                        <label className="form-label">Project Access</label>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', margin: '4px 0 10px' }}>
                          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: '0.875rem' }}>
                            <input type="radio" name="projectAccess"
                              checked={projectAccess === 'open'} onChange={() => setProjectAccess('open')} />
                            Open to all active employees
                          </label>
                          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: '0.875rem' }}>
                            <input type="radio" name="projectAccess"
                              checked={projectAccess === 'restricted'} onChange={() => setProjectAccess('restricted')} />
                            Restricted to assigned employees
                          </label>
                        </div>
                        {projectAccess === 'restricted' && (
                          <AssignmentChecklist
                            items={employees.map(e => ({
                              id:         e.id,
                              name:       `${e.first_name} ${e.last_name}`,
                              sub:        e.employee_code,
                              searchText: `${e.first_name} ${e.last_name} ${e.employee_code}`.toLowerCase(),
                            }))}
                            checkedIds={assignedIds}
                            onToggle={id => setAssignedIds(ids =>
                              ids.includes(id) ? ids.filter(i => i !== id) : [...ids, id]
                            )}
                            placeholder="Search employees…"
                            countLabel={n => `${n} employee${n !== 1 ? 's' : ''} assigned`}
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
                  </div>
                )}
              </div>

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
