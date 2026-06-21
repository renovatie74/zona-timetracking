/**
 * XLSX generation stub — implementation deferred until Sprint 0 spike confirms ExcelJS bundle size.
 *
 * Sprint 0 spike: spikes/xlsx-bundle/
 *   Run: cd spikes/xlsx-bundle && npm install && wrangler deploy --env dev --dry-run
 *   If bundle ≤ 10 MB (Workers paid plan limit): install exceljs here and implement.
 *   If bundle > 10 MB: evaluate SheetJS (xlsx), then CSV fallback.
 *
 * After spike decision is recorded, replace this stub with the chosen implementation.
 */

export function xlsxResponse(filename) {
  return new Response(JSON.stringify({ error: 'Excel export not yet implemented (Sprint 6)' }), {
    status:  501,
    headers: { 'Content-Type': 'application/json' },
  });
}
