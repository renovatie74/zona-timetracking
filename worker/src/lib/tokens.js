/**
 * Short-lived token generation for invitation and password-reset flows.
 * 48 hex characters (24 random bytes via crypto.getRandomValues).
 */

function randomHex(bytes) {
  const buf = crypto.getRandomValues(new Uint8Array(bytes));
  return Array.from(buf, b => b.toString(16).padStart(2, '0')).join('');
}

export function generateInvitationToken() {
  return randomHex(24);  // 48 hex chars; 72-hour TTL (set by caller)
}

export function generateResetToken() {
  return randomHex(24);  // 48 hex chars; 1-hour TTL (set by caller)
}

export function invitationExpiry() {
  return new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString();
}

export function resetExpiry() {
  return new Date(Date.now() + 1 * 60 * 60 * 1000).toISOString();
}
