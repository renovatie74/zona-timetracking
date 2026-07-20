/**
 * Thin fetch wrapper for all /api/* calls.
 *
 * - Always sends credentials (the httpOnly JWT cookie travels automatically).
 * - Returns parsed JSON on success.
 * - Throws { status, message } on API errors so callers can distinguish
 *   401 (redirect to login) from 400 (show validation message) etc.
 * - Returns a structured offline error on network failure, matching the
 *   spec §12.3 message: "Connection required. Please try again."
 */

class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status  = status;
    this.message = message;
  }
}

async function request(method, path, body) {
  let res;
  try {
    res = await fetch(path, {
      method,
      credentials: 'same-origin',
      headers:     body ? { 'Content-Type': 'application/json' } : {},
      body:        body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError(0, 'Connection required. Please try again.');
  }

  const json = await res.json().catch(() => ({ error: 'Unexpected response from server' }));

  if (!res.ok) {
    // Only treat 401 as an expired session on protected routes.
    // Auth routes (/api/auth/*) are either public (activate, reset-password)
    // or used to probe login state — a 401 there just means "not logged in".
    if (res.status === 401 && !path.startsWith('/api/auth/')) {
      window.dispatchEvent(new CustomEvent('session:expired'));
    }
    throw new ApiError(res.status, json.error ?? 'An error occurred');
  }

  return json.data ?? json;
}

export const api = {
  get:    (path)        => request('GET',    path),
  post:   (path, body)  => request('POST',   path, body),
  put:    (path, body)  => request('PUT',    path, body),
  patch:  (path, body)  => request('PATCH',  path, body),
  delete: (path)        => request('DELETE', path),
};
