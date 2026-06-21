# Zona Time Tracker

Workforce time tracking PWA for Zona Properties. Replaces paper timesheets for 25–45 field workers across 50–60 active projects.

**Spec:** MVP Specification v2.3 (Final) · **Stack:** Cloudflare Pages + Workers + D1 + Cron · **Email:** Resend

---

## Domains

| Environment | URL |
|-------------|-----|
| Production  | https://time.zonaproperties.ae |
| Development | https://dev-time.zonaproperties.ae |

---

## Quick Start (Sprint 0 Setup)

### 1. Prerequisites

```bash
npm install -g wrangler
wrangler login
```

Ensure `zonaproperties.ae` DNS is managed by Cloudflare.

### 2. Create D1 Databases

```bash
wrangler d1 create timetracking-dev
wrangler d1 create timetracking-prod
```

Copy the `database_id` values printed for each into `worker/wrangler.toml`
(replace `REPLACE_WITH_DEV_D1_ID` and `REPLACE_WITH_PROD_D1_ID`).

### 3. Apply Migrations

```bash
chmod +x scripts/migrate.sh
./scripts/migrate.sh --env dev
./scripts/migrate.sh --env prod --i-know-what-im-doing
```

Or directly:
```bash
cd worker
npm ci
npm run migrate:dev
```

### 4. Set Secrets

```bash
# DEV
wrangler secret put JWT_SECRET --env dev      # generate: openssl rand -hex 32
wrangler secret put EMAIL_API_KEY --env dev   # Resend DEV API key

# PROD
wrangler secret put JWT_SECRET --env prod
wrangler secret put EMAIL_API_KEY --env prod
```

### 5. Deploy Worker Stub

```bash
cd worker
npm ci
npm run deploy:dev   # deploys timetracking-api-dev
npm run deploy:prod  # deploys timetracking-api-prod
```

Verify: `curl https://timetracking-api-dev.workers.dev/api/health`

### 6. Create Cloudflare Pages Projects

In the Cloudflare Dashboard:
1. Pages → Create project → Connect to Git → select this repo
2. **DEV project** (`timetracking-dev`): branch = `develop`, build command = `npm run build`, output = `dist`, root = `frontend`
3. **PROD project** (`timetracking-prod`): branch = `main`, same build settings
4. For each project → Settings → Environment Variables, set:
   - `WORKER_URL` = the Workers URL printed after step 5 (`https://timetracking-api-dev.workers.dev` / `...prod...`)
   - `NODE_VERSION` = `20`

### 7. Add Custom Domains

In each Pages project → Custom domains:
- `timetracking-dev` → `dev-time.zonaproperties.ae`
- `timetracking-prod` → `time.zonaproperties.ae`

### 8. GitHub Secrets

In GitHub → Settings → Secrets → Actions:
- `CLOUDFLARE_API_TOKEN` — create at Cloudflare Dashboard → My Profile → API Tokens
- `CLOUDFLARE_ACCOUNT_ID` — shown in Cloudflare Dashboard right sidebar

### 9. Seed DEV Data

```bash
cd worker
wrangler d1 execute timetracking-dev --env dev --file ../scripts/seed-dev.sql
```

### 10. Run XLSX Spike (S0-SPIKE)

```bash
cd spikes/xlsx-bundle
npm install
npx wrangler deploy --env spike --dry-run
```

Read the `Total Upload` size:
- **≤ 10 MB** → ExcelJS confirmed. Add `"exceljs": "^4.4.0"` to `worker/package.json`. Delete `spikes/`.
- **> 10 MB** → Try SheetJS: replace `exceljs` with `xlsx` in `package.json`, update `worker.js` import, re-run.
- **Still > 10 MB** → Use CSV fallback. Record decision below.

**Spike result:** *(fill in after running)*

---

## Local Development

```bash
# Terminal 1 — Worker
cd worker && npm ci && npm run dev

# Terminal 2 — Frontend (proxies /api/* to localhost:8787)
cd frontend && npm ci && npm run dev
```

---

## WAF Rate Limiting (Cloudflare Dashboard)

Security → WAF → Rate Limiting Rules — create two rules:

| Rule | Expression | Rate | Action |
|------|-----------|------|--------|
| Login brute force | `http.request.uri.path eq "/api/auth/login" and http.request.method eq "POST"` | 10/min per IP | Block (429) |
| Forgot password | `http.request.uri.path eq "/api/auth/forgot-password" and http.request.method eq "POST"` | 5/10min per IP | Block (429) |

Apply to both `dev-time.zonaproperties.ae` and `time.zonaproperties.ae`.

---

## Sequence Logic

Both `EmployeeCodeSequence` and `ProjectCodeSequence` use an atomic single-statement pattern:

```sql
UPDATE <table> SET next_seq = next_seq + 1 WHERE id = 1 RETURNING next_seq - 1 AS seq
```

- `next_seq` starts at `1` (seeded in migrations).
- First call: increments to `2`, returns `2 - 1 = 1` → code `E-001` / `P-001`.
- Second call: increments to `3`, returns `3 - 1 = 2` → code `E-002` / `P-002`.

See [`worker/src/lib/sequence.js`](worker/src/lib/sequence.js).

---

## Sprint Plan

| Sprint | Scope | Estimate |
|--------|-------|----------|
| S0 — Foundation + Spike | Repo, infra, migrations, scaffolds, XLSX spike | 3 days |
| S1 — Auth | Login, JWT, invitation flow, password reset | 1.5 weeks |
| S2 — Core Data | Project + User CRUD, P-NNN / E-NNN sequences, PWA shell | 1 week |
| S3 — Time Tracking | Check-in/out, GPS, rounding, Cron | 1.5 weeks |
| S4 — Timesheet + Notes | My Timesheet, manual entry, Project Notes | 1 week |
| S5 — Dashboards | Live dashboard, billable items, reports | 1.25 weeks |
| S6 — Exports + QA | XLSX exports, audit log, PROD deploy, UAT | 1.25 weeks |
