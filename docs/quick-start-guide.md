# Zona Time Tracker — Quick Start Guide

**Version:** Sprint 5.3 (June 2026)  
**Audience:** All users — Admin, Manager, Employee

---

## 1. Login

Open your browser and go to:

**https://dev-time.zonaproperties.ae**

Enter your email address and password, then click **Sign In**.

> If you forgot your password, click **Forgot password?** on the login screen and follow the instructions sent to your email.

---

## 2. Dashboard (Admin / Manager)

After logging in as Admin or Manager, you land on the **Operations Dashboard**.

It shows a live overview of today's activity:

| Section | What it shows |
|---|---|
| **Today at a Glance** | Active now · Checked out today · No activity · Hours logged · Open extras |
| **Alerts** | Sessions over 10 hours · Previous-day open sessions · No-activity employees |
| **Live Check-ins** | Who is currently checked in, on which project, since when |
| **Today by Project** | Project-level breakdown of active and completed sessions |
| **Employee Status** | Each employee's status (Checked In / Checked Out / No Activity) |
| **Open Extras** | Pending extras awaiting review |

The dashboard refreshes automatically every 30 seconds. Use the **Refresh** button to update immediately.

---

## 3. Employees

Navigate to **Employees** from the top menu.

- View all employees: name, employee number, role, status, team
- Search by name or employee number
- Filter by role, team, or status
- Open an employee record to view details, edit information, manage assignments

**Employee statuses:**
- **Active** — can log in and use the system
- **Pending** — invitation sent, not yet accepted
- **Inactive** — account disabled

---

## 4. Projects

Navigate to **Projects** from the top menu.

- View all projects: name, code, client, status
- Create a new project: name, code, client, location, start date
- Assign employees to a project (restricted access) or leave open (all employees can access)
- Projects with status **Active** appear in the employee check-in selector

---

## 5. Time Entries

Navigate to **Time Entries** from the top menu.

View and filter all time entries across the organisation:

- Filter by employee, project, date range, or entry source
- See check-in and check-out times, GPS status, duration
- Review manual entries (entered retrospectively by admin)
- Download entries as Excel

---

## 6. Extras

Navigate to **Extras** from the top menu.

Extras are non-time items submitted by employees for approval:

- **Extra Work** — additional work hours outside the project scope
- **Own Cost** — personal expenses to be reimbursed

Each extra has a status: **Open** (awaiting review) or **Closed** (processed).

---

## 7. Mileage

Navigate to **Mileage** from the top menu.

Employees submit mileage records (distance driven for work). Admins can view all mileage, filter by employee or week, and export.

---

## 8. Roles Explained

| Role | What they can do |
|---|---|
| **Admin** | Full access — employees, projects, time entries, extras, mileage, dashboard, settings |
| **Manager** | Restricted view — sees only employees and projects assigned to their team(s) |
| **Employee** | Mobile-only access — check in/out, add extras and mileage, view their own time |

---

## 9. What is implemented today

- ✅ Login / logout / password reset
- ✅ Operations Dashboard (live check-ins, alerts, project breakdown, employee status)
- ✅ Employee management (create, edit, invite, deactivate, reactivate)
- ✅ Project management (create, edit, assign employees, deactivate)
- ✅ Time entries (view, filter, export Excel)
- ✅ Check In / Check Out (employee mobile app with GPS)
- ✅ Extras (submit, view, close)
- ✅ Mileage (submit, view, export)
- ✅ PWA install (add to iPhone Home Screen)
- ✅ Role-based access (Admin, Manager, Employee)
- ✅ Audit trail (all changes logged)
- ✅ Automatic unclosed-session detection

---

## 10. What is NOT implemented yet

- ❌ Email notifications (password reset emails require email service configuration)
- ❌ Manager team assignment UI (currently set via database)
- ❌ Client management screen
- ❌ Reporting & billing export
- ❌ Payroll integration
- ❌ Approval workflow for extras
- ❌ Multi-language support
- ❌ Offline mode for mobile (requires PWA background sync)

---

*For questions, contact your system administrator.*
