/**
 * JWT authentication middleware for itty-router.
 *
 * Usage:
 *   router.get('/api/some-route', requireAuth, handler);
 *   router.get('/api/admin-route', requireRole('administrator'), handler);
 *
 * On success: injects request.user = { id, role } and calls next().
 * On failure: returns 401 / 403 immediately.
 */

import { verifyJwt } from '../lib/jwt.js';

export async function requireAuth(request, env) {
  const cookie = request.headers.get('Cookie') ?? '';
  const match  = cookie.match(/(?:^|;\s*)jwt=([^;]+)/);

  if (!match) {
    return Response.json({ error: 'Authentication required' }, { status: 401 });
  }

  const payload = await verifyJwt(match[1], env.JWT_SECRET);
  if (!payload) {
    return Response.json({ error: 'Session expired or invalid' }, { status: 401 });
  }

  request.user = { id: payload.sub, role: payload.role };
}

export function requireRole(...roles) {
  return async function (request, env) {
    const authResult = await requireAuth(request, env);
    if (authResult) return authResult;  // 401 already returned

    if (!roles.includes(request.user.role)) {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }
  };
}
