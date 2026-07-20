import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api }      from '../../api.js';
import { useAuth }  from '../../auth.jsx';
import AppShell     from '../AppShell.jsx';
import { useToast } from '../../hooks/useToast.jsx';

const TYPE_LABELS = { extra_work: 'Legacy', own_cost: 'Own Cost' };
const EMPTY_FORM  = { user_id: '', project_id: '', type: 'own_cost', description: '' };

const STATUS_CONFIG = {
  open:                { label: 'Open',               cls: 'ex-status-open' },
  waiting_for_manager: { label: 'Waiting for Review', cls: 'ex-status-waiting' },
  processed:           { label: 'Processed',          cls: 'ex-status-processed' },
};

const COMMENT_LABELS = {
  created:          'Created',
  review_requested: 'Sent for review',
  manager_reply:    'Manager replied',
  completed:        'Completed',
};

function fmtDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

function TypeBadge({ type }) {
  const cls = type === 'extra_work' ? 'ex-badge-work' : 'ex-badge-cost';
  return <span className={`ex-type-badge ${cls}`}>{TYPE_LABELS[type] ?? type}</span>;
}

function StatusBadge({ status }) {
  const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.open;
  return <span className={`ex-status-badge ${cfg.cls}`}>{cfg.label}</span>;
}

function TimelineItem({ c }) {
  return (
    <div className="ex-timeline-item">
      <div className="ex-timeline-meta">
        <span className="ex-timeline-author">{c.author_name}</span>
        <span className="ex-timeline-type">— {COMMENT_LABELS[c.comment_type] ?? c.comment_type}</span>
        <span className="ex-timeline-date">{fmtDate(c.created_at)}</span>
      </div>
      {c.comment && <div className="ex-timeline-text">{c.comment}</div>}
    </div>
  );
}

