import { Router } from 'itty-router';
import * as authRoutes        from './routes/auth.js';
import * as teamRoutes        from './routes/teams.js';
import * as employeeRoutes    from './routes/employees.js';
import * as projectRoutes     from './routes/projects.js';
import * as clientRoutes      from './routes/clients.js';
import * as timeEntryRoutes   from './routes/time_entries.js';
import * as myTimeRoutes      from './routes/my_time.js';
import * as extrasRoutes      from './routes/extras.js';
import * as mileageRoutes     from './routes/mileage.js';
import * as dashboardRoutes      from './routes/dashboard.js';
import * as adminConsoleRoutes   from './routes/admin_console.js';
import * as exportRoutes          from './routes/export.js';
import * as myDayRoutes          from './routes/my_day.js';
import * as attendanceRoutes     from './routes/attendance.js';

export const router = Router();

// ── Health check (Sprint 0) ───────────────────────────────────────────────────
router.get('/api/health', async (request, env) => {
  const db = await env.DB.prepare('SELECT 1 AS ok').first();
  return Response.json({
    status: 'ok',
    db: !!db,
    environment: env.ENVIRONMENT,
  });
});

// ── Auth routes (Sprint 1) ────────────────────────────────────────────────────
router.post('/api/auth/login',            authRoutes.login);
router.post('/api/auth/logout',           authRoutes.logout);
router.get( '/api/auth/me',               authRoutes.me);
router.post('/api/auth/activate-account', authRoutes.activate);
router.post('/api/auth/forgot-password',  authRoutes.forgotPassword);
router.post('/api/auth/reset-password',   authRoutes.resetPassword);
router.post( '/api/auth/change-password',  authRoutes.changePassword);
router.patch('/api/profile',               authRoutes.updateProfile);

// ── Team routes (Sprint 2) ────────────────────────────────────────────────────
router.get(   '/api/teams',     teamRoutes.list);
router.get(   '/api/teams/:id', teamRoutes.get);
router.post(  '/api/teams',     teamRoutes.create);
router.put(   '/api/teams/:id', teamRoutes.update);
router.delete('/api/teams/:id', teamRoutes.remove);

// ── Employee routes (Sprint 2) ────────────────────────────────────────────────
router.get(   '/api/employees',                          employeeRoutes.list);
router.get(   '/api/employees/:id',                      employeeRoutes.get);
router.post(  '/api/employees',                          employeeRoutes.create);
router.post(  '/api/employees/:id/reactivate',           employeeRoutes.reactivate);
router.post(  '/api/employees/:id/activate',             employeeRoutes.activate);
router.post(  '/api/employees/:id/resend-activation',    employeeRoutes.resendActivation);
router.post(  '/api/employees/:id/generate-password',    employeeRoutes.generatePasswordForUser);
router.get(   '/api/employees/:id/weekly-hours',         employeeRoutes.weeklyHours);
router.get(   '/api/employees/:id/timesheet-matrix',     employeeRoutes.timesheetMatrix);
router.get(   '/api/employees/:id/hours-by-day',         employeeRoutes.hoursByDay);
router.get(   '/api/employees/:id/assignments',          employeeRoutes.listProjectAssignments);
router.put(   '/api/employees/:id/assignments',          employeeRoutes.setProjectAssignments);
router.put(   '/api/employees/:id',                      employeeRoutes.update);
router.delete('/api/employees/:id',                      employeeRoutes.remove);

// ── Client routes (Sprint 2.1) ────────────────────────────────────────────────
router.get(   '/api/clients',     clientRoutes.list);
router.get(   '/api/clients/:id', clientRoutes.get);
router.post(  '/api/clients',     clientRoutes.create);
router.put(   '/api/clients/:id', clientRoutes.update);
router.delete('/api/clients/:id', clientRoutes.remove);

