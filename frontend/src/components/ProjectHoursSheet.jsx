import { useState }     from 'react';
import { createPortal } from 'react-dom';
import { allocationSummary } from '../lib/allocationSummary.js';
import { minsToLabel }       from '../lib/timeUtils.js';
import { useTranslation }    from '../i18n/index.jsx';

export const DURATION_SLOTS = [30,60,90,120,150,180,210,240,270,300,330,360,390,420,450,480];

export function slotLabel(m) {
  const h = m / 60;
  return Number.isInteger(h) ? `${h}h` : `${h.toFixed(1)}h`;
}

function fmtDate(iso, days, months) {
  if (!iso) return '';
  const d = new Date(iso + 'T00:00:00Z');
  return `${days[d.getUTCDay()]}, ${months[d.getUTCMonth()]} ${d.getUTCDate()}`;
}

export function ProjectPicker({ projects, onSelect, onCancel }) {
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

// date              — ISO date string for the work day
// projects          — array of available projects
// existing          — existing project-hours record when editing (null for new)
// attendanceMinutes — attendance duration for allocation summary (0 = hide summary)
// projectHours      — all project-hour entries for this day (for allocation math)
// onSave({ project_id, hours_minutes, note }) — called when user submits
// onCancel          — called to close without saving
// busy              — disable save button while parent is saving
export function ProjectHoursSheet({ date, projects, existing, attendanceMinutes, projectHours, onSave, onCancel, busy }) {
  const { t } = useTranslation();
  const isEdit = !!existing;

  const [project,  setProject]  = useState(
    existing ? projects.find(p => p.id === existing.project_id) ?? null : null
  );
  const [slotMins, setSlotMins] = useState(
    existing ? (DURATION_SLOTS.includes(existing.hours_minutes) ? existing.hours_minutes : 60) : 60
  );
  const [note,    setNote]    = useState(existing?.note ?? '');
  const [picking, setPicking] = useState(false);
  const [err,     setErr]     = useState('');

  function handleSave() {
    if (!project) { setErr(t('pleaseSelectProject')); return; }
    setErr('');
    onSave({ project_id: project.id, hours_minutes: slotMins, note: note || null });
  }

  const days   = t('days');
  const months = t('months');

  return createPortal(
    <>
      <div className="em-overlay" onClick={onCancel}>
        <div className="mt-form-sheet" onClick={e => e.stopPropagation()}>
          <div className="mt-form-header">
            <h2 className="mt-form-title">{isEdit ? t('editHours') : t('addProjectHours')}</h2>
            <button className="em-btn-close" onClick={onCancel} aria-label="Cancel">✕</button>
          </div>

          <div className="mt-form-date">{fmtDate(date, days, months)}</div>

          {err && <div className="mt-form-error">{err}</div>}

          {/* Project selector */}
          <div className="mt-form-field">
            <label className="mt-form-label">{t('project')}</label>
            <button className="mt-project-select-btn" onClick={() => setPicking(true)}>
              {project
                ? <><span className="em-project-name">{project.name}</span>{project.project_code && <span className="em-project-code">{project.project_code}</span>}</>
                : <span className="mt-project-placeholder">{t('tapToSelect')}</span>}
            </button>
          </div>

          {/* Duration chips + stepper */}
          <div className="mt-form-field">
            <label className="mt-form-label">{t('duration')}</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', marginTop: '0.25rem' }}>
              {DURATION_SLOTS.map(m => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setSlotMins(m)}
                  style={{
                    padding: '0.35rem 0.65rem',
                    borderRadius: '6px',
                    fontSize: '0.875rem',
                    fontWeight: slotMins === m ? 700 : 400,
                    border: `2px solid ${slotMins === m ? 'var(--color-amber, #c8a46a)' : 'var(--color-border)'}`,
                    background: slotMins === m ? 'var(--color-amber-light, #fdf3e0)' : 'transparent',
                    color: slotMins === m ? 'var(--color-amber-dark, #92660a)' : 'var(--color-text)',
                    cursor: 'pointer',
                    transition: 'all 0.1s',
                  }}
                >
                  {slotLabel(m)}
                </button>
              ))}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.5rem' }}>
              <button
                type="button"
                className="btn-step"
                onClick={() => setSlotMins(m => Math.max(30, m - 30))}
                disabled={slotMins <= 30}
              >−</button>
              <span style={{ minWidth: '3.5rem', textAlign: 'center', fontWeight: 600, fontSize: '0.9375rem' }}>
                {slotLabel(slotMins)}
              </span>
              <button
                type="button"
                className="btn-step"
                onClick={() => setSlotMins(m => Math.min(720, m + 30))}
                disabled={slotMins >= 720}
              >+</button>
            </div>
          </div>

          {/* Allocation summary */}
          {attendanceMinutes > 0 && (() => {
            const s = allocationSummary(attendanceMinutes, projectHours, existing?.id ?? null, slotMins);
            return (
              <div className="ph-alloc-summary">
                <div className="ph-alloc-row">
                  <span className="ph-alloc-label">{t('attendance')}</span>
                  <span className="ph-alloc-value">{minsToLabel(s.attendanceMinutes)}</span>
                </div>
                {s.alreadyAllocated > 0 && (
                  <div className="ph-alloc-row">
                    <span className="ph-alloc-label">{t('alreadyAllocated')}</span>
                    <span className="ph-alloc-value">{minsToLabel(s.alreadyAllocated)}</span>
                  </div>
                )}
                <div className="ph-alloc-row">
                  <span className="ph-alloc-label">{t('currentlyAdding')}</span>
                  <span className="ph-alloc-value">{minsToLabel(s.currentlyAdding)}</span>
                </div>
                <div className="ph-alloc-row ph-alloc-row--divider">
                  <span className={s.isOver ? 'ph-alloc-label ph-alloc-over' : 'ph-alloc-label'}>
                    {s.isOver ? t('overAllocated') : t('unallocated')}
                  </span>
                  <span className={s.isOver ? 'ph-alloc-value ph-alloc-over' : 'ph-alloc-value'}>
                    {minsToLabel(s.isOver ? s.overAllocated : s.unallocated)}
                  </span>
                </div>
              </div>
            );
          })()}

          {/* Note */}
          <div className="mt-form-field">
            <label className="mt-form-label" htmlFor="ph-note">
              {t('note')} <span className="mt-optional">({t('optional')})</span>
            </label>
            <input
              id="ph-note"
              className="mt-notes-input"
              type="text"
              placeholder={t('briefNote')}
              value={note}
              onChange={e => setNote(e.target.value)}
              maxLength={200}
            />
          </div>

          <button className="mt-save-btn" onClick={handleSave} disabled={busy}>
            {busy ? t('saving') : isEdit ? t('saveChanges') : t('addHours')}
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
    document.body
  );
}
