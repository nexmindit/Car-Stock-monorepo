// apps/api/src/__tests__/sales-summary-breakdown.test.ts
import { describe, expect, test } from 'bun:test';
import {
  type SalespersonSaleInput,
  buildSalespersonBreakdown,
} from '../modules/reports/sales-summary.helpers';

const sale = (over: Partial<SalespersonSaleInput>): SalespersonSaleInput => ({
  salesperson: 'สมชาย ใจดี',
  salespersonId: 'u1',
  totalAmount: 0,
  status: 'COMPLETED',
  salesCommission: 0,
  ...over,
});

describe('buildSalespersonBreakdown', () => {
  // The bug (customer B6): commission must reflect the salesCommission the user
  // typed on each sale — NOT a hardcoded 1% of the sales amount.
  test('commission sums the entered salesCommission, not 1% of amount', () => {
    const rows = buildSalespersonBreakdown([
      sale({ totalAmount: 700_000, salesCommission: 1_000, status: 'COMPLETED' }),
      sale({ totalAmount: 500_000, salesCommission: 2_000, status: 'RESERVED' }),
    ]);

    expect(rows).toHaveLength(1);
    const r = rows[0];
    // entered: 1,000 + 2,000 = 3,000  (NOT 1% of 1,200,000 = 12,000)
    expect(r.commission).toBe(3_000);
    expect(r.commissionSurcharge).toBe(240); // 8% of 3,000
    expect(r.commissionVat).toBe(210); // VAT 7% of 3,000
    expect(r.commissionWithVat).toBe(3_450);
    expect(r.totalAmount).toBe(1_200_000);
  });

  test('groups by salesperson and counts statuses', () => {
    const rows = buildSalespersonBreakdown([
      sale({ salesperson: 'เอ', salespersonId: 'a', totalAmount: 300_000, status: 'RESERVED' }),
      sale({ salesperson: 'เอ', salespersonId: 'a', totalAmount: 200_000, status: 'DELIVERED' }),
      sale({ salesperson: 'บี', salespersonId: 'b', totalAmount: 100_000, status: 'CANCELLED' }),
    ]);

    const a = rows.find((r) => r.id === 'a')!;
    expect(a.totalSales).toBe(2);
    expect(a.pendingCount).toBe(1); // RESERVED
    expect(a.completedCount).toBe(1); // DELIVERED
    expect(a.canceledCount).toBe(0);

    const b = rows.find((r) => r.id === 'b')!;
    expect(b.canceledCount).toBe(1); // CANCELLED
  });

  test('sorts salespeople by totalAmount descending', () => {
    const rows = buildSalespersonBreakdown([
      sale({ salesperson: 'น้อย', salespersonId: 'small', totalAmount: 100_000 }),
      sale({ salesperson: 'มาก', salespersonId: 'big', totalAmount: 900_000 }),
    ]);
    expect(rows.map((r) => r.id)).toEqual(['big', 'small']);
  });
});
