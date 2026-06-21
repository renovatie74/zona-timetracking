/**
 * Post-build script: writes dist/_redirects from the WORKER_URL env var.
 *
 * This is the ONLY mechanism for generating _redirects — no manual files are
 * kept in git. WORKER_URL is set in Cloudflare Pages project settings per environment:
 *   DEV:  https://timetracking-api-dev.workers.dev
 *   PROD: https://timetracking-api-prod.workers.dev
 *
 * Result written to dist/_redirects (Cloudflare Pages proxy rule):
 *   /api/*  https://timetracking-api-<env>.workers.dev/api/:splat  200
 */

import { writeFileSync } from 'fs';

const workerUrl = process.env.WORKER_URL;

if (!workerUrl) {
  console.error('\nERROR: WORKER_URL environment variable is not set.');
  console.error('Set it in Cloudflare Pages → Settings → Environment Variables.\n');
  process.exit(1);
}

const rule = `/api/*  ${workerUrl}/api/:splat  200\n`;
writeFileSync('dist/_redirects', rule, 'utf8');
console.log(`✓ dist/_redirects written: ${rule.trim()}`);
