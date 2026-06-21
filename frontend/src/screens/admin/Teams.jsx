import { useState, useEffect } from 'react';
import { useNavigate }         from 'react-router-dom';
import { api }                 from '../../api.js';
import { useAuth }             from '../../auth.jsx';
import AppShell                from '../AppShell.jsx';

const EMPTY = { name: '', supervisor_id: '' };

export default function Teams() {
  const { user }   = useAuth();
  const navigate   = useNavigate();
  const isAdmin    = user?.role === 'administrator';

  const [items,     setItems]     = useState([]);
  const [managers,  setManagers]  = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [search,    setSearch]    = useState('');
  const [modal,     setModal]     = useState(null);
  const [confirm,   setConfirm]   = useState(null);
  const [saving,    setSaving]    = useState(false);
  const [error,     setError]     = useState('');
  const [form,      setForm]      = useState(EMPTY);

  useEffect(() => {
    load('');
    // Load supervisors/managers to populate the dropdown
    api.get('/api/employees')
      .then(data => setManagers(data.filter(e => ['manager', 'administrator'].includes(e.role))))
      .catch(() => {});
  }, []);  // eslint-disable-line

  async function load() {
    setLoading(true);
    setError('');
    try {
      const data = await api.get('/api/teams');
      setItems(data);
    } catch (e) {
      if (e.status === 401) navigate('/login', { replace: true });
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  const filtered = search
    ? items.filter(t => t.name.toLowerCase().includes(search.toLowerCase()))
    : items;

  function openCreate() {
    setForm(EMPTY);
    setError('');
    setModal({ mode: 'create' });
  }

  function openEdit(item) {
    setForm({
      name:          item.name          ?? '',
      supervisor_id: item.supervisor_id ?? '',
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
        name:          form.name,
        supervisor_id: form.supervisor_id ? Number(form.supervisor_id) : null,
      };
      if (modal.mode === 'create') {
        await api.post('/api/teams', body);
      } else {
        await api.put(`/api/teams/${modal.id}`, body);
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
      await api.delete(`/api/teams/${confirm.id}`);
      setConfirm(null);
      load();
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <AppShell title="Teams">
      <div className="page">
        <div className="page-header">
          <h1 className="page-title">Teams</h1>
          {isAdmin && (
            <button className="btn btn-solid" onClick={openCreate}>+ New Team</button>
          )}
        </div>

        <div className="toolbar">
          <input
            className="search-input"
            placeholder="Search teams…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>

        {error && !modal && <div className="error-banner">{error}</div>}

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Supervisor</th>
                <th>Status</th>
                {isAdmin && <th>Actions</th>}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr className="empty-row"><td colSpan={isAdmin ? 4 : 3}>Loading…</td></tr>
              ) : filtered.length === 0 ? (
                <tr className="empty-row"><td colSpan={isAdmin ? 4 : 3}>No teams found.</td></tr>
              ) : filtered.map(t => (
                <tr key={t.id}>
                  <td style={{ fontWeight: 500 }}>{t.name}</td>
                  <td>{t.supervisor_name ?? '—'}</td>
                  <td>
                    {t.is_active
                      ? <span className="badge badge-active">Active</span>
                      : <span className="badge badge-inactive">Inactive</span>}
                  </td>
                  {isAdmin && (
                    <td>
                      <div className="td-actions">
                        <button className="btn-ghost" onClick={() => openEdit(t)}>Edit</button>
                        <button className="btn-ghost" style={{ color: 'var(--color-red)' }}
                          onClick={() => setConfirm({ id: t.id, name: t.name })}>Delete</button>
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
              {modal.mode === 'create' ? 'New Team' : 'Edit Team'}
            </h2>
            <form onSubmit={handleSave}>
              {error && <div className="error-banner">{error}</div>}

              <div className="form-group">
                <label className="form-label">Team Name *</label>
                <input className="form-input" required value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
              </div>

              <div className="form-group">
                <label className="form-label">Supervisor</label>
                <select className="form-select" value={form.supervisor_id}
                  onChange={e => setForm(f => ({ ...f, supervisor_id: e.target.value }))}>
                  <option value="">— None —</option>
                  {managers.map(m => (
                    <option key={m.id} value={m.id}>{m.name}</option>
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
            <h2 className="modal-title">Deactivate team?</h2>
            <p style={{ fontSize: '0.9rem', color: 'var(--color-grey-600)' }}>
              "{confirm.name}" will be marked inactive.
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