// ── Project routes (Sprint 2 + 3A assignments) ───────────────────────────────
router.get(   '/api/projects/mine',               projectRoutes.mine);
router.get(   '/api/projects/billing-horizon',    projectRoutes.billingHorizon);
router.get(   '/api/projects',                    projectRoutes.list);
router.get(   '/api/projects/:id',                projectRoutes.get);
router.post(  '/api/projects',                    projectRoutes.create);
router.put(   '/api/projects/:id',                projectRoutes.update);
router.delete('/api/projects/:id',                projectRoutes.remove);
router.get(   '/api/projects/:id/assignments',    projectRoutes.listAssignments);
router.put(   '/api/projects/:id/assignments',    projectRoutes.setAssignments);
router.get(   '/api/projects/:id/weekly-hours',        projectRoutes.weeklyHours);
router.get(   '/api/projects/:id/timesheet-matrix',    projectRoutes.timesheetMatrix);
router.put(   '/api/projects/:id/invoice-status',      projectRoutes.setInvoiceStatus);

// ── Time entry routes (Sprint 3A — manual CRUD) ───────────────────────────────
router.get(   '/api/time-entries',      timeEntryRoutes.list);
router.post(  '/api/time-entries',      timeEntryRoutes.create);
router.put(   '/api/time-entries/:id',  timeEntryRoutes.update);
router.delete('/api/time-entries/:id',  timeEntryRoutes.remove);

// ── Time entry routes (Sprint 3B — employee self-service) ────────────────────
// Declared before /:id routes — itty-router matches in registration order.
router.get( '/api/time-entries/mine',      timeEntryRoutes.mine);
router.get( '/api/time-entries/active',    timeEntryRoutes.active);
router.post('/api/time-entries/checkin',   timeEntryRoutes.checkin);
router.post('/api/time-entries/checkout',  timeEntryRoutes.checkout);
router.post('/api/time-entries/discard',   timeEntryRoutes.discard);

// ── My Day routes (Sprint 6 — daily attendance + project hours) ──────────────
// Specific sub-paths must precede /:id to avoid capture
router.get(   '/api/my-day/week',                myDayRoutes.getWeek);
router.get(   '/api/my-day',                     myDayRoutes.getDay);
router.put(   '/api/my-day/attendance',          myDayRoutes.putAttendance);
router.post(  '/api/my-day/project-hours',       myDayRoutes.createProjectHours);
router.put(   '/api/my-day/project-hours/:id',   myDayRoutes.updateProjectHours);
router.delete('/api/my-day/project-hours/:id',   myDayRoutes.deleteProjectHours);

// ── My Time routes (Sprint 3C — employee timesheet) ──────────────────────────
router.get(   '/api/my-time',      myTimeRoutes.myTime);
router.post(  '/api/my-time',      myTimeRoutes.createMyEntry);
router.put(   '/api/my-time/:id',  myTimeRoutes.updateMyEntry);
router.delete('/api/my-time/:id',  myTimeRoutes.deleteMyEntry);

// ── Extras routes (Sprint 4) ──────────────────────────────────────────────────
// Employee self-service — /mine routes must precede /:id routes
router.get(   '/api/extras/mine',         extrasRoutes.listMine);
router.post(  '/api/extras/mine',         extrasRoutes.createMine);
router.put(   '/api/extras/mine/:id',     extrasRoutes.updateMine);
router.delete('/api/extras/mine/:id',     extrasRoutes.deleteMine);
// Admin/manager endpoints
router.get(   '/api/extras/summary',               extrasRoutes.summary);
router.get(   '/api/extras',                       extrasRoutes.list);
router.post(  '/api/extras',                       extrasRoutes.create);
router.get(   '/api/extras/:id',                   extrasRoutes.getOne);
router.post(  '/api/extras/:id/complete',          extrasRoutes.complete);
router.post(  '/api/extras/:id/request-review',    extrasRoutes.requestReview);
router.post(  '/api/extras/:id/manager-reply',     extrasRoutes.managerReply);
router.post(  '/api/extras/:id/process',           extrasRoutes.process);
router.post(  '/api/extras/:id/reopen',            extrasRoutes.reopen);
router.put(   '/api/extras/:id',                   extrasRoutes.update);
router.delete('/api/extras/:id',                   extrasRoutes.remove);

