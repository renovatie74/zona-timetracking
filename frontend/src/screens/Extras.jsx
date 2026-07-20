import { useState, useEffect }         from 'react';
import { createPortal }                from 'react-dom';
import EmployeeNav                     from '../components/EmployeeNav.jsx';
import { getCurrentBusinessWeekStart } from '../lib/businessTime.js';

function fetchJSON(path, opts = {}) {
  return fetch(path, { credentials: 'include', ...opts }).then(async r => {
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw Object.assign(new Error(data.error ?? 'Request failed'), { status: r.status });
    return data;
  });
}

const TYPE_LABELS = { extra_work: 'Extra Work', own_cost: 'Own Cost' };

function TypeBadge({ type }) {
  const cls = type === 'extra_work' ? 'ex-badge-work' : 'ex-badge-cost';
  return <span className={`ex-type-badge ${cls}`}>{TYPE_LABELS[type] ?? type}</span>;
}

function StatusBadge({ status }) {
  const cls   = status === 'open' ? 'ex-status-open' : status === 'recorded' ? 'ex-status-recorded' : 'ex-status-processed';
  const label = status === 'open' ? 'Open' : status === 'recorded' ? 'Recorded' : 'Processed';
  return <span className={`ex-status-badge ${cls}`}>{label}</span>;
}

function fmtDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