export default function AdminExtras() {
  const { user }       = useAuth();
  const navigate       = useNavigate();
  const [searchParams] = useSearchParams();

  const { toast }    = useToast();
  const isAdmin      = user?.role === 'administrator';
  const isAdminOrMgr = user?.role === 'administrator' || user?.role === 'manager';

  const [statusFilter,   setStatusFilter]  = useState(searchParams.get('status')          ?? 'open');
  const [projectFilter,  setProjectFilter] = useState(searchParams.get('project_id')      ?? '');
  const [userFilter,     setUserFilter]    = useState(searchParams.get('user_id')         ?? '');
  const [typeFilter,     setTypeFilter]    = useState(searchParams.get('type')            ?? '');
  // older_than_days: set from URL (e.g. dashboard drill-down), not exposed in UI filters
  const [olderThanDays] = useState(searchParams.get('older_than_days') ?? '');

  const [items,     setItems]     = useState([]);
  const [employees, setEmployees] = useState([]);
  const [projects,  setProjects]  = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [error,     setError]     = useState('');
  const [saving,    setSaving]    = useState(false);

  // Edit / create modal
  const [modal,    setModal]    = useState(null);
  const [form,     setForm]     = useState(EMPTY_FORM);

  // Delete confirmation
  const [deleteConfirm, setDeleteConfirm] = useState(null);

  // Complete confirmation
  const [completeConfirm, setCompleteConfirm] = useState(null);

  // Request Review dialog  { id, comment, comments, loadingComments }
  const [reviewDialog, setReviewDialog] = useState(null);

  // Manager Reply dialog  { id, extra, comments, replyComment }
  const [replyDialog, setReplyDialog] = useState(null);

  // Read-only history dialog  { id, extra, comments, loadingComments }
  const [historyDialog, setHistoryDialog] = useState(null);

  useEffect(() => {
    api.get('/api/employees?status=active').then(d => setEmployees(Array.isArray(d) ? d : (d ?? []))).catch(() => {});
    api.get('/api/projects?status=all').then(d => setProjects(Array.isArray(d) ? d : (d?.data ?? []))).catch(() => {});
    load(statusFilter, projectFilter, userFilter, typeFilter);
  }, []); // eslint-disable-line

  async function load(sf, pf, uf, tf) {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams();
      if (sf)            params.set('status',          sf);
      if (pf)            params.set('project_id',      pf);
      if (uf)            params.set('user_id',         uf);
      if (tf)            params.set('type',            tf);
      if (olderThanDays) params.set('older_than_days', olderThanDays);
      const data = await api.get('/api/extras?' + params.toString());
      setItems(data?.data ?? data ?? []);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  function applyFilters(sf, pf, uf, tf) {
    setStatusFilter(sf); setProjectFilter(pf); setUserFilter(uf); setTypeFilter(tf);
    load(sf, pf, uf, tf);
  }

  function handleReset() {
    applyFilters('open', '', '', '');
  }

  // ── Complete flow ─────────────────────────────────────────────────────────────
  async function openCompleteConfirm(item) {
    setCompleteConfirm({ id: item.id, label: `${item.employee_name} / ${item.project_name}`, comments: [], loadingComments: true });
    try {
      const data = await api.get(`/api/extras/${item.id}`);
      setCompleteConfirm(d => d ? { ...d, comments: data.comments ?? [], loadingComments: false } : d);
    } catch {
      setCompleteConfirm(d => d ? { ...d, loadingComments: false } : d);
    }
  }

  async function handleComplete() {
    if (!completeConfirm) return;
    setSaving(true);
    try {
      await api.post(`/api/extras/${completeConfirm.id}/complete`, {});
      toast('Extra marked complete.');
      setCompleteConfirm(null);
      load(statusFilter, projectFilter, userFilter, typeFilter);
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  // ── Request Review flow ───────────────────────────────────────────────────────
  async function openReviewDialog(item) {
    setReviewDialog({ id: item.id, comment: '', comments: [], loadingComments: true });
    try {
      const data = await api.get(`/api/extras/${item.id}`);
      setReviewDialog(d => d ? { ...d, comments: data.comments ?? [], loadingComments: false } : d);
    } catch {
      setReviewDialog(d => d ? { ...d, loadingComments: false } : d);
    }
  }

  async function sendReview() {
    if (!reviewDialog) return;
    setSaving(true);
    try {
      await api.post(`/api/extras/${reviewDialog.id}/request-review`, { comment: reviewDialog.comment });
      toast('Review requested.');
      setReviewDialog(null);
      load(statusFilter, projectFilter, userFilter, typeFilter);
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  // ── Manager Reply flow ────────────────────────────────────────────────────────
  async function openReplyDialog(item) {
    setReplyDialog({ id: item.id, extra: item, comments: [], replyComment: '', loadingComments: true });
    try {
      const data = await api.get(`/api/extras/${item.id}`);
      setReplyDialog(d => d ? { ...d, comments: data.comments ?? [], loadingComments: false } : d);
    } catch {
      setReplyDialog(d => d ? { ...d, loadingComments: false } : d);
    }
  }

  async function sendReply() {
    if (!replyDialog) return;
    setSaving(true);
    try {
      await api.post(`/api/extras/${replyDialog.id}/manager-reply`, { comment: replyDialog.replyComment });
      toast('Reply sent.');
      setReplyDialog(null);
      load(statusFilter, projectFilter, userFilter, typeFilter);
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  // ── View History ─────────────────────────────────────────────────────────────
  async function openHistoryDialog(item) {
    setHistoryDialog({ id: item.id, extra: item, comments: [], loadingComments: true });
    try {
      const data = await api.get(`/api/extras/${item.id}`);
      setHistoryDialog(d => d ? { ...d, comments: data.comments ?? [], loadingComments: false } : d);
    } catch {
      setHistoryDialog(d => d ? { ...d, loadingComments: false } : d);
    }
  }

  // ── Create / Edit ─────────────────────────────────────────────────────────────
  function openCreate() {
    setForm(EMPTY_FORM); setError(''); setModal({ mode: 'create' });
  }

  function openEdit(item) {
    setForm({
      user_id:     String(item.user_id),
      project_id:  String(item.project_id),
      type:        item.type,
      description: item.description ?? '',
    });
    setError(''); setModal({ mode: 'edit', id: item.id, item });
  }

  async function handleSave(e) {
    e.preventDefault();
    setSaving(true); setError('');
    try {
      const body = {
        user_id:     Number(form.user_id),
        project_id:  Number(form.project_id),
        type:        form.type,
        description: form.description,
      };
      if (modal.mode === 'create') {
        await api.post('/api/extras', body);
        toast('Extra created.');
      } else {
        await api.put(`/api/extras/${modal.id}`, body);
        toast('Extra updated.');
      }
      setModal(null);
      load(statusFilter, projectFilter, userFilter, typeFilter);
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!deleteConfirm) return;
    setSaving(true);
    try {
      await api.delete(`/api/extras/${deleteConfirm.id}`);
      toast('Extra deleted.');
      setDeleteConfirm(null);
      load(statusFilter, projectFilter, userFilter, typeFilter);
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  useEffect(() => {
    function onKey(e) {
      if (e.key !== 'Escape') return;
      if (deleteConfirm)   { setDeleteConfirm(null);   return; }
      if (completeConfirm) { setCompleteConfirm(null); return; }
      if (reviewDialog)    { setReviewDialog(null);    return; }
      if (replyDialog)     { setReplyDialog(null);     return; }
      if (historyDialog)   { setHistoryDialog(null);   return; }
      if (modal)           { setModal(null);           return; }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [modal, deleteConfirm, completeConfirm, reviewDialog, replyDialog, historyDialog]);

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

        <div className="toolbar" style={{ flexWrap: 'wrap', gap: '10px' }}>
          <select className="form-select toolbar-select" style={{ width: '180px' }}
            value={statusFilter}
            onChange={e => applyFilters(e.target.value, projectFilter, userFilter, typeFilter)}>
            <option value="open">Open</option>
            <option value="waiting_for_manager">Waiting for Review</option>
            <option value="processed">Processed</option>
            <option value="all">All</option>
          </select>

          <select className="form-select toolbar-select" style={{ width: '200px' }}
            value={projectFilter}
            onChange={e => applyFilters(statusFilter, e.target.value, userFilter, typeFilter)}>
            <option value="">All Projects</option>
            {projects.map(p => (
              <option key={p.id} value={p.id}>[{p.project_code}] {p.name}</option>
            ))}
          </select>

          <select className="form-select toolbar-select" style={{ width: '180px' }}
            value={userFilter}
            onChange={e => applyFilters(statusFilter, projectFilter, e.target.value, typeFilter)}>
            <option value="">All Employees</option>
            {employees.map(emp => (
              <option key={emp.id} value={emp.id}>{emp.first_name} {emp.last_name}</option>
            ))}
          </select>

          <select className="form-select toolbar-select" style={{ width: '150px' }}
            value={typeFilter}
            onChange={e => applyFilters(statusFilter, projectFilter, userFilter, e.target.value)}>
            <option value="">All Types</option>
            <option value="own_cost">Own Cost</option>
          </select>

          <button className="btn btn-outline toolbar-reset" onClick={handleReset}>Reset</button>
        </div>

        {error && !modal && !reviewDialog && !replyDialog && (
          <div className="error-banner">{error}</div>
        )}

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Employee</th>
                <th>Project</th>
                <th>Type</th>
                <th>Description</th>
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
                  <td style={{ maxWidth: 300 }}>
                    <span className="ex-description-cell">{ex.description}</span>
                    <div className="ex-row-meta">
                      {ex.has_manager_reply > 0 && (
                        <button className="ex-reviewed-badge ex-reviewed-btn"
                          onClick={() => openHistoryDialog(ex)}>
                          ↩ Reviewed by manager — view reply
                        </button>
                      )}
                      {ex.comment_count > 0 && ex.has_manager_reply === 0 && (
                        <button className="ex-comment-count" onClick={() => openHistoryDialog(ex)}>
                          💬 {ex.comment_count} comment{ex.comment_count !== 1 ? 's' : ''}
                        </button>
                      )}
                    </div>
                  </td>
                  <td><StatusBadge status={ex.status} /></td>
                  <td>
                    <div className="td-actions">
                      {ex.status === 'open' && (
                        <>
                          <button className="btn-ghost btn-ghost-green" disabled={saving}
                            onClick={() => openCompleteConfirm(ex)}>
                            Mark Complete
                          </button>
                          <button className="btn-ghost" disabled={saving}
                            onClick={() => openReviewDialog(ex)}>
                            Request Review
                          </button>
                        </>
                      )}
                      {ex.status === 'waiting_for_manager' && isAdminOrMgr && (
                        <button className="btn-ghost" disabled={saving}
                          onClick={() => openReplyDialog(ex)}>
                          Send Reply
                        </button>
                      )}
                      {isAdmin && (
                        <>
                          <button className="btn-ghost" onClick={() => openEdit(ex)}>Edit</button>
                          <button className="btn-ghost btn-ghost-danger"
                            onClick={() => setDeleteConfirm({ id: ex.id })}>
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

      {/* ── Complete confirmation ─────────────────────────────────────────────── */}
      {completeConfirm && (
        <div className="modal-backdrop" onClick={() => setCompleteConfirm(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h2 className="modal-title">Complete Own Cost</h2>
            <p style={{ color: 'var(--color-grey-600)', fontSize: '0.875rem', margin: '0 0 1rem' }}>
              {completeConfirm.label}
            </p>

            {completeConfirm.loadingComments ? (
              <div style={{ textAlign: 'center', padding: '1rem' }}>
                <span className="em-spinner" style={{ display: 'inline-block' }} />
              </div>
            ) : completeConfirm.comments.length > 0 && (
              <div className="ex-timeline" style={{ marginBottom: '1rem' }}>
                {completeConfirm.comments.map(c => <TimelineItem key={c.id} c={c} />)}
              </div>
            )}

            <p style={{ color: 'var(--color-grey-700)', margin: '0 0 1.5rem' }}>
              Mark this item as completed?
            </p>
            <div className="modal-footer">
              <button className="btn btn-outline" onClick={() => setCompleteConfirm(null)}>Cancel</button>
              <button className="btn btn-solid" onClick={handleComplete}
                disabled={saving || completeConfirm.loadingComments}>
                {saving ? 'Processing…' : 'Complete'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Request Manager Review dialog ─────────────────────────────────────── */}
      {reviewDialog && (
        <div className="modal-backdrop" onClick={() => setReviewDialog(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h2 className="modal-title">Request Manager Review</h2>

            {reviewDialog.loadingComments ? (
              <div style={{ textAlign: 'center', padding: '1rem' }}>
                <span className="em-spinner" style={{ display: 'inline-block' }} />
              </div>
            ) : reviewDialog.comments.length > 0 && (
              <div className="ex-timeline">
                {reviewDialog.comments.map(c => <TimelineItem key={c.id} c={c} />)}
              </div>
            )}

            <div className="form-group">
              <label className="form-label">Comment (optional)</label>
              <textarea className="form-input" rows={3}
                placeholder="Add a note for the manager…"
                value={reviewDialog.comment}
                onChange={e => setReviewDialog(d => ({ ...d, comment: e.target.value }))}
              />
            </div>

            <div className="modal-footer">
              <button className="btn btn-outline" onClick={() => setReviewDialog(null)}>Cancel</button>
              <button className="btn btn-solid" onClick={sendReview}
                disabled={saving || reviewDialog.loadingComments}>
                {saving ? 'Sending…' : 'Send'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Manager Reply dialog ──────────────────────────────────────────────── */}
      {replyDialog && (
        <div className="modal-backdrop" onClick={() => setReplyDialog(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h2 className="modal-title">Manager Reply</h2>

            {replyDialog.extra && (
              <div style={{ marginBottom: '1rem', padding: '0.75rem', background: 'var(--color-surface)',
                borderRadius: '8px', border: '1px solid var(--color-border)' }}>
                <div style={{ fontWeight: 600, marginBottom: '0.25rem' }}>
                  {replyDialog.extra.employee_name}
                  <span style={{ fontWeight: 400, color: 'var(--color-grey-600)', marginLeft: 8, fontSize: '0.875rem' }}>
                    {replyDialog.extra.project_name}
                  </span>
                </div>
                <div style={{ fontSize: '0.875rem', color: 'var(--color-grey-700)' }}>
                  {replyDialog.extra.description}
                </div>
              </div>
            )}

            {replyDialog.loadingComments ? (
              <div style={{ textAlign: 'center', padding: '1rem' }}>
                <span className="em-spinner" style={{ display: 'inline-block' }} />
              </div>
            ) : replyDialog.comments.length > 0 && (
              <div className="ex-timeline">
                {replyDialog.comments.map(c => <TimelineItem key={c.id} c={c} />)}
              </div>
            )}

            <div className="form-group">
              <label className="form-label">Manager Comment</label>
              <textarea className="form-input" rows={3}
                value={replyDialog.replyComment}
                onChange={e => setReplyDialog(d => ({ ...d, replyComment: e.target.value }))}
              />
            </div>

            <div className="modal-footer">
              <button className="btn btn-outline" onClick={() => setReplyDialog(null)}>Cancel</button>
              <button className="btn btn-solid" onClick={sendReply}
                disabled={saving || replyDialog.loadingComments || !replyDialog.replyComment.trim()}>
                {saving ? 'Sending…' : 'Send Reply'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Create / Edit modal ───────────────────────────────────────────────── */}
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
                </select>
              </div>

              <div className="form-group">
                <label className="form-label">Description *</label>
                <textarea className="form-input" required rows={4}
                  style={{ resize: 'vertical', minHeight: 80 }}
                  value={form.description}
                  onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                />
              </div>

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

      {/* ── Comment History dialog (read-only) ───────────────────────────────── */}
      {historyDialog && (
        <div className="modal-backdrop" onClick={() => setHistoryDialog(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h2 className="modal-title">Comment History</h2>

            {historyDialog.extra && (
              <div style={{ marginBottom: '1rem', padding: '0.75rem', background: 'var(--color-surface)',
                borderRadius: '8px', border: '1px solid var(--color-border)' }}>
                <div style={{ fontWeight: 600, marginBottom: '0.25rem' }}>
                  {historyDialog.extra.employee_name}
                  <span style={{ fontWeight: 400, color: 'var(--color-grey-600)', marginLeft: 8, fontSize: '0.875rem' }}>
                    {historyDialog.extra.project_name}
                  </span>
                </div>
                <div style={{ fontSize: '0.875rem', color: 'var(--color-grey-700)' }}>
                  {historyDialog.extra.description}
                </div>
              </div>
            )}

            {historyDialog.loadingComments ? (
              <div style={{ textAlign: 'center', padding: '1rem' }}>
                <span className="em-spinner" style={{ display: 'inline-block' }} />
              </div>
            ) : historyDialog.comments.length === 0 ? (
              <p style={{ color: 'var(--color-grey-500)', fontSize: '0.875rem' }}>No comments yet.</p>
            ) : (
              <div className="ex-timeline">
                {historyDialog.comments.map(c => <TimelineItem key={c.id} c={c} />)}
              </div>
            )}

            <div className="modal-footer">
              <button className="btn btn-outline" onClick={() => setHistoryDialog(null)}>Close</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Delete confirmation ───────────────────────────────────────────────── */}
      {deleteConfirm && (
        <div className="modal-backdrop" onClick={() => setDeleteConfirm(null)}>
          <div className="modal" style={{ maxWidth: 400 }} onClick={e => e.stopPropagation()}>
            <h2 className="modal-title">Delete Extra?</h2>
            <p style={{ color: 'var(--color-grey-700)', margin: '0 0 1.5rem' }}>
              This will permanently remove the extra from the queue.
            </p>
            <div className="modal-footer">
              <button className="btn btn-outline" onClick={() => setDeleteConfirm(null)}>Cancel</button>
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
