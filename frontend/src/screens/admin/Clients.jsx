import { useState, useEffect } from 'react';
import { useNavigate }         from 'react-router-dom';
import { api }                 from '../../api.js';
import { useAuth }             from '../../auth.jsx';
import AppShell                from '../AppShell.jsx';
import PhoneInput              from '../../components/PhoneInput.jsx';

const EMPTY = { name: '', contact_person: '', phone: '', email: '', notes: '' };

export default function Clients() {
  const { user }   = useAuth();
  const navigate   = useNavigate();
  const isAdmin    = user?.role === 'administrator';

  const [items,   setItems]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [search,  setSearch]  = useState('');
  const [modal,   setModal]   = useState(null);
  const [confirm, setConfirm] = useState(null);
  const [saving,  setSaving]  = useState(false);
  const [error,   setError]   = useState('');
  const [form,    setForm]    = useState(EMPTY);

  useEffect(() => { load(); }, []);  // eslint-disable-line

  async function load(q = '') {
    setLoading(true);
    setError('');
    try {
      const data = await api.get('/api/clients' + (q ? `?search=${encodeURIComponent(q)}` : ''));
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
      name:           item.name           ?? '',
      contact_person: item.contact_person ?? '',
      phone:          item.phone          ?? '',
      email:          item.email          ?? '',
      notes:          item.notes          ?? '',
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
        phone: form.phone || null,
        email: form.email || null,
        notes: form.notes || null,
        contact_person: form.contact_person || null,
      };
      if (modal.mode === 'create') {
        await api.post('/api/clients', body);
      } else {
        await api.put(`/api/clients/${modal.id}`, body);
      }
      setModal(null);
      load(search);
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
      await api.delete(`/api/clients/${confirm.id}`);
      setConfirm(null);
      load(search);
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <AppShell title="Clients">
      <div className="page">
        <div className="page-header">
          <h1 className="page-title">Clients</h1>
          {isAdmin && (
            <button className="btn btn-solid" onClick={openCreate}>+ New Client</button>
          )}
        </div>

        <div className="toolbar">
          <input
            className="search-input"
            placeholder="Search clients…"
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
                <th>Contact</th>
                <th>Phone</th>
                <th>Status</th>
                {isAdmin && <th>Actions</th>}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr className="empty-row"><td colSpan={isAdmin ? 6 : 5}>Loading…</td></tr>
              ) : items.length === 0 ? (
                <tr className="empty-row"><td colSpan={isAdmin ? 6 : 5}>No clients found.</td></tr>
              ) : items.map(c => (
                <tr key={c.id}>
                  <td><code style={{ fontSize: '0.8125rem' }}>{c.client_code}</code></td>
                  <td style={{ fontWeight: 500 }}>{c.name}</td>
                  <td>{c.contact_person ?? '—'}</td>
                  <td>{c.phone ?? '—'}</td>
                  <td>
                    {c.is_active
                      ? <span className="badge badge-active">Active</span>
                      : <span className="badge badge-inactive">Inactive</span>}
                  </td>
                  {isAdmin && (
                    <td>
                      <div className="td-actions">
                        <button className="btn-ghost" onClick={() => openEdit(c)}>Edit</button>
                        <button className="btn-ghost" style={{ color: 'var(--color-red)' }}
                          onClick={() => setConfirm({ id: c.id, name: c.name })}>
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
              {modal.mode === 'create' ? 'New Client' : 'Edit Client'}
            </h2>
            <form onSubmit={handleSave}>
              {error && <div className="error-banner">{error}</div>}

              <div className="form-group">
                <label className="form-label">Name *</label>
                <input className="form-input" required value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
              </div>

              <div className="form-group">
                <label className="form-label">Contact Person</label>
                <input className="form-input" value={form.contact_person}
                  onChange={e => setForm(f => ({ ...f, contact_person: e.target.value }))} />
              </div>

              <div className="form-group">
                <label className="form-label">Phone</label>
                <PhoneInput
                  value={form.phone}
                  onChange={v => setForm(f => ({ ...f, phone: v }))}
                />
              </div>

              <div className="form-group">
                <label className="form-label">Email</label>
                <input className="form-input" type="email" value={form.email}
                  onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
              </div>

              <div className="form-group">
                <label className="form-label">Notes</label>
                <textarea className="form-input" rows={3} value={form.notes}
                  style={{ resize: 'vertical' }}
                  onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
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
            <h2 className="modal-title">Deactivate client?</h2>
            <p style={{ fontSize: '0.9rem', color: 'var(--color-grey-600)' }}>
              "{confirm.name}" will be marked inactive. Projects linked to this client are unaffected.
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