// ── Project picker ────────────────────────────────────────────────────────────
function ProjectPicker({ projects, onSelect, onCancel }) {
  const recent = projects.filter(p => p.recent_rank != null).sort((a, b) => a.recent_rank - b.recent_rank);
  const rest   = projects.filter(p => p.recent_rank == null);

  return (
    <div className="em-overlay" onClick={onCancel}>
      <div className="em-picker" onClick={e => e.stopPropagation()}>
        <div className="em-picker-header">
          <h2 className="em-picker-title">Select Project</h2>
          <button className="em-btn-close" onClick={onCancel} aria-label="Cancel">✕</button>
        </div>
        <div className="em-project-list">
          {recent.length > 0 && (
            <>
              <p className="em-section-label">Recent</p>
              {recent.map(p => (
                <button key={p.id} className="em-project-btn" onClick={() => onSelect(p)}>
                  <span className="em-project-name">{p.name}</span>
                  {p.project_code && <span className="em-project-code">{p.project_code}</span>}
                </button>
              ))}
            </>
          )}
          {rest.length > 0 && (
            <>
              <p className="em-section-label">All Projects</p>
              {rest.map(p => (
                <button key={p.id} className="em-project-btn" onClick={() => onSelect(p)}>
                  <span className="em-project-name">{p.name}</span>
                  {p.project_code && <span className="em-project-code">{p.project_code}</span>}
                </button>
              ))}
            </>
          )}
          {recent.length === 0 && rest.length === 0 && (
            <p className="em-no-results">No assigned projects found</p>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Extra form sheet ──────────────────────────────────────────────────────────
function ExtraFormSheet({ projects, initial, onSave, onCancel, busy }) {
  const isEdit = !!initial;

  const [type,            setType]            = useState(initial?.type ?? 'own_cost');
  const [selectedProject, setSelectedProject] = useState(
    initial ? (projects.find(p => p.id === initial.project_id) ?? null) : null,
  );
  const [description, setDescription] = useState(initial?.description ?? '');
  const [picking,   setPicking]   = useState(false);
  const [formError, setFormError] = useState('');

  function handleSave() {
    if (!selectedProject) { setFormError('Please select a project.'); return; }
    if (!description.trim()) { setFormError('Description is required.'); return; }
    setFormError('');
    onSave({
      id:          initial?.id,
      project_id:  selectedProject.id,
      type,
      description: description.trim(),
    });
  }

  return createPortal(
    <>
      <div className="em-overlay" onClick={onCancel}>
        <div className="mt-form-sheet" onClick={e => e.stopPropagation()}>
          <div className="mt-form-header">
            <h2 className="mt-form-title">{isEdit ? 'Edit Extra' : 'Add Extra'}</h2>
            <button className="em-btn-close" onClick={onCancel} aria-label="Cancel">✕</button>
          </div>

          {formError && (
            <div style={{ padding: '0 20px' }}>
              <p className="ex-form-error">{formError}</p>
            </div>
          )}

          {!isEdit && (
            <div className="mt-form-field" style={{ padding: '16px 20px 0' }}>
              <label className="mt-form-label">Type *</label>
              <select
                className="ex-form-select"
                value={type}
                onChange={e => { setType(e.target.value); setFormError(''); }}
              >
                <option value="own_cost">Own Cost</option>
              </select>
            </div>
          )}

          <div className="mt-form-field" style={{ padding: '12px 20px 0' }}>
            <label className="mt-form-label">Project *</label>
            <button
              className="mt-project-select-btn"
              type="button"
              onClick={() => setPicking(true)}
            >
              {selectedProject ? (
                <span style={{ fontWeight: 500, color: 'var(--color-charcoal)' }}>
                  {selectedProject.name}
                  {selectedProject.project_code && (
                    <span style={{ marginLeft: 6, fontSize: '0.8125rem', color: 'var(--color-grey-600)' }}>
                      {selectedProject.project_code}
                    </span>
                  )}
                </span>
              ) : (
                <span className="mt-project-placeholder">Select project…</span>
              )}
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                <path d="M4 6l4 4 4-4" stroke="var(--color-grey-500)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>
          </div>

          <div className="mt-form-field" style={{ padding: '12px 20px 0' }}>
            <label className="mt-form-label">Description *</label>
            <textarea
              className="ex-description-input"
              placeholder="Describe the extra work or cost…"
              value={description}
              rows={4}
              onChange={e => setDescription(e.target.value)}
            />
          </div>

          <button
            className="mt-save-btn"
            onClick={handleSave}
            disabled={busy}
            style={{ marginBottom: 8 }}
          >
            {busy ? 'Saving…' : isEdit ? 'Save Changes' : 'Add Extra'}
          </button>
        </div>
      </div>

      {picking && (
        <ProjectPicker
          projects={projects}
          onSelect={p => { setSelectedProject(p); setPicking(false); }}
          onCancel={() => setPicking(false)}
        />
      )}
    </>,
    document.body
  );
}

// ── Main screen ───────────────────────────────────────────────────────────────
export default function Extras() {
  const [extras,       setExtras]       = useState([]);
  const [projects,     setProjects]     = useState([]);
  const [statusFilter, setStatusFilter] = useState('');   // '' = all
  const [loading,      setLoading]      = useState(true);
  const [error,        setError]        = useState('');
  const [form,         setForm]         = useState(null); // null | { initial? }
  const [busy,         setBusy]         = useState(false);
  const [deleteId,     setDeleteId]     = useState(null);

  const CUR_WEEK = getCurrentBusinessWeekStart();

  useEffect(() => {
    loadProjects();
    loadExtras('');
  }, []); // eslint-disable-line

  useEffect(() => {
    function onKey(e) {
      if (e.key !== 'Escape') return;
      if (deleteId !== null) { setDeleteId(null); return; }
      if (form !== null)     { setForm(null);     return; }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [deleteId, form]);

  async function loadProjects() {
    try {
      const data = await fetchJSON('/api/projects/mine');
      setProjects(Array.isArray(data) ? data : (data?.data ?? []));
    } catch { /* non-critical */ }
  }

  async function loadExtras(sf) {
    setLoading(true);
    setError('');
    try {
      const qs  = sf ? `?status=${sf}` : '';
      const data = await fetchJSON(`/api/extras/mine${qs}`);
      setExtras(data?.data ?? []);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  function handleFilterChange(sf) {
    setStatusFilter(sf);
    loadExtras(sf);
  }

  async function handleSave({ id, project_id, type, description }) {
    setBusy(true);
    try {
      if (id) {
        await fetchJSON(`/api/extras/mine/${id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ project_id, type, description }),
        });
      } else {
        await fetchJSON('/api/extras/mine', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ project_id, type, description }),
        });
      }
      setForm(null);
      loadExtras(statusFilter);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete(id) {
    setBusy(true);
    try {
      await fetchJSON(`/api/extras/mine/${id}`, { method: 'DELETE' });
      setDeleteId(null);
      loadExtras(statusFilter);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-root">
      <div className="mt-screen">
        {/* Header */}
        <div className="ex-header">
          <h1 className="ex-title">Extras</h1>
          <button className="ex-add-btn" onClick={() => setForm({})}>+ Add</button>
        </div>

        {/* Status filter tabs */}
        <div className="ex-filter-tabs">
          {[['', 'All'], ['open', 'Open'], ['processed', 'Processed']].map(([val, label]) => (
            <button
              key={val}
              className={`filter-pill${statusFilter === val ? ' filter-pill-active' : ''}`}
              onClick={() => handleFilterChange(val)}
            >
              {label}
            </button>
          ))}
        </div>

        {error && <div className="ex-error-banner">{error}</div>}

        {/* Extras list */}
        <div className="ex-list">
          {loading ? (
            <div className="ex-empty">Loading…</div>
          ) : extras.length === 0 ? (
            <div className="ex-empty">No extras yet. Tap + Add to create one.</div>
          ) : (
            extras.map(ex => {
              const canEdit   = ex.status === 'open';
              const canDelete = ex.status === 'open';

              return (
                <div key={ex.id} className="ex-card">
                  <div className="ex-card-top">
                    <TypeBadge type={ex.type} />
                    <StatusBadge status={ex.status} />
                    <span className="ex-card-date">{fmtDate(ex.created_at)}</span>
                  </div>
                  <div className="ex-card-project">{ex.project_name}</div>
                  <div className="ex-card-description">{ex.description}</div>

                  {(canEdit || canDelete) && (
                    <div className="ex-card-actions">
                      {canEdit && (
                        <button
                          className="mt-action-btn"
                          onClick={() => setForm({ initial: ex })}
                          aria-label="Edit extra"
                        >
                          <svg width="15" height="15" viewBox="0 0 15 15" fill="none" aria-hidden="true">
                            <path d="M10.5 2L13 4.5L5 12.5H2.5V10L10.5 2Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
                          </svg>
                        </button>
                      )}
                      {canDelete && (
                        <button
                          className="mt-action-btn mt-action-delete"
                          onClick={() => setDeleteId(ex.id)}
                          aria-label="Delete extra"
                        >
                          <svg width="15" height="15" viewBox="0 0 15 15" fill="none" aria-hidden="true">
                            <path d="M2 4h11M5 4V2.5h5V4M6 7v5M9 7v5M3.5 4l.8 8.5h7.4L12.5 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                          </svg>
                        </button>
                      )}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>

      <EmployeeNav />

      {/* Add/Edit form */}
      {form && (
        <ExtraFormSheet
          projects={projects}
          initial={form.initial ?? null}
          onSave={handleSave}
          onCancel={() => setForm(null)}
          busy={busy}
        />
      )}

      {/* Delete confirmation */}
      {deleteId && (
        <div className="em-overlay" onClick={() => setDeleteId(null)}>
          <div className="ex-confirm-sheet" onClick={e => e.stopPropagation()}>
            <h3 className="ex-confirm-title">Delete Extra?</h3>
            <p className="ex-confirm-body">This cannot be undone.</p>
            <div className="ex-confirm-actions">
              <button className="ex-confirm-cancel" onClick={() => setDeleteId(null)}>Cancel</button>
              <button className="ex-confirm-delete" onClick={() => handleDelete(deleteId)} disabled={busy}>
                {busy ? 'Deleting…' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
