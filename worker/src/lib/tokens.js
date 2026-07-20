/**
 * Token generation and hashing for invitation and password-reset flows.
 * Tokens are generated as random hex strings.
 * Only the SHA-256 hash is stored in the database; the raw token travels in the URL.
 */

function randomHex(bytes) {
  const buf = crypto.getRandomValues(new Uint8Array(bytes));
  return Array.from(buf, b => b.toString(16).padStart(2, '0')).join('');
}

export function generateInvitationToken() {
  return randomHex(24);  // 48 hex chars
}

export function generateResetToken() {
  return randomHex(24);  // 48 hex chars
}

/** SHA-256 hex digest of a plaintext token. Store this; never store the raw token. */
export async function hashToken(plainToken) {
  const buf = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(plainToken),
  );
  return Array.from(new Uint8Array(buf), b => b.toString(16).padStart(2, '0')).join('');
}

export function invitationExpiry() {
  return new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(); // 7 days
}

export function resetExpiry() {
  return new Date(Date.now() + 1 * 60 * 60 * 1000).toISOString(); // 1 hour
}
