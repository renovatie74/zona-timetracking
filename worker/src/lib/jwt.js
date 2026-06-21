/**
 * JWT sign / verify via Web Crypto API (HS256).
 * No npm dependency. Payload: { sub, role, exp }.
 * Stored in httpOnly Secure SameSite=Strict cookie named "jwt".
 */

const ALG = { name: 'HMAC', hash: 'SHA-256' };

function b64url(buf) {
  return btoa(String.fromCharCode(...new Uint8Array(buf)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

function b64urlDecode(str) {
  const pad = str.length % 4 === 0 ? '' : '='.repeat(4 - str.length % 4);
  return Uint8Array.from(atob(str.replace(/-/g, '+').replace(/_/g, '/') + pad), c => c.charCodeAt(0));
}

async function importKey(secret) {
  return crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    ALG,
    false,
    ['sign', 'verify'],
  );
}

export async function signJwt(payload, secret) {
  const header  = b64url(new TextEncoder().encode(JSON.stringify({ alg: 'HS256', typ: 'JWT' })));
  const body    = b64url(new TextEncoder().encode(JSON.stringify(payload)));
  const signing = new TextEncoder().encode(`${header}.${body}`);
  const key     = await importKey(secret);
  const sig     = await crypto.subtle.sign(ALG, key, signing);
  return `${header}.${body}.${b64url(sig)}`;
}

export async function verifyJwt(token, secret) {
  const parts = token.split('.');
  if (parts.length !== 3) return null;

  const [header, body, sig] = parts;
  const signing = new TextEncoder().encode(`${header}.${body}`);
  const key     = await importKey(secret);
  const valid   = await crypto.subtle.verify(ALG, key, b64urlDecode(sig), signing);
  if (!valid) return null;

  const payload = JSON.parse(new TextDecoder().decode(b64urlDecode(body)));
  if (payload.exp && Date.now() / 1000 > payload.exp) return null;

  return payload;
}

export function jwtPayload(userId, role) {
  return {
    sub:  userId,
    role,
    exp:  Math.floor(Date.now() / 1000) + 8 * 60 * 60,  // 8 hours
  };
}

export function setJwtCookie(response, token) {
  response.headers.set(
    'Set-Cookie',
    `jwt=${token}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=${8 * 60 * 60}`,
  );
  return response;
}

export function clearJwtCookie(response) {
  response.headers.set(
    'Set-Cookie',
    'jwt=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0',
  );
  return response;
}
