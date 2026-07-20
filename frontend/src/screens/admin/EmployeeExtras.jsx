import { useState, useEffect } from 'react';
import { api }      from '../../api.js';
import { useToast } from '../../hooks/useToast.jsx';
import { useAuth }  from '../../auth.jsx';

const STATUS_LABELS = {
  open:                'Open',
  waiting_for_manager: 'Waiting for Review',
  processed:           'Processed',
};

const STATUS_CLS = {
  open:                'ex-status-open',
  waiting_for_manager: 'ex-status-waiting',
  processed:           'ex-status-processed',
};

const EMPTY_MSGS = {
  open:                'No open extras.',
  waiting_for_manager: 'No extras waiting for review.',
  processed:           'No processed extras.',
  all:                 'No extras found.',
};

function fmtDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

export default function EmployeeExtras({ employeeId }) {
  const { toast } = useToast();
  const { user }  = useAuth();
  const isAdmin   = user?.role === 'administrator';

  const [statusFilter,    setStatusFilter]    = useState('open');
  const [items,           setItems]           = useState([]);
  const [loading,         setLoading]         = useState(true);
  const [error,           setError]           = useState('');
  const [saving,          setSaving]          = useState(false);
  const [completeConfirm, setCompleteConfirm] = useState(null);
  const [reviewDialog,    setReviewDialog]    = useState(null);
  const [approveConfirm,  setApproveConfirm]  = useState(null);
  const [rejectDialog,    setRejectDialog]    = useState(null);

  useEffect(() => { load('open'); }, [employeeId]); // eslint-disable-line

  useEffect(() => {
    function onKey(e) {
      if (e.key !== 'Escape') return;
      if (rejectDialog)    { setRejectDialog(null);    return; }
      if (approveConfirm)  { setApproveConfirm(null);  return; }
      if (reviewDialog)    { setReviewDialog(null);    return; }
      if (completeConfirm) { setCompleteConfirm(null); return; }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [completeConfirm, reviewDialog, approveConfirm, rejectDialog]);

  async function load(sf) {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({ user_id: employeeId });
      if (sf && sf !== 'all') params.set('status', sf);
      else params.set('status', 'all');
      const data = await api.get('/api/extras?' + params.toString());
      setItems(data?.data ?? data ?? []);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  function changeFilter(sf) {
    setStatusFilter(sf);
    load(sf);
  }

  async function handleRequestReview() {
    if (!reviewDialog) return;
    setSaving(true);
    try {
      await api.post(`/api/extras/${reviewDialog.id}/request-review`, { comment: reviewDialog.comment });
      toast('Review requested.');
      setReviewDialog(null);
      load(statusFilter);
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleComplete(id) {
    setSaving(true);
    try {
      await api.post(`/api/extras/${id}/complete`, {});
      toast('Extra marked complete.');
      setCompleteConfirm(null);
      load(statusFilter);
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleApprove(id) {
    setSaving(true);
    try {
      await api.post(`/api/extras/${id}/complete`, {});
      toast('Extra approved and marked complete.');
      setApproveConfirm(null);
      load(statusFilter);
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleReject() {
    if (!rejectDialog) return;
    setSaving(true);
    try {
      await api.post(`/api/extras/${rejectDialog.id}/manager-reply`, { comment: rejectDialog.comment });
      toast('Extra returned to open.');
      setRejectDialog(null);
      load(statusFilter);
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  const emptyMsg = EMPTY_MSGS[statusFilter] ?? 'No extras found.';

  return (
    <div className="emp-section">
      <div className="emp-section-header">
        <h2 className="emp-section-title">Extras</h2>
        <select className="form-select" style={{ width: '200px' }}
          value={statusFilter} onChange={e => changeFilter(e.target.value)}>
          <option value="open">Open</option>
          <option value="waiting_for_manager">Waiting Manager Review</option>
          <option value="processed">Processed</option>
          <option value="all">All</option>
        </select>
      </div>

      {error && <div className="error-banner">{error}</div>}

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Project</th>
              <th>Type</th>
              <th>Description</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr className="empty-row"><td colSpan={6}>Loading…</td></tr>
            ) : items.length === 0 ? (
              <tr className="empty-row"><td colSpan={6}>{emptyMsg}</td></tr>
            ) : items.map(ex => (
              <tr key={ex.id}>
                <td style={{ whiteSpace: 'nowrap' }}>{fmtDate(ex.created_at)}</td>
                <td>
                  <span style={{ fontWeight: 500 }}>{ex.project_name}</span>
                  {ex.project_code && (
                    <span style={{ marginLeft: 6, fontSize: '0.8rem', color: 'var(--color-grey-600)' }}>
                      {ex.project_code}
                    </span>
                  )}
                </td>
                <td>
                  <span className="ex-type-badge ex-badge-cost">
                    {ex.type === 'extra_work' ? 'Legacy' : 'Own Cost'}
                  </span>
                </td>
                <td style={{ maxWidth: 280 }}>
                  <span className="ex-description-cell">{ex.description}</span>
                </td>
                <td>
                  <span className={`ex-status-badge ${STATUS_CLS[ex.status] ?? 'ex-status-open'}`}>
                    {STATUS_LABELS[ex.status] ?? ex.status}
                  </span>
                </td>
                <td>
                  <div className="td-actions">
                    {ex.status === 'open' && (
                      <>
                        <button className="btn-ghost" disabled={saving}
                          onClick={() => setReviewDialog({ id: ex.id, label: ex.project_name, comment: '' })}>
                          Send to Manager Review
                        </button>
                        <button className="btn-ghost btn-ghost-green" disabled={saving}
                          onClick={() => setCompleteConfirm({ id: ex.id, label: ex.project_name })}>
                          Mark Complete
                        </button>
                      </>
                    )}
                    {ex.status === 'waiting_for_manager' && (
                      <>
                        <button className="btn-ghost btn-ghost-green" disabled={saving}
                          onClick={() => setApproveConfirm({ id: ex.id, label: ex.project_name })}>
                          Approve
                        </button>
                        <button className="btn-ghost btn-ghost-danger" disabled={saving}
                          onClick={() => setRejectDialog({ id: ex.id, comment: '' })}>
                          Reject
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

      {reviewDialog && (
        <div className="modal-backdrop" onClick={() => setReviewDialog(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h2 className="modal-title">Request Manager Review</h2>
            <p style={{ color: 'var(--color-grey-700)', marginBottom: '1rem' }}>
              {reviewDialog.label}
            </p>
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
              <button className="btn btn-solid" disabled={saving} onClick={handleRequestReview}>
                {saving ? 'Sending…' : 'Send'}
              </button>
            </div>
          </div>
        </div>
      )}

      {completeConfirm && (
        <div className="modal-backdrop" onClick={() => setCompleteConfirm(null)}>
          <div className="modal" style={{ maxWidth: 400 }} onClick={e => e.stopPropagation()}>
            <h2 className="modal-title">Mark Extra as Complete?</h2>
            <p style={{ color: 'var(--color-grey-700)', marginBottom: '1.5rem' }}>
              {completeConfirm.label}
            </p>
            <div className="modal-footer">
              <button className="btn btn-outline" onClick={() => setCompleteConfirm(null)}>Cancel</button>
              <button className="btn btn-solid" disabled={saving}
                onClick={() => handleComplete(completeConfirm.id)}>
                {saving ? 'Processing…' : 'Mark Complete'}
              </button>
            </div>
          </div>
        </div>
      )}

      {approveConfirm && (
        <div className="modal-backdrop" onClick={() => setApproveConfirm(null)}>
          <div className="modal" style={{ maxWidth: 400 }} onClick={e => e.stopPropagation()}>
            <h2 className="modal-title">Approve and Mark Complete?</h2>
            <p style={{ color: 'var(--color-grey-700)', marginBottom: '1.5rem' }}>
              {approveConfirm.label}
            </p>
            <div className="modal-footer">
              <button className="btn btn-outline" onClick={() => setApproveConfirm(null)}>Cancel</button>
              <button className="btn btn-solid" disabled={saving}
                onClick={() => handleApprove(approveConfirm.id)}>
                {saving ? 'Processing…' : 'Approve'}
              </button>
            </div>
          </div>
        </div>
      )}

      {rejectDialog && (
        <div className="modal-backdrop" onClick={() => setRejectDialog(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h2 className="modal-title">Reject and Return to Open</h2>
            <div className="form-group">
              <label className="form-label">Comment (optional)</label>
              <textarea className="form-input" rows={3}
                placeholder="Explain the reason for rejection…"
                value={rejectDialog.comment}
                onChange={e => setRejectDialog(d => ({ ...d, comment: e.target.value }))}
              />
            </div>
            <div className="modal-footer">
              <button className="btn btn-outline" onClick={() => setRejectDialog(null)}>Cancel</button>
              <button className="btn btn-amber" disabled={saving} onClick={handleReject}>
                {saving ? 'Sending…' : 'Reject'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
