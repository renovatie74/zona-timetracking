# Zona Time Tracker — Change Log

---

## Version 1.0.0

**Release date:** 2026-07-20
**Status:** Production release
**Environment:** https://time.zonaproperties.ae

---

### Core Application Foundation

- Cloudflare Pages + Workers + D1 architecture established
- Environment separation: DEV (`dev-time.zonaproperties.ae`) and PROD (`time.zonaproperties.ae`)
- PWA manifest and service worker for mobile installation (iOS and Android)
- Mobile-first responsive layout with safe-area handling for iPhone notch and home bar
- Light/dark theme support across all screens
- Toast notification system for user feedback

---

### Authentication & Account Management

- Login with email and password (PBKDF2-SHA256, 100 000 iterations)
- JWT session cookie with automatic expiry
- Session expiry bug fixed: logout always returns 200; re-login succeeds on first attempt
- Forgot password: email with reset link using production domain
- Password reset via tokenised link (hashed token, never stored in plain text)
- Account activation: new employees receive an email with a one-time activation link
- Change password: available from Profile (admin/manager) and Account tab (employee)
- Login audit log with IP address, country, user agent, failure reason

---

### User & Role Management

- Three roles: `employee`, `manager`, `administrator`
- Admin: full access to all features and all employees
- Manager: scoped access to assigned teams and their members
- Employee: self-service mobile workspace only
- Employee number auto-assigned (`E-001`, `E-002`, …)
- Activate / deactivate accounts without deleting data
- Manager assignment per team for access scoping

---

### Client Management

- Create, edit, deactivate clients
- Client code auto-assigned (`C-001`, `C-002`, …)
- Contact person, phone, email fields

---

### Project Management

- Create, edit projects with name, client, location, start/end date, status
- Project code auto-assigned (`P-001`, `P-002`, …)
- Project statuses: Active, On Hold, Completed
- Project assignment: restrict access to specific employees, or leave open for all
- Invoicing status per project week: mark weeks as invoiced
- Project timesheet view: week-by-week hours, invoicing status

---

### Team Management

- Create teams and assign employees
- Manager scope: managers see only their team members' data

---

### Attendance

- Daily attendance records per employee: check-in and check-out times
- Admin attendance overview: all employees, filterable by date
- Missing timesheets dashboard: identify employees with incomplete weeks

---

### Project Hours

- Employees log hours per project per day
- Multiple entries per day, multiple projects
- Weekly view (My Time): all days and entries in card layout
- Attendance and project hours displayed together per day
- Admin employee timesheet: view any employee's week

---

### Employee Workspace (Mobile PWA)

- **My Day**: log attendance and project hours for today
- **My Time**: weekly view of all attendance and project hours
- **Mileage**: per-entry mileage log (see below)
- **Extras**: own-cost items (see below)
- **Account**: profile info, change password, sign out
- Bottom tab navigation with 5 tabs

---

### Extras Workflow

- Employees log own-cost items linked to a project
- Status workflow: Open → Recorded → Processed
- Admin Extras view: filter by employee, project, status
- Admin marks extras as recorded or processed for billing

---

### Mileage Entries

- Per-entry mileage model: date, project, kilometres, optional note, status
- Employee: add, edit, delete open entries; week navigation; status filter (All / Open / Completed)
- Admin/Manager: view all entries filtered by week, employee, project, status
- Admin: Mark Complete to lock an entry; Reopen to unlock
- Mileage separated from Extras into a dedicated module

---

### Reporting & Export

- Excel (XLSX) export: timesheet data by date range
- CSV export available
- Admin Console: configure date range, generate and download export

---

### Email Notifications

- Account activation email with personalised link
- Password reset email with tokenised link
- All email links use the production domain (`time.zonaproperties.ae`)
- Scheduled daily cron job (23:30 Dubai time) for background processing

---

### Production Preparation (Sprint 12)

- Production environment deployed to Cloudflare
- Production D1 database initialised with full schema (28 migrations)
- No DEV business data migrated to production
- Initial administrator account created
- Version 1.0.0 tagged in Git (`v1.0.0`, commit `220ed28`)
- Documentation package created (`docs/v1.0/`)

---

*For future releases, update this file as part of every completed sprint or production deployment.*
