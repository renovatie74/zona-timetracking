import { useState, useEffect } from 'react';
import { createPortal }        from 'react-dom';
import EmployeeNav             from '../components/EmployeeNav.jsx';
import { getCurrentBusinessWeekStart } from '../lib/businessTime.js';
import { useTranslation }      from '../i18n/index.jsx';

function fetchJSON(path, opts = {}) {
  return fetch(path, { credentials: 'include', ...opts }).then(async r => {
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw Object.assign(new Error(data.error ?? 'Request failed'), { status: r.status });
    return data;
  });
}

function TypeBadge({ type }) {
  const { t } = useTranslation();
  const cls   = type === 'extra_work' ? 'ex-badge-work' : 'ex-badge-cost';
  const label = type === 'extra_work' ? t('extraWork') : t('ownCost');
  return <span className={`ex-type-badge ${cls}`}>{label}</span>;
}

function StatusBadge({ status }) {
  const { t } = useTranslation();
  const cls   = status === 'open' ? 'ex-status-open' : status === 'recorded' ? 'ex-status-recorded' : 'ex-status-processed';
  const label = status === 'open' ? t('open') : status === 'recorded' ? 'Recorded' : t('processed');
  return <span className={`ex-status-badge ${cls}`}>{label}</span>;
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function fmtDate(iso) {
  if (!iso) return '';
  const d = new Date(iso.length === 10 ? iso + 'T00:00:00' : iso);
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

// ── Project picker ────────────────────────────────────────────────────────────
function ProjectPicker({ projects, onSelect, onCancel }) {
  const { t } = useTranslation();
  const [query, setQuery] = useState('');

  const q = query.trim().toLowerCase();
  const filtered = q
    ? projects.filter(p =>
        p.name.toLowerCase().includes(q) ||
        (p.project_code ?? '').toLowerCase().includes(q)
      )
    : null;

  const recent = filtered ? [] : projects.filter(p => p.recent_rank != null).sort((a, b) => a.recent_rank - b.recent_rank);
  const rest   = filtered ? filtered : projects.filter(p => p.recent_rank == null);

  function renderRow(p) {
    return (
      <button key={p.id} className="em-project-btn" onClick={() => onSelect(p)}>
        <span className="em-project-name">{p.name}</span>
        {p.project_code && <span className="em-project-code">{p.project_code}</span>}
      </button>
    );
  }

  return (
    <div className="em-overlay" onClick={onCancel}>
      <div className="em-picker" onClick={e => e.stopPropagation()}>
        <div className="em-picker-header">
          <h2 className="em-picker-title">{t('selectProject')}</h2>
          <button className="em-btn-close" onClick={onCancel} aria-label="Cancel">✕</button>
        </div>
        <div className="em-search-wrap">
          <input
            className="em-search"
            type="search"
            placeholder={t('searchProject')}
            value={query}
            onChange={e => setQuery(e.target.value)}
            autoFocus
          />
        </div>
        <div className="em-project-list">
          {filtered ? (
            filtered.length === 0
              ? <p className="em-no-results">{t('noProjectsFound')}</p>
              : filtered.map(renderRow)
          ) : (
            <>
              {recent.length > 0 && (
                <>
                  <p className="em-section-label">{t('recent')}</p>
                  {recent.map(renderRow)}
                </>
              )}
              {rest.length > 0 && (
                <>
                  <p className="em-section-label">{t('allProjects')}</p>
                  {rest.map(renderRow)}
                </>
              )}
              {recent.length === 0 && rest.length === 0 && (
                <p className="em-no-results">{t('noAssignedProjects')}</p>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Extra form sheet ──────────────────────────────────────────────────────────
function ExtraFormSheet({ projects, initial, onSave, onCancel, busy }) {
  const { t } = useTranslation();
  const isEdit = !!initial;

  const [type,            setType]            = useState(initial?.type ?? 'own_cost');
  const [selectedProject, setSelectedProject] = useState(
    initial ? (projects.find(p => p.id === initial.project_id) ?? null) : null,
  );
  const [extraDate,    setExtraDate]    = useState(initial?.extra_date ?? todayISO());
  const [description,  setDescription]  = useState(initial?.description ?? '');
  const [picking,      setPicking]      = useState(false);
  const [formError,    setFormError]    = useState('');

  function handleSave() {
    if (!selectedProject) { setFormError(t('pleaseSelectProject')); return; }
    if (!extraDate)        { setFormError(t('dateRequired'));        return; }
    if (!description.trim()) { setFormError(t('descriptionRequired')); return; }
    setFormError('');
    onSave({
      id:          initial?.id,
      project_id:  selectedProject.id,
      type,
      extra_date:  extraDate,
      description: description.trim(),
    });
  }

  return createPortal(
    <>
      <div className="em-overlay" onClick={onCancel}>
        <div className="mt-form-sheet" onClick={e => e.stopPropagation()}>
          <div className="mt-form-header">
            <h2 className="mt-form-title">{isEdit ? t('editExtra') : t('addExtra')}</h2>
            <button className="em-btn-close" onClick={onCancel} aria-label="Cancel">✕</button>
          </div>

          {formError && (
            <div style={{ padding: '0 20px' }}>
              <p className="ex-form-error">{formError}</p>
            </div>
          )}

          {!isEdit && (
            <div className="mt-form-field" style={{ padding: '16px 20px 0' }}>
              <label className="mt-form-label">{t('type')} *</label>
              <select
                className="ex-form-select"
                value={type}
                onChange={e => { setType(e.target.value); setFormError(''); }}
              >
                <option value="own_cost">{t('ownCost')}</option>
              </select>
            </div>
          )}

          <div className="mt-form-field" style={{ padding: '12px 20px 0' }}>
            <label className="mt-form-label">{t('project')} *</label>
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
                <span className="mt-project-placeholder">{t('selectProjectPlaceholder')}</span>
              )}
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                <path d="M4 6l4 4 4-4" stroke="var(--color-grey-500)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>
          </div>

          <div className="mt-form-field" style={{ padding: '12px 20px 0' }}>
            <label className="mt-form-label">{t('date')} *</label>
            <input
              type="date"
              className="ex-form-select"
              style={{ boxSizing: 'border-box' }}
              value={extraDate}
              max={todayISO()}
              onChange={e => { setExtraDate(e.target.value); setFormError(''); }}
            />
          </div>

          <div className="mt-form-field" style={{ padding: '12px 20px 0' }}>
            <label className="mt-form-label">{t('description')} *</label>
            <textarea
              className="ex-description-input"
              placeholder={t('descriptionPlaceholder')}
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
            {busy ? t('saving') : isEdit ? t('saveChanges') : t('addExtra')}
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
  const { t } = useTranslation();
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

  async function handleSave({ id, project_id, type, extra_date, description }) {
    setBusy(true);
    try {
      if (id) {
        await fetchJSON(`/api/extras/mine/${id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ project_id, type, extra_date, description }),
        });
      } else {
        await fetchJSON('/api/extras/mine', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ project_id, type, extra_date, description }),
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
          <h1 className="ex-title">{t('extras')}</h1>
          <button className="ex-add-btn" onClick={() => setForm({})}>{t('add')}</button>
        </div>

        {/* Status filter tabs */}
        <div className="ex-filter-tabs">
          {[['', t('all')], ['open', t('open')], ['processed', t('processed')]].map(([val, label]) => (
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
            <div className="ex-empty">{t('loading')}</div>
          ) : extras.length === 0 ? (
            <div className="ex-empty">{t('noExtras')}</div>
          ) : (
            extras.map(ex => {
              const canEdit   = ex.status === 'open';
              const canDelete = ex.status === 'open';

              return (
                <div key={ex.id} className="ex-card">
                  <div className="ex-card-top">
                    <TypeBadge type={ex.type} />
                    <StatusBadge status={ex.status} />
                    <span className="ex-card-date">{fmtDate(ex.extra_date ?? ex.created_at)}</span>
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
            <h3 className="ex-confirm-title">{t('deleteExtra')}</h3>
            <p className="ex-confirm-body">{t('cannotBeUndone')}</p>
            <div className="ex-confirm-actions">
              <button className="ex-confirm-cancel" onClick={() => setDeleteId(null)}>{t('cancel')}</button>
              <button className="ex-confirm-delete" onClick={() => handleDelete(deleteId)} disabled={busy}>
                {busy ? t('deleting') : t('delete')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
