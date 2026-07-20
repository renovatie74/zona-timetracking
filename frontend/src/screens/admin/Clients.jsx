import { useState, useEffect, useCallback } from 'react';
import { api }                 from '../../api.js';
import { useAuth }             from '../../auth.jsx';
import AppShell                from '../AppShell.jsx';
import PhoneInput              from '../../components/PhoneInput.jsx';
import { useToast }            from '../../hooks/useToast.jsx';
import { useDebounce }         from '../../hooks/useDebounce.js';

const EMPTY = { name: '', contact_person: '', phone: '', email: '', notes: '' };

export default function Clients() {
  const { user }   = useAuth();
  const { toast }  = useToast();
  const isAdmin    = user?.role === 'administrator';

  const [items,        setItems]        = useState([]);
  const [loading,      setLoading]      = useState(true);
  const [search,       setSearch]       = useState('');
  const [statusFilter, setStatusFilter] = useState('');   // '' = active (default)
  const [modal,        setModal]        = useState(null);
  const [confirm,      setConfirm]      = useState(null);
  const [saving,       setSaving]       = useState(false);
  const [error,        setError]        = useState('');
  const [form,         setForm]         = useState(EMPTY);

  useEffect(() => { load('', ''); }, []);  // eslint-disable-line

  const debouncedLoad = useDebounce(load, 300);

  async function load(q, sf) {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams();
      if (q)  params.set('search', q);
      if (sf) params.set('status', sf);
      const qs = params.toString();
      const data = await api.get('/api/clients' + (qs ? `?${qs}` : ''));
      setItems(data);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  function handleSearchChange(e) {
    const q = e.target.value;
    setSearch(q);
    debouncedLoad(q, statusFilter);
  }

  function handleStatusFilter(e) {
    const sf = e.target.value;
    setStatusFilter(sf);
    load(search, sf);
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
    setModal({ mode: 'edit', id: item.id, item });
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
        toast('Client created.');
      } else {
        await api.put(`/api/clients/${modal.id}`, body);
        toast('Client updated.');
      }
      setModal(null);
      load(search, statusFilter);
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
      toast('Client deactivated.');
      setConfirm(null);
      setModal(null);
      load(search, statusFilter);
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
            placeholder="Search by code, name, contact…"
            value={search}
            onChange={handleSearchChange}
          />
          <select className="form-select toolbar-select" style={{ width: '160px' }}
            value={statusFilter} onChange={handleStatusFilter}>
            <option value="">Active</option>
            <option value="inactive">Inactive</option>
            <option value="all">All</option>
          </select>
          <button className="btn btn-outline toolbar-reset" onClick={() => {
            setSearch(''); setStatusFilter(''); load('', '');
          }}>Reset</button>
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
            <h2 className="modal-title">Deactivate client?</h2>
            <p style={{ fontSize: '0.9rem', color: 'var(--color-grey-600)' }}>
              "{confirm.name}" will be marked inactive. Projects linked to this client are unaffected.
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
