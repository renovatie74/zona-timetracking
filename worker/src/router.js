import { Router } from 'itty-router';
import * as authRoutes     from './routes/auth.js';
import * as teamRoutes     from './routes/teams.js';
import * as employeeRoutes from './routes/employees.js';
import * as projectRoutes  from './routes/projects.js';
import * as clientRoutes   from './routes/clients.js';

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
router.get(   '/api/employees',     employeeRoutes.list);
router.get(   '/api/employees/:id', employeeRoutes.get);
router.post(  '/api/employees',     employeeRoutes.create);
router.put(   '/api/employees/:id', employeeRoutes.update);
router.delete('/api/employees/:id', employeeRoutes.remove);

// ── Client routes (Sprint 2.1) ────────────────────────────────────────────────
router.get(   '/api/clients',     clientRoutes.list);
router.get(   '/api/clients/:id', clientRoutes.get);
router.post(  '/api/clients',     clientRoutes.create);
router.put(   '/api/clients/:id', clientRoutes.update);
router.delete('/api/clients/:id', clientRoutes.remove);

// ── Project routes (Sprint 2) ─────────────────────────────────────────────────
router.get(   '/api/projects',     projectRoutes.list);
router.get(   '/api/projects/:id', projectRoutes.get);
router.post(  '/api/projects',     projectRoutes.create);
router.put(   '/api/projects/:id', projectRoutes.update);
router.delete('/api/projects/:id', projectRoutes.remove);

// ── Time entry routes (Sprint 3) ──────────────────────────────────────────────
// router.post('/api/time-entries/checkin',  timeEntryRoutes.checkin);
// router.post('/api/time-entries/checkout', timeEntryRoutes.checkout);
// router.get('/api/time-entries/active',    timeEntryRoutes.active);
// router.get('/api/time-entries',           timeEntryRoutes.list);
// router.patch('/api/time-entries/:id',     timeEntryRoutes.update);
// router.post('/api/time-entries/manual',   timeEntryRoutes.manual);
// router.delete('/api/time-entries/:id',    timeEntryRoutes.remove);

// ── Note routes (Sprint 4) ────────────────────────────────────────────────────
// router.get('/api/project-notes',       noteRoutes.list);
// router.post('/api/project-notes',      noteRoutes.create);
// router.patch('/api/project-notes/:id', noteRoutes.update);
// router.get('/api/note-categories',     noteRoutes.categories);
// router.get('/api/recent-projects',     noteRoutes.recentProjects);

// ── Dashboard routes (Sprint 5) ───────────────────────────────────────────────
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
