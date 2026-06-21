/**
 * Append-only audit log writer.
 * Call writeAudit() from any route that mutates data.
 * Failures are logged but never thrown — audit must not break the main operation.
 */

export async function writeAudit(db, {
  actorId,     // userId | null (null = system/cron)
  action,      // 'created' | 'updated' | 'deleted' | 'status_changed' | 'login' | ...
  entityType,  // 'time_entry' | 'project' | 'user' | 'project_note'
  entityId,    // integer | null
  oldValues,   // object | null
  newValues,   // object | null
  ipAddress,   // string | null
}) {
  try {
    await db.prepare(
      `INSERT INTO AuditLog
         (actor_id, action, entity_type, entity_id, old_values, new_values, ip_address, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      actorId    ?? null,
      action,
      entityType,
      entityId   ?? null,
      oldValues  ? JSON.stringify(oldValues) : null,
      newValues  ? JSON.stringify(newValues) : null,
      ipAddress  ?? null,
      new Date().toISOString(),
    ).run();
  } catch (err) {
    console.error('Audit write failed:', err.message, { action, entityType, entityId });
  }
}
