# Zona Time Tracker — Go-Live Checklist

**Version 1.0 · Release date: 2026-07-20**

---

## Production Deployment

- [x] Production application deployed (Cloudflare Pages + Worker)
- [x] Production database initialized (D1: `timetracking-prod`)
- [x] All 28 database migrations applied
- [x] DEV and PROD fully separated (different workers, databases, secrets)
- [x] Production secrets configured (`JWT_SECRET`, `EMAIL_API_KEY`) — not committed to source
- [x] Initial administrator account created (`jarek@kowale.net`)
- [x] No DEV or test data in production database

---

## Authentication

- [x] First login successful on first attempt
- [x] Password change successful (`/change-password`)
- [x] Logout returns 200 regardless of session state
- [x] Re-login after logout successful on first attempt
- [x] Session expiry bug fixed — no double-login required

---

## Core Application

- [x] Clients — list, create, delete verified
- [x] Projects — list, create, delete verified
- [x] Employees — endpoint returns 200
- [x] Teams — endpoint returns 200
- [x] Attendance — module present (DailyAttendance table migrated)
- [x] Project hours — TimeEntries table migrated
- [x] Extras — endpoint returns 200 (empty clean database)
- [x] Mileage — endpoint returns 200 (MileageEntries table migrated)
- [x] Export — XLSX generated (30 KB), HTTP 200, correct content-type
- [x] No smoke-test data remaining in production

---

## Technical

- [x] Email triggered — forgot-password returned `{ok:true}` (Mailchannels configured)
- [x] Export verified — XLSX download successful
- [x] Production URLs used in worker (`APP_URL = https://time.zonaproperties.ae`)
- [x] No test or dev URLs in production configuration
- [x] Mobile layout: employee screens use mobile-native layout
- [x] PWA manifest present; service worker registered
- [x] Production Pages domain: `time.zonaproperties.ae`

---

## Completion

- [ ] Corina received administrator credentials and ADMIN_QUICK_START.md
- [ ] Initial password securely transferred to Jarek
- [ ] Administrator password changed after first login
- [ ] Employees informed of activation email process
- [ ] System ready for employee on-boarding
