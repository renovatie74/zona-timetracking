/**
 * Login audit writer — appends one row to LoginAuditEvents per login attempt.
 * Safe to await: catches all DB errors internally so the login flow is never blocked.
 */

function deriveDeviceSummary(ua) {
  if (!ua) return null;
  let browser = 'Unknown';
  if      (/Edg\//.test(ua))                              browser = 'Edge';
  else if (/OPR\//.test(ua))                              browser = 'Opera';
  else if (/Chrome\//.test(ua) && /Safari\//.test(ua))   browser = 'Chrome';
  else if (/Firefox\//.test(ua))                          browser = 'Firefox';
  else if (/Safari\//.test(ua))                           browser = 'Safari';

  let device = 'Desktop';
  if      (/iPhone/.test(ua))              device = 'iPhone';
  else if (/iPad/.test(ua))               device = 'iPad';
  else if (/Android.*Mobile/.test(ua))    device = 'Android';
  else if (/Android/.test(ua))            device = 'Android Tablet';

  return `${browser} / ${device}`;
}

// Priority: True-Client-IP > CF-Connecting-IP > first XFF token > remote_addr
function selectDisplayIp(trueClientIp, cfConnectingIp, xForwardedFor, remoteAddr) {
  if (trueClientIp)   return trueClientIp;
  if (cfConnectingIp) return cfConnectingIp;
  if (xForwardedFor)  return xForwardedFor.split(',')[0].trim();
  return remoteAddr ?? null;
}

export async function writeLoginAudit(db, {
  attemptedEmail,   // string
  userId,           // number | null
  result,           // 'success' | 'failed'
  failureReason,    // string | null
  cfConnectingIp,   // string | null  — CF-Connecting-IP header
  trueClientIp,     // string | null  — True-Client-IP header
  xForwardedFor,    // string | null  — X-Forwarded-For header
  remoteAddr,       // string | null  — socket remote addr (null in CF Workers)
  countryCode,      // string | null  — CF-IPCountry header
  userAgent,        // string | null
  path,             // string | null
}) {
  const displayIp = selectDisplayIp(trueClientIp, cfConnectingIp, xForwardedFor, remoteAddr);
  try {
    await db.prepare(
      `INSERT INTO LoginAuditEvents
         (attempted_email, user_id, result, failure_reason,
          ip_address, country_code, user_agent, device_summary, path,
          cf_connecting_ip, true_client_ip, x_forwarded_for, remote_addr,
          created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(
      attemptedEmail,
      userId            ?? null,
      result,
      failureReason     ?? null,
      displayIp,
      countryCode       ?? null,
      userAgent         ?? null,
      deriveDeviceSummary(userAgent),
      path              ?? null,
      cfConnectingIp    ?? null,
      trueClientIp      ?? null,
      xForwardedFor     ?? null,
      remoteAddr        ?? null,
      new Date().toISOString(),
    ).run();
  } catch (err) {
    console.error('Login audit write failed:', err.message);
  }
}
