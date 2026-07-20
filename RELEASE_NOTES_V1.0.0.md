# Zona Time Tracker — Release Notes v1.0.0

**Release name:** Version 1.0.0 — Initial Production Release
**Release date:** 2026-07-20
**Production URL:** https://time.zonaproperties.ae
**Git tag:** `v1.0.0` (commit `220ed28`)

---

## What's Included

Zona Time Tracker v1.0.0 is the first production release, covering the full
employee time-tracking and administration workflow for Zona Properties.

**Included functionality:**

- Secure authentication with JWT sessions, password reset, and account activation by email
- Employee workspace (mobile PWA): My Day, My Time, Mileage, Extras, Account
- Attendance recording: daily check-in/out per employee
- Project hours: log hours per project per day; weekly view
- Extras workflow: own-cost items with Open → Recorded → Processed status
- Mileage entries: per-trip log by project, with admin mark-complete and reopen
- Admin portal: clients, projects, teams, employees, attendance, extras, mileage
- Project invoicing status: mark weeks as invoiced per project
- Excel and CSV export of timesheet data
- Missing timesheet alerts
- Mobile PWA installation on iOS and Android
- Session expiry with first-attempt re-login

---

## DEV Data

No DEV business data, test employees, test projects, test clients, test entries,
or test records of any kind were migrated to production. The production database
is clean and contains only the schema, system roles, and one initial administrator.

---

## Initial Setup Required (Corina / Administrator)

Before employees can begin using the system:

1. **Change the initial administrator password** immediately after first login
2. **Create clients** (Clients → Add Client)
3. **Create projects** (Projects → Add Project) — link to clients, set status Active
4. **Create employees** (Employees → Add Employee) — they will receive activation emails
5. **Assign employees to restricted projects** if access control is required
6. **Create teams** (optional) if manager-scoped visibility is needed
7. **Verify employees have activated** their accounts before their first working day

See `docs/v1.0/ADMIN_QUICK_START.md` for the full setup checklist.

---

## Known Operational Actions Required Immediately After Release

- **Administrator must change the temporary password** at first login.
  The application does not enforce a forced password change on next login —
  this must be done manually via Account → Change Password.
- The activation email for any future employee will arrive from
  `noreply@zonaproperties.ae` — ensure this sender is not blocked by
  corporate email filters.
- The password reset link in emails expires after 1 hour.
