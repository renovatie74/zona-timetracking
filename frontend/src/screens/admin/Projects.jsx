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
        client_id: form.client_id ? Number(form.client_id) : null,
        end_date: form.end_date || null,
      };
      if (modal.mode === 'create') {
        await api.post('/api/projects', body);
      } else {
        await api.put(`/api/projects/${modal.id}`, body);
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
          <select className="form-select toolbar-select"
            value={statusFilter} onChange={handleStatusFilter}>
            <option value="">Planning + Active</option>
            <option value="planning">Planning</option>
            <option value="active">Active</option>
            <option value="completed">Completed</option>
            <option value="cancelled">Cancelled</option>
            <option value="all">All</option>
          </select>
          <select className="form-select toolbar-select"
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
                {isAdmin && <th>Actions</th>}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr className="empty-row"><td colSpan={isAdmin ? 7 : 6}>Loading…</td></tr>
              ) : items.length === 0 ? (
                <tr className="empty-row"><td colSpan={isAdmin ? 7 : 6}>No projects found.</td></tr>
              ) : items.map(p => (
                <tr key={p.id}>
                  <td><code style={{ fontSize: '0.8125rem' }}>{p.project_code}</code></td>
                  <td style={{ fontWeight: 500 }}>{p.name}</td>
                  <td>{p.client_name ?? '—'}</td>
                  <td>{p.location   ?? '—'}</td>
                  <td>{statusBadge(p.status)}</td>
                  <td>{p.start_date}</td>
                  {isAdmin && (
                    <td>
                      <div className="td-actions">
                        <button className="btn-ghost" onClick={() => openEdit(p)}>Edit</button>
                        <button className="btn-ghost" style={{ color: 'var(--color-amber)' }}
                          onClick={() => setConfirm({ id: p.id, name: p.name })}>
                          Deactivate
                        </button>
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
            <h2 className="modal-title">Deactivate project?</h2>
            <p style={{ fontSize: '0.9rem', color: 'var(--color-grey-600)' }}>
              "{confirm.name}" will be hidden from all lists. Existing time entries are preserved.
            </p>
            <div className="modal-footer">
              <button className="btn btn-outline" onClick={() => setConfirm(null)}>Cancel</button>
              <button className="btn btn-danger" disabled={saving} onClick={handleDeactivate}>
                {saving ? 'Deactivating…' : 'Deactivate'}
              </button>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}
