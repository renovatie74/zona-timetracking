/**
 * XLSX bundle size spike — Sprint 0 (S0-SPIKE).
 *
 * Purpose: confirm ExcelJS fits within the Cloudflare Worker 10 MB bundle
 * limit (Workers Paid plan, required anyway for Cron triggers).
 *
 * Run the spike:
 *   cd spikes/xlsx-bundle
 *   npm install
 *   npx wrangler deploy --env spike --dry-run
 *
 * Read the "Total Upload" line in the output:
 *   ≤ 10 MB  →  ✅ ExcelJS is fine. Add to worker/package.json for Sprint 6.
 *   > 10 MB  →  ⚠️  Try SheetJS: npm install xlsx; update import; re-run.
 *   Still > 10 MB → use CSV fallback (see README decision log).
 *
 * This file is NOT deployed to production. Delete spikes/ after the decision is recorded.
 */

import ExcelJS from 'exceljs';

export default {
  async fetch() {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Employee Hours');

    ws.columns = [
      { header: 'Employee #', key: 'empNum',   width: 12 },
      { header: 'Name',       key: 'name',     width: 20 },
      { header: 'Date',       key: 'date',     width: 12 },
      { header: 'Project',    key: 'project',  width: 10 },
      { header: 'Hours',      key: 'hours',    width:  8 },
    ];

    for (let i = 1; i <= 10; i++) {
      ws.addRow({
        empNum:  `E-00${i}`,
        name:    `Worker ${i}`,
        date:    '2026-06-21',
        project: `P-00${i}`,
        hours:   8,
      });
    }

    const buf = await wb.xlsx.writeBuffer();

    return new Response(buf, {
      headers: {
        'Content-Type':        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': 'attachment; filename="spike-test.xlsx"',
      },
    });
  },
};