// ── Mileage routes (Sprint 12 — per-entry model) ─────────────────────────────
// Employee self-service
router.get(   '/api/my-mileage',        mileageRoutes.listMyMileage);
router.post(  '/api/my-mileage',        mileageRoutes.createMyMileage);
router.put(   '/api/my-mileage/:id',    mileageRoutes.updateMyMileage);
router.delete('/api/my-mileage/:id',    mileageRoutes.deleteMyMileage);
// Admin/manager
router.get( '/api/mileage',              mileageRoutes.listMileage);
router.post('/api/mileage/:id/reopen',   mileageRoutes.reopenMileage);
router.post('/api/mileage/:id/complete', mileageRoutes.completeMileage);

// ── Note routes (Sprint 4+) ───────────────────────────────────────────────────
// router.get('/api/project-notes',       noteRoutes.list);
// router.post('/api/project-notes',      noteRoutes.create);
// router.patch('/api/project-notes/:id', noteRoutes.update);
// router.get('/api/note-categories',     noteRoutes.categories);
// router.get('/api/recent-projects',     noteRoutes.recentProjects);

// ── Attendance routes (DailyAttendance admin view) ───────────────────────────
router.get(   '/api/attendance',     attendanceRoutes.list);
router.post(  '/api/attendance',     attendanceRoutes.create);
router.put(   '/api/attendance/:id', attendanceRoutes.update);
router.delete('/api/attendance/:id', attendanceRoutes.remove);

// ── Dashboard routes (Sprint 5 / Sprint 8) ───────────────────────────────────
// Specific sub-paths before /operations to avoid any future catch-all issues
router.get('/api/dashboard/missing-timesheets', dashboardRoutes.missingTimesheets);
router.get('/api/dashboard/operations',         dashboardRoutes.operations);

// ── Admin Console routes (Sprint 5.5 / 5.5.1) ───────────────────────────────
router.get('/api/admin-console/users',       adminConsoleRoutes.users);
router.get('/api/admin-console/login-audit', adminConsoleRoutes.loginAudit);
router.get('/api/admin-console/admin-audit', adminConsoleRoutes.adminAudit);

// ── Export routes (Sprint 9) ─────────────────────────────────────────────────
// Specific sub-paths must precede any future /:id routes
router.get( '/api/admin-console/export/xlsx', exportRoutes.downloadXlsx);
router.get( '/api/admin-console/export/csv',  exportRoutes.downloadCsv);
router.post('/api/admin-console/export',      exportRoutes.generateExport);
// router.get('/api/dashboard/live',           dashboardRoutes.live);
// router.get('/api/dashboard/management',     dashboardRoutes.management);
// router.get('/api/dashboard/billable-items', dashboardRoutes.billableItems);

// ── Report routes (Sprint 5) ──────────────────────────────────────────────────
// router.get('/api/reports/employee-hours', reportRoutes.employeeHours);
// router.get('/api/reports/project-hours',  reportRoutes.projectHours);
// router.get('/api/reports/open-notes',     reportRoutes.openNotes);
// router.get('/api/reports/mileage',        reportRoutes.mileage);

// ── Export routes (Sprint 6) ──────────────────────────────────────────────────
// router.get('/api/exports/employee-hours', exportRoutes.employeeHours);
// router.get('/api/exports/project-hours',  exportRoutes.projectHours);
// router.get('/api/exports/project-notes',  exportRoutes.projectNotes);
// router.get('/api/exports/mileage',        exportRoutes.mileage);
// router.get('/api/exports/billable-items', exportRoutes.billableItems);

// ── Audit log (Sprint 6) ──────────────────────────────────────────────────────
// router.get('/api/audit-log', auditRoutes.list);

// ── 404 catch-all ─────────────────────────────────────────────────────────────
router.all('*', () => Response.json({ error: 'Not found' }, { status: 404 }));
