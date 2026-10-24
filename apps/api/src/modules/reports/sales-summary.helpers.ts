import { SALE_STATUS_LABELS } from '@car-stock/shared/constants';

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Rate applied on top of staff sales commission (customer-specified 8%). */
const COMMISSION_VAT_RATE = 0.08;

/** One sale's fields needed to build the per-salesperson breakdown. */
export interface SalespersonSaleInput {
  salesperson: string;
  salespersonId: string;
  totalAmount: number;
  status: string;
  /** ค่าคอมฯ พนักงานขาย as typed on the sale (sale.salesCommission). */
  salesCommission: number;
}

export interface SalespersonBreakdownRow {
  id: string;
  salesperson: string;
  totalSales: number;
  pendingCount: number;
  completedCount: number;
  canceledCount: number;
  totalAmount: number;
  /** Sum of the entered salesCommission for this salesperson. */
  commission: number;
  commissionVat: number;
  commissionWithVat: number;
}

/**
 * Group sales by salesperson for the sales-summary report.
 *
 * `commission` is the SUM of the salesCommission actually entered on each sale —
 * not a derived percentage. (Previously this was `amount * 0.01`, which ignored
 * the value the user typed on the sale page; customer-reported bug B6.)
 */
export function buildSalespersonBreakdown(
  sales: SalespersonSaleInput[]
): SalespersonBreakdownRow[] {
  const groups: Record<
    string,
    {
      id: string;
      salesperson: string;
      count: number;
      amount: number;
      commission: number;
      pending: number;
      completed: number;
      canceled: number;
    }
  > = {};

  for (const s of sales) {
    if (!groups[s.salesperson]) {
      groups[s.salesperson] = {
        id: s.salespersonId,
        salesperson: s.salesperson,
        count: 0,
        amount: 0,
        commission: 0,
        pending: 0,
        completed: 0,
        canceled: 0,
      };
    }
    const g = groups[s.salesperson];
    g.count += 1;
    g.amount += s.totalAmount;
    g.commission += s.salesCommission;

    if (s.status === 'RESERVED' || s.status === 'PREPARING') {
      g.pending += 1;
    } else if (s.status === 'COMPLETED' || s.status === 'DELIVERED') {
      g.completed += 1;
    } else if (s.status === 'CANCELLED') {
      g.canceled += 1;
    }
  }

  return Object.values(groups)
    .map((g) => {
      const commission = round2(g.commission);
      const commissionVat = round2(commission * COMMISSION_VAT_RATE);
      return {
        id: g.id,
        salesperson: g.salesperson,
        totalSales: g.count,
        pendingCount: g.pending,
        completedCount: g.completed,
        canceledCount: g.canceled,
        totalAmount: g.amount,
        commission,
        commissionVat,
        commissionWithVat: round2(commission + commissionVat),
      };
    })
    .sort((a, b) => b.totalAmount - a.totalAmount);
}

/** One sale's money inputs needed for the report's net-discount + profit math. */
export interface SaleMoneyInput {
  sellingPrice: number;
  totalCostWithInterest: number;
  /** Already-resolved car discount (carDiscount ?? discountSnapshot ?? 0). */
  carDiscount: number;
  /** Live ยอดเบิกต่อคัน (same as claim report); null/undefined → 0. */
  campaignSubsidy?: number | null;
  financeCommission?: number | null;
  salesCommission?: number | null;
  salesExpense?: number | null;
}

export interface SaleMoneyResult {
  campaignSubsidy: number;
  netCarDiscount: number;
  netProfit: number;
}

/**
 * Per-sale money math for the sales-summary report.
 *
 * The selling price is already post-discount, so the car discount is NOT
 * subtracted again here. The campaign subsidy is brand money the dealership
 * receives back, so it is ADDED to net profit. `netCarDiscount` is a display
 * figure (carDiscount − subsidy) and may be negative when the subsidy exceeds
 * the discount given.
 */
export function computeSaleMoney(input: SaleMoneyInput): SaleMoneyResult {
  const campaignSubsidy = input.campaignSubsidy || 0;
  const netCarDiscount = input.carDiscount - campaignSubsidy;
  const netProfit =
    input.sellingPrice -
    input.totalCostWithInterest +
    (input.financeCommission || 0) -
    (input.salesCommission || 0) -
    (input.salesExpense || 0) +
    campaignSubsidy;
  return { campaignSubsidy, netCarDiscount, netProfit };
}

/** SaleStatus values the sales summary report can filter by (mirrors schema.prisma). */
export const SALE_STATUS_FILTER_VALUES = [
  'RESERVED',
  'PREPARING',
  'DELIVERED',
  'COMPLETED',
  'CANCELLED',
] as const;
export type SaleStatusFilter = (typeof SALE_STATUS_FILTER_VALUES)[number];

/**
 * The filter line printed under the date range on the sales summary PDF, e.g.
 * "สถานะ: จองแล้ว · ประเภทรถ: เก๋ง". Empty string when no filter is applied.
 */
export function describeSalesSummaryFilters(filters: {
  status?: string;
  vehicleTypeName?: string;
}): string {
  const parts: string[] = [];
  if (filters.status) {
    const label = SALE_STATUS_LABELS[filters.status as SaleStatusFilter] ?? filters.status;
    parts.push(`สถานะ: ${label}`);
  }
  if (filters.vehicleTypeName) parts.push(`ประเภทรถ: ${filters.vehicleTypeName}`);
  return parts.join(' · ');
}
