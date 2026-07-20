import { useState, useEffect } from 'react';
import { api }      from '../../api.js';
import { useToast } from '../../hooks/useToast.jsx';
import { weekStartFor } from '../../lib/weekUtils.js';

function addWeeks(dateStr, n) {
  const d = new Date(dateStr + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n * 7);
  return d.toISOString().slice(0, 10);
}

function fmtWeekLabel(weekStart) {
  const d   = new Date(weekStart + 'T00:00:00Z');
  const end = new Date(weekStart + 'T00:00:00Z');
  end.setUTCDate(d.getUTCDate() + 6);
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${months[d.getUTCMonth()]} ${d.getUTCDate()} – ${months[end.getUTCMonth()]} ${end.getUTCDate()}, ${end.getUTCFullYear()}`;
}

function fmtDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso + 'T00:00:00Z');
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${months[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}`;
}

const TODAY = new Date().toISOString().slice(0, 10);

export default function EmployeeMileage({ employeeId }) {
  const { toast } = useToast();

  const [weekStart,  setWeekStart]  = useState(() => weekStartFor(TODAY));
  const [entries,    setEntries]    = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState('');
  const [completing, setCompleting] = useState(null);
  const [reopening,  setReopening]  = useState(null);

  useEffect(() => { load(weekStart); }, [employeeId]); // eslint-disable-line

  async function load(ws) {
    setLoading(true);
    setError('');
    try {
      const data = await api.get(`/api/mileage?user_id=${employeeId}&week=${ws}`);
      setEntries(data?.data ?? data ?? []);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  function goWeek(delta) {
    const ws = addWeeks(weekStart, delta);
    setWeekStart(ws);
    load(ws);
  }

  async function handleComplete(item) {
    setCompleting(item.id);
    try {
      await api.post(`/api/mileage/${item.id}/complete`, {});
      toast('Mileage entry marked complete.');
      load(weekStart);
    } catch (e) {
      setError(e.message);
    } finally {
      setCompleting(null);
    }
  }

  async function handleReopen(item) {
    setReopening(item.id);
    try {
      await api.post(`/api/mileage/${item.id}/reopen`, {});
      toast('Mileage entry reopened.');
      load(weekStart);
    } catch (e) {
      setError(e.message);
    } finally {
      setReopening(null);
    }
  }

  const totalKm = entries.reduce((s, e) => s + e.km, 0);

  return (
    <div className="emp-section">
      <div className="emp-section-header">
        <h2 className="emp-section-title">Mileage</h2>
        <div className="emp-week-nav">
          <button className="btn btn-outline emp-week-btn" onClick={() => goWeek(-1)}>‹ Prev</button>
          <span className="emp-week-label">{fmtWeekLabel(weekStart)}</span>
          <button className="btn btn-outline emp-week-btn" onClick={() => goWeek(1)}>Next ›</button>
          <button className="btn btn-outline emp-week-btn" onClick={() => { const ws = weekStartFor(TODAY); setWeekStart(ws); load(ws); }}>
            Current
          </button>
        </div>
      </div>

      {error && <div className="error-banner">{error}</div>}

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Project</th>
              <th>Km</th>
              <th>Note</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr className="empty-row"><td colSpan={6}>Loading…</td></tr>
            ) : entries.length === 0 ? (
              <tr className="empty-row"><td colSpan={6}>No mileage entries for this week.</td></tr>
            ) : entries.map(entry => (
              <tr key={entry.id}>
                <td style={{ whiteSpace: 'nowrap' }}>{fmtDate(entry.work_date)}</td>
                <td>{entry.project_name}</td>
                <td style={{ fontWeight: 600 }}>{entry.km} km</td>
                <td style={{ color: 'var(--color-grey-700)', fontSize: '0.875rem' }}>{entry.note ?? '—'}</td>
                <td>
                  {entry.status === 'completed' ? (
                    <span className="badge" style={{ background: 'var(--color-green-50,#f0fdf4)', color: 'var(--color-green)', border: '1px solid currentColor' }}>
                      Completed
                    </span>
                  ) : (
                    <span className="badge" style={{ background: 'var(--color-amber-50,#fffbeb)', color: 'var(--color-amber-dark,#92660a)', border: '1px solid currentColor' }}>
                      Open
                    </span>
                  )}
                </td>
                <td>
                  {entry.status === 'open' && (
                    <button
                      className="btn-ghost btn-ghost-green"
                      disabled={completing === entry.id}
                      onClick={() => handleComplete(entry)}
                    >
                      {completing === entry.id ? 'Saving…' : 'Mark Complete'}
                    </button>
                  )}
                  {entry.status === 'completed' && (
                    <button
                      className="btn-ghost"
                      disabled={reopening === entry.id}
                      onClick={() => handleReopen(entry)}
                    >
                      {reopening === entry.id ? 'Saving…' : 'Reopen'}
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {!loading && entries.length > 0 && (
        <div style={{ marginTop: '0.5rem', fontSize: '0.875rem', color: 'var(--color-grey-700)', textAlign: 'right' }}>
          Total: <strong>{totalKm.toFixed(1)} km</strong>
        </div>
      )}
    </div>
  );
}
