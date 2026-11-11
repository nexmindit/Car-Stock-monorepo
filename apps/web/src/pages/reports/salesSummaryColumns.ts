import type { SalesSummaryItem } from '@car-stock/shared/types';

/**
 * Numeric Thai date `DD/MM/BBBB` (Buddhist year), mirroring the server PDF's
 * `formatThaiDate(date, 'numeric')` (apps/api/src/modules/pdf/helpers.ts) so the
 * Excel `วันที่ขาย` column reads identically to the PDF. Uses the same local-time
 * getters and `+ 543` Buddhist-year offset as the PDF helper.
 */
function formatNumericThaiDate(dateString: string | null | undefined): string {
  if (!dateString) return '-';
  const d = new Date(dateString);
  if (Number.isNaN(d.getTime())) return '-';
  const day = d.getDate().toString().padStart(2, '0');
  const month = (d.getMonth() + 1).toString().padStart(2, '0');
  const buddhistYear = d.getFullYear() + 543;
  return `${day}/${month}/${buddhistYear}`;
}

export interface SalesSummaryColumn {
  /** Thai header text — also used verbatim as the Excel column label. */
  key: string;
  /** Cell value. Money fields return raw numbers so Excel keeps them numeric. */
  value: (s: SalesSummaryItem, index: number) => string | number;
}

/**
 * Canonical per-sale columns for the sales-summary report.
 *
 * Order and labels mirror the server PDF (sales-summary-report.hbs). Two
 * spreadsheet adaptations: customer/model and engine/chassis become separate
 * columns (the PDF stacks them in one cell), and กำไรขั้นต้น is computed
 * (ราคารถ − ต้นทุน) to match the PDF's {{subtract totalAmount totalCost}}.
 *
 * The last three columns are Excel-only extras kept per the spec; the redundant
 * per-row cost-VAT split is intentionally omitted (it is an aggregate in the PDF footer).
 */
export const SALES_SUMMARY_COLUMNS: SalesSummaryColumn[] = [
  { key: 'ลำดับ', value: (_s, i) => i + 1 },
  { key: 'ชื่อลูกค้า', value: (s) => s.customerName },
  { key: 'แบบรถ', value: (s) => s.vehicleModelName || s.vehicleInfo },
  { key: 'เลขเครื่อง', value: (s) => s.engineNumber || '-' },
  { key: 'เลขคัซซี', value: (s) => s.chassisNumber || '-' },
  { key: 'ราคารถ', value: (s) => s.totalAmount },
  { key: 'ส่วนลดตัวรถ', value: (s) => s.discountAmount ?? 0 },
  { key: 'เงินดาวน์', value: (s) => s.downPayment ?? 0 },
  { key: 'ส่วนลดดาวน์', value: (s) => s.downPaymentDiscount ?? 0 },
  { key: 'คงเหลือ', value: (s) => s.remainingAmount },
  { key: 'ยอดจัด', value: (s) => s.financeAmount ?? 0 },
  { key: 'ค่าคอมไฟแนนซ์', value: (s) => s.financeReturn ?? 0 },
  { key: 'รวมรับเงิน', value: (s) => s.paidAmount },
  { key: 'วันที่ขาย', value: (s) => formatNumericThaiDate(s.saleDate) },
  { key: 'ทะเบียน/พรบ/ขนส่ง', value: (s) => s.transportFee ?? 0 },
  { key: 'ต้นทุน', value: (s) => s.totalCost ?? 0 },
  { key: 'แคมเปญขาย', value: (s) => s.campaignSubsidy ?? 0 },
  { key: 'กำไรขั้นต้น', value: (s) => s.totalAmount - (s.totalCost ?? 0) },
  { key: 'คอมฯพนักงาน', value: (s) => s.salesCommission ?? 0 },
  { key: 'ค่าใช้จ่ายขาย', value: (s) => s.salesExpense ?? 0 },
  { key: 'ดอกเบี้ยธนาคาร', value: (s) => s.interestCost ?? 0 },
  { key: 'ค่าเบี้ยประกัน', value: (s) => s.insurancePremium ?? 0 },
  { key: 'กำไรสุทธิ', value: (s) => s.netProfit ?? 0 },
  { key: 'หมายเหตุ', value: (s) => s.stockNotes || '-' },
  // Excel-only extras (kept; not in the PDF)
  { key: 'รับจาก', value: (s) => s.receivedFrom || '-' },
  { key: 'สถานะ', value: (s) => s.statusLabel },
  { key: 'Sale', value: (s) => s.salesperson },
];

/** Build one Excel row keyed by Thai header, from the canonical descriptor. */
export function buildSalesSummaryExportRow(
  s: SalesSummaryItem,
  index: number
): Record<string, string | number> {
  return Object.fromEntries(SALES_SUMMARY_COLUMNS.map((c) => [c.key, c.value(s, index)]));
}
