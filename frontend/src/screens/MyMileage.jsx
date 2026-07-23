import { useState, useEffect, useCallback } from 'react';
import { createPortal }  from 'react-dom';
import EmployeeNav       from '../components/EmployeeNav.jsx';
import { getCurrentBusinessWeekStart } from '../lib/businessTime.js';
import { useTranslation } from '../i18n/index.jsx';

function addWeeks(dateStr, n) {
  const d = new Date(dateStr + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n * 7);
  return d.toISOString().slice(0, 10);
}

function fmtWeekLabel(weekStart, months) {
  const d   = new Date(weekStart + 'T00:00:00Z');
  const end = new Date(weekStart + 'T00:00:00Z');
  end.setUTCDate(d.getUTCDate() + 6);
  return `${months[d.getUTCMonth()]} ${d.getUTCDate()} – ${months[end.getUTCMonth()]} ${end.getUTCDate()}, ${end.getUTCFullYear()}`;
}

function fmtDate(iso, months) {
  if (!iso) return '';
  const d = new Date(iso + 'T00:00:00Z');
  return `${months[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}`;
}

function isCurrentWeekStart(weekStart) {
  return weekStart === getCurrentBusinessWeekStart();
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

// ── Mileage entry form sheet ──────────────────────────────────────────────────
function MileageFormSheet({ projects, initial, weekStart, onSave, onCancel, busy }) {
  const { t } = useTranslation();
  const isEdit = !!initial;

  const [workDate, setWorkDate] = useState(initial?.work_date ?? weekStart);
  const [project,  setProject]  = useState(
    initial ? (projects.find(p => p.id === initial.project_id) ?? null) : null,
  );
  const [km,       setKm]       = useState(initial?.km != null ? String(initial.km) : '');
  const [note,     setNote]     = useState(initial?.note ?? '');
  const [picking,  setPicking]  = useState(false);
  const [err,      setErr]      = useState('');

  function handleSave() {
    if (!workDate) { setErr(t('dateRequired'));   return; }
    if (!project)  { setErr(t('projectRequired')); return; }
    const n = Number(km);
    if (!km || !isFinite(n) || n <= 0) { setErr(t('validKm')); return; }
    setErr('');
    onSave({ work_date: workDate, project_id: project.id, km: n, note: note.trim() || null });
  }

  return createPortal(
    <>
      <div className="em-overlay" onClick={onCancel}>
        <div className="mt-form-sheet" onClick={e => e.stopPropagation()}>
          <div className="mt-form-header">
            <h2 className="mt-form-title">{isEdit ? t('editMileage') : t('addMileage')}</h2>
            <button className="em-btn-close" onClick={onCancel} aria-label="Cancel">✕</button>
          </div>

          {err && <div className="mt-form-error" style={{ padding: '0 20px 4px' }}>{err}</div>}

          <div className="mt-form-field" style={{ padding: '12px 20px 0' }}>
            <label className="mt-form-label">{t('date')} *</label>
            <input
              type="date"
              className="form-input"
              value={workDate}
              onChange={e => setWorkDate(e.target.value)}
            />
          </div>

          <div className="mt-form-field" style={{ padding: '12px 20px 0' }}>
            <label className="mt-form-label">{t('project')} *</label>
            <button
              className="mt-project-select-btn"
              type="button"
              onClick={() => setPicking(true)}
            >
              {project ? (
                <span style={{ fontWeight: 500, color: 'var(--color-charcoal)' }}>
                  {project.name}
                  {project.project_code && (
                    <span style={{ marginLeft: 6, fontSize: '0.8125rem', color: 'var(--color-grey-600)' }}>
                      {project.project_code}
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
            <label className="mt-form-label">{t('kilometers')} *</label>
            <input
              className="mt-time-input"
              type="text"
              inputMode="decimal"
              placeholder={t('kmPlaceholder')}
              value={km}
              onChange={e => setKm(e.target.value)}
            />
          </div>

          <div className="mt-form-field" style={{ padding: '12px 20px 0' }}>
            <label className="mt-form-label">
              {t('note')} <span className="mt-optional">({t('optional')})</span>
            </label>
            <input
              className="mt-notes-input"
              type="text"
              placeholder={t('briefNote')}
              value={note}
              onChange={e => setNote(e.target.value)}
              maxLength={200}
            />
          </div>

          <button
            className="mt-save-btn"
            onClick={handleSave}
            disabled={busy}
            style={{ marginBottom: 8 }}
          >
            {busy ? t('saving') : isEdit ? t('saveChanges') : t('addMileage')}
          </button>
        </div>
      </div>

      {picking && (
        <ProjectPicker
          projects={projects}
          onSelect={p => { setProject(p); setPicking(false); }}
          onCancel={() => setPicking(false)}
        />
      )}
    </>,
    document.body,
  );
}

// ── Delete confirm ────────────────────────────────────────────────────────────
function DeleteConfirm({ onConfirm, onCancel, busy }) {
  const { t } = useTranslation();
  return (
    <div className="em-overlay" onClick={onCancel}>
      <div className="ex-confirm-sheet" onClick={e => e.stopPropagation()}>
        <h3 className="ex-confirm-title">{t('deleteMileageConfirm')}</h3>
        <p className="ex-confirm-body">{t('cannotBeUndone')}</p>
        <div className="ex-confirm-actions">
          <button className="ex-confirm-cancel" onClick={onCancel}>{t('cancel')}</button>
          <button className="ex-confirm-delete" onClick={onConfirm} disabled={busy}>
            {busy ? t('deleting') : t('delete')}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Status badge ──────────────────────────────────────────────────────────────
function StatusBadge({ status }) {
  const { t } = useTranslation();
  const style = status === 'completed'
    ? { background: 'var(--color-green-50,#f0fdf4)', color: 'var(--color-green)', border: '1px solid currentColor' }
    : { background: 'var(--color-amber-50,#fffbeb)', color: 'var(--color-amber-dark,#92660a)', border: '1px solid currentColor' };
  return (
    <span className="badge" style={style}>
      {status === 'completed' ? t('completed') : t('open')}
    </span>
  );
}

// ── Main screen ───────────────────────────────────────────────────────────────
export default function MyMileage() {
  const { t } = useTranslation();
  const months = t('months');
  const CUR_WEEK = getCurrentBusinessWeekStart();

  const [weekStart,    setWeekStart]    = useState(CUR_WEEK);
  const [statusFilter, setStatusFilter] = useState('all');
  const [entries,      setEntries]      = useState([]);
  const [projects,     setProjects]     = useState([]);
  const [loading,      setLoading]      = useState(true);
  const [error,        setError]        = useState('');
  const [form,         setForm]         = useState(null);
  const [deleteId,     setDeleteId]     = useState(null);
  const [busy,         setBusy]         = useState(false);

  useEffect(() => {
    fetch('/api/projects/mine', { credentials: 'include' })
      .then(r => r.ok ? r.json() : null)
      .then(j => { if (j) setProjects(j?.data ?? j ?? []); })
      .catch(() => {});
  }, []);

  const load = useCallback(async (ws, sf) => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({ week: ws });
      if (sf !== 'all') params.set('status', sf);
      const r = await fetch(`/api/my-mileage?${params}`, { credentials: 'include' });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? 'Failed to load');
      setEntries(j.data ?? []);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(weekStart, statusFilter); }, [load, weekStart, statusFilter]);

  useEffect(() => {
    function onKey(e) {
      if (e.key !== 'Escape') return;
      if (deleteId !== null) { setDeleteId(null); return; }
      if (form !== null)     { setForm(null);     return; }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [deleteId, form]);

  function goWeek(delta) {
    const ws = addWeeks(weekStart, delta);
    setWeekStart(ws);
  }

  async function handleSave(payload) {
    setBusy(true);
    setError('');
    try {
      const isEdit = !!form?.initial;
      const url    = isEdit ? `/api/my-mileage/${form.initial.id}` : '/api/my-mileage';
      const method = isEdit ? 'PUT' : 'POST';
      const r = await fetch(url, {
        method,
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? 'Save failed');
      setForm(null);
      load(weekStart, statusFilter);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete(id) {
    setBusy(true);
    setError('');
    try {
      const r = await fetch(`/api/my-mileage/${id}`, { method: 'DELETE', credentials: 'include' });
      if (!r.ok) { const j = await r.json(); throw new Error(j.error ?? 'Delete failed'); }
      setDeleteId(null);
      load(weekStart, statusFilter);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  const totalKm = entries.reduce((s, e) => s + e.km, 0);

  return (
    <div className="mt-root">
      <div className="mt-screen">
        {/* Header */}
        <div className="ex-header">
          <h1 className="ex-title">{t('mileage')}</h1>
          <button className="ex-add-btn" onClick={() => setForm({})}>{t('add')}</button>
        </div>

        {/* Week navigation */}
        <div className="mt-week-nav" style={{ marginBottom: '0.75rem' }}>
          <button className="mt-week-arrow" onClick={() => goWeek(-1)} aria-label="Previous week">‹</button>
          <div style={{ textAlign: 'center' }}>
            <span className="mt-week-range">{fmtWeekLabel(weekStart, months)}</span>
            {isCurrentWeekStart(weekStart)
              ? <span className="mt-week-current-chip">{t('current')}</span>
              : <button className="mt-week-today-btn" onClick={() => setWeekStart(CUR_WEEK)}>{t('currentWeek')}</button>
            }
          </div>
          <button className="mt-week-arrow" onClick={() => goWeek(1)} aria-label="Next week">›</button>
        </div>

        {/* Status filter tabs */}
        <div className="ex-filter-tabs" style={{ marginBottom: '0.75rem' }}>
          {[['all', t('all')], ['open', t('open')], ['completed', t('completed')]].map(([val, label]) => (
            <button
              key={val}
              className={`filter-pill${statusFilter === val ? ' filter-pill-active' : ''}`}
              onClick={() => setStatusFilter(val)}
            >
              {label}
            </button>
          ))}
        </div>

        {error && <div className="ex-error-banner">{error}</div>}

        {/* Entry list */}
        <div className="ex-list">
          {loading ? (
            <div className="ex-empty">{t('loading')}</div>
          ) : entries.length === 0 ? (
            <div className="ex-empty">{t('noMileageEntries')}</div>
          ) : (
            entries.map(entry => (
              <div key={entry.id} className="ex-card">
                <div className="ex-card-top">
                  <span className="ex-card-date">{fmtDate(entry.work_date, months)}</span>
                  <StatusBadge status={entry.status} />
                </div>
                <div className="ex-card-project">{entry.project_name}</div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.5rem', marginTop: '0.25rem' }}>
                  <strong style={{ fontSize: '1.125rem', fontWeight: 700 }}>{entry.km} km</strong>
                  {entry.note && (
                    <span className="ex-card-description" style={{ fontSize: '0.875rem' }}>{entry.note}</span>
                  )}
                </div>
                {entry.status === 'open' && (
                  <div className="ex-card-actions">
                    <button
                      className="mt-action-btn"
                      onClick={() => setForm({ initial: entry })}
                      aria-label="Edit"
                    >
                      <svg width="15" height="15" viewBox="0 0 15 15" fill="none" aria-hidden="true">
                        <path d="M10.5 2L13 4.5L5 12.5H2.5V10L10.5 2Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
                      </svg>
                    </button>
                    <button
                      className="mt-action-btn mt-action-delete"
                      onClick={() => setDeleteId(entry.id)}
                      aria-label="Delete"
                    >
                      <svg width="15" height="15" viewBox="0 0 15 15" fill="none" aria-hidden="true">
                        <path d="M2 4h11M5 4V2.5h5V4M6 7v5M9 7v5M3.5 4l.8 8.5h7.4L12.5 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    </button>
                  </div>
                )}
              </div>
            ))
          )}
        </div>

        {/* Week total */}
        {!loading && entries.length > 0 && (
          <div className="mt-week-total" style={{ marginTop: '0.75rem' }}>
            <span>{t('totalThisWeek')}</span>
            <strong>{totalKm} km</strong>
          </div>
        )}
      </div>

      <EmployeeNav />

      {form !== null && (
        <MileageFormSheet
          projects={projects}
          initial={form.initial ?? null}
          weekStart={weekStart}
          onSave={handleSave}
          onCancel={() => setForm(null)}
          busy={busy}
        />
      )}

      {deleteId !== null && (
        <DeleteConfirm
          onConfirm={() => handleDelete(deleteId)}
          onCancel={() => setDeleteId(null)}
          busy={busy}
        />
      )}
    </div>
  );
}
