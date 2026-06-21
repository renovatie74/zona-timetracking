/**
 * Atomic sequence generation for auto-coded records (E-NNN, P-NNN).
 *
 * Uses Option B: single UPDATE + RETURNING to avoid any read-then-write race.
 *
 *   UPDATE t SET next_seq = next_seq + 1 WHERE id = 1 RETURNING next_seq - 1 AS seq
 *
 * Trace for the first call (next_seq starts at 1):
 *   1. next_seq increments: 1 → 2
 *   2. RETURNING returns: 2 - 1 = 1
 *   3. Formatted code: E-001 / P-001  ✓
 *
 * Trace for the second call (next_seq is now 2):
 *   1. next_seq increments: 2 → 3
 *   2. RETURNING returns: 3 - 1 = 2
 *   3. Formatted code: E-002 / P-002  ✓
 */

async function claimSequence(db, tableName) {
  const row = await db
    .prepare(
      `UPDATE ${tableName}
          SET next_seq = next_seq + 1
        WHERE id = 1
       RETURNING next_seq - 1 AS seq`
    )
    .first();

  if (!row) {
    throw new Error(`Sequence table "${tableName}" is not initialised`);
  }

  return row.seq;
}

export async function nextEmployeeCode(db) {
  const seq = await claimSequence(db, 'EmployeeCodeSequence');
  return {
    employee_number: `E-${String(seq).padStart(3, '0')}`,
    seq,
  };
}

export async function nextProjectCode(db) {
  const seq = await claimSequence(db, 'ProjectCodeSequence');
  return {
    project_code: `P-${String(seq).padStart(3, '0')}`,
    seq,
  };
}

export async function nextClientCode(db) {
  const seq = await claimSequence(db, 'ClientCodeSequence');
  return {
    client_code: `C-${String(seq).padStart(3, '0')}`,
    seq,
  };
}
