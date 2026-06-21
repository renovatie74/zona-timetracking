import { Router } from 'itty-router';

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
// router.post('/api/auth/login',           authRoutes.login);
// router.post('/api/auth/logout',          authRoutes.logout);
// router.post('/api/auth/activate',        authRoutes.activate);
// router.post('/api/auth/forgot-password', authRoutes.forgotPassword);
// router.post('/api/auth/reset-password',  authRoutes.resetPassword);
// router.post('/api/auth/change-password', authRoutes.changePassword);

// ── User routes (Sprint 2) ────────────────────────────────────────────────────
// router.get('/api/users',                    userRoutes.list);
// router.post('/api/users',                   userRoutes.create);
// router.patch('/api/users/:id',              userRoutes.update);
// router.post('/api/users/:id/send-reset',    userRoutes.sendReset);
// router.post('/api/users/:id/resend-invite', userRoutes.resendInvite);

// ── Project routes (Sprint 2) ─────────────────────────────────────────────────
// router.get('/api/projects',       projectRoutes.list);
// router.post('/api/projects',      projectRoutes.create);
// router.get('/api/projects/:id',   projectRoutes.get);
// router.patch('/api/projects/:id', projectRoutes.update);

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
