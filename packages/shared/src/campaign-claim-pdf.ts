/**
 * Brand-submission PDF column set for รายงานเบิกแคมเปญเงินส่งเสริมการขายประจำงวด.
 * Web table and PDF both project onto these headers so they stay in sync.
 */

/** Canonical headers that legacy formula names fold into (see resolvePdfClaimExpenseKey). */
export const PDF_CLAIM_EXPENSE_COLUMNS = [
  'Marketing 1%',
  'เปิดบูธ',
  'ค่าขนส่ง',
  'ทดสอบ',
  'STOCK 0.5%',
] as const;

export type PdfClaimExpenseColumn = (typeof PDF_CLAIM_EXPENSE_COLUMNS)[number];

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Map DB / editor formula name → fixed PDF header.
 * Legacy names (MARKETING, STOCK LEVEL*) stay for older DEMO/claim seed data.
 */
export function resolvePdfClaimExpenseKey(name: string): PdfClaimExpenseColumn | null {
  const n = name.trim();
  if (n === 'Marketing 1%' || n === 'MARKETING') return 'Marketing 1%';
  if (n === 'เปิดบูธ') return 'เปิดบูธ';
  if (n === 'ค่าขนส่ง') return 'ค่าขนส่ง';
  if (n === 'ทดสอบ') return 'ทดสอบ';
  if (n === 'STOCK 0.5%' || n === 'STOCK LEVEL 0.5%' || n === 'STOCK LEVEL') return 'STOCK 0.5%';
  return null;
}

/** Minimal input from buildCampaignClaimReport (or any compatible shape). */
export interface CampaignClaimReportForPdf {
  expenseColumns: string[];
  rows: Array<{
    no: number;
    customerName: string;
    modelName: string;
    vin: string;
    notifyDate: string | Date | null;
    salePrice: number;
    cells: Array<number | null>;
    total: number;
  }>;
  summary: { totalCars: number; columnTotals: number[]; grandTotal: number };
}

export interface CampaignClaimPdfProjection {
  expenseColumns: string[];
  rows: Array<{
    no: number;
    customerName: string;
    modelName: string;
    vin: string;
    notifyDate: string | null;
    salePrice: number;
    cells: Array<number | null>;
    total: number;
  }>;
  summary: {
    totalCars: number;
    columnTotals: number[];
    grandTotal: number;
  };
}

/**
 * Project claim report rows for web table + PDF.
 * One column per campaign formula name (editor-driven); legacy aliases fold into
 * their canonical header. Unknown names are kept as-is — dropping them hid every
 * formula not named exactly like the 5 demo headers (report showed 0.00).
 */
export function projectCampaignClaimForPdf(
  report: CampaignClaimReportForPdf
): CampaignClaimPdfProjection {
  const keys = report.expenseColumns.map((name) => resolvePdfClaimExpenseKey(name) ?? name.trim());
  const expenseColumns = [...new Set(keys)];

  const rows = report.rows.map((r) => {
    const amounts = new Map<string, number>();
    for (let i = 0; i < keys.length; i++) {
      const key = keys[i];
      const val = r.cells[i];
      if (val == null) continue;
      amounts.set(key, round2((amounts.get(key) ?? 0) + val));
    }
    const cells = expenseColumns.map((col) => {
      const v = amounts.get(col);
      return v != null ? v : null;
    });
    const total = round2(cells.reduce<number>((s, v) => s + (v ?? 0), 0));
    const notifyDate =
      r.notifyDate == null
        ? null
        : typeof r.notifyDate === 'string'
          ? r.notifyDate
          : r.notifyDate.toISOString();
    return {
      no: r.no,
      customerName: r.customerName,
      modelName: r.modelName,
      vin: r.vin,
      notifyDate,
      salePrice: r.salePrice,
      cells,
      total,
    };
  });

  const columnTotals = expenseColumns.map((_, j) =>
    round2(rows.reduce((s, row) => s + (row.cells[j] ?? 0), 0))
  );
  const grandTotal = round2(rows.reduce((s, row) => s + row.total, 0));

  return {
    expenseColumns,
    rows,
    summary: {
      totalCars: report.summary.totalCars,
      columnTotals,
      grandTotal,
    },
  };
}
