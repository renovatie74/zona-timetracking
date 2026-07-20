import { useState } from 'react';

/**
 * Searchable checkbox list used by both:
 *   - Edit Project  → assign employees
 *   - Edit Employee → assign projects
 *
 * Props:
 *   items       [{id, name, sub, searchText}]  sub is shown below name in grey
 *   checkedIds  number[]
 *   onToggle    (id: number) => void
 *   placeholder string — search box placeholder
 *   countLabel  (n: number) => string — e.g. n => `${n} projects assigned`
 */
export function AssignmentChecklist({ items, checkedIds, onToggle, placeholder, countLabel }) {
  const [q, setQ] = useState('');
  const lq = q.trim().toLowerCase();

  const filtered = lq
    ? items.filter(i => i.searchText.includes(lq))
    : items;

  return (
    <div>
      <input
        className="form-input"
        placeholder={placeholder ?? 'Search…'}
        value={q}
        onChange={e => setQ(e.target.value)}
        style={{ marginBottom: '6px', fontSize: '0.875rem' }}
      />
      <div style={{
        maxHeight: 180, overflowY: 'auto',
        border: '1px solid var(--color-border)',
        borderRadius: 6, padding: '6px 0',
      }}>
        {filtered.length === 0 ? (
          <div style={{ padding: '8px 12px', color: 'var(--color-grey-600)', fontSize: '0.875rem' }}>
            {lq ? 'No matches.' : 'None available.'}
          </div>
        ) : filtered.map(item => {
          const checked = checkedIds.includes(item.id);
          return (
            <label key={item.id} style={{
              display: 'flex', alignItems: 'flex-start', gap: 10,
              padding: '6px 12px', cursor: 'pointer',
              background: checked ? 'rgba(200,164,106,0.06)' : undefined,
            }}>
              <input
                type="checkbox"
                checked={checked}
                onChange={() => onToggle(item.id)}
                style={{ marginTop: 2 }}
              />
              <span style={{ fontSize: '0.875rem', lineHeight: 1.4 }}>
                <span style={{ fontWeight: 500 }}>{item.name}</span>
                {item.sub && (
                  <span style={{ fontSize: '0.78rem', color: 'var(--color-grey-500)', marginLeft: 5 }}>
                    · {item.sub}
                  </span>
                )}
              </span>
            </label>
          );
        })}
      </div>
      <p style={{ fontSize: '0.8rem', color: 'var(--color-grey-500)', margin: '6px 0 0', minHeight: '1.2em' }}>
        {checkedIds.length > 0
          ? (countLabel ? countLabel(checkedIds.length) : `${checkedIds.length} selected`)
          : ''}
      </p>
    </div>
  );
}
