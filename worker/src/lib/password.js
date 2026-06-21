/**
 * Password hashing via PBKDF2-HMAC-SHA256 (Web Crypto API, no npm dependency).
 *
 * Algorithm: PBKDF2-HMAC-SHA256, 600 000 iterations, 16-byte random salt, 256-bit key.
 * OWASP 2023 recommendation for PBKDF2-SHA256.
 *
 * Storage format (self-describing for future iteration count increases):
 *   pbkdf2:sha256:<iterations>:<base64_salt>:<base64_hash>
 *
 * crypto.subtle runs natively in Workers and does not count against the JS CPU budget.
 */

const ALGORITHM  = 'PBKDF2';
const HASH       = 'SHA-256';
const ITERATIONS = 600_000;
const SALT_BYTES = 16;
const KEY_BITS   = 256;

export async function hashPassword(plaintext) {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));

  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(plaintext),
    ALGORITHM,
    false,
    ['deriveBits'],
  );

  const bits = await crypto.subtle.deriveBits(
    { name: ALGORITHM, hash: HASH, salt, iterations: ITERATIONS },
    key,
    KEY_BITS,
  );

  const saltB64 = btoa(String.fromCharCode(...salt));
  const hashB64 = btoa(String.fromCharCode(...new Uint8Array(bits)));
  return `pbkdf2:sha256:${ITERATIONS}:${saltB64}:${hashB64}`;
}

export async function verifyPassword(plaintext, stored) {
  const parts = stored.split(':');
  if (parts.length !== 5 || parts[0] !== 'pbkdf2') return false;

  const [, , iterStr, saltB64, expectedB64] = parts;
  const salt       = Uint8Array.from(atob(saltB64), c => c.charCodeAt(0));
  const iterations = parseInt(iterStr, 10);

  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(plaintext),
    ALGORITHM,
    false,
    ['deriveBits'],
  );

  const bits = await crypto.subtle.deriveBits(
    { name: ALGORITHM, hash: HASH, salt, iterations },
    key,
    KEY_BITS,
  );

  const computedB64 = btoa(String.fromCharCode(...new Uint8Array(bits)));
  return timingSafeEqual(computedB64, expectedB64);
}

function timingSafeEqual(a, b) {
  const bufA = new TextEncoder().encode(a);
  const bufB = new TextEncoder().encode(b);
  if (bufA.length !== bufB.length) return false;
  let diff = 0;
  for (let i = 0; i < bufA.length; i++) diff |= bufA[i] ^ bufB[i];
  return diff === 0;
}
