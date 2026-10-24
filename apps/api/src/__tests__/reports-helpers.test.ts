import { describe, expect, it } from 'bun:test';
import { splitVat } from '../modules/reports/reports.service';
import {
  SALE_STATUS_FILTER_VALUES,
  computeSaleMoney,
  describeSalesSummaryFilters,
} from '../modules/reports/sales-summary.helpers';

describe('splitVat', () => {
  it('returns zeros for gross = 0', () => {
    expect(splitVat(0)).toEqual({ net: 0, vat: 0, gross: 0 });
  });

  it('clamps negative gross to zero', () => {
    expect(splitVat(-100)).toEqual({ net: 0, vat: 0, gross: 0 });
  });

  it('matches Excel row 3 (baseCost=466650)', () => {
    const result = splitVat(466650);
    expect(result.net).toBe(436121.5);
    expect(result.vat).toBe(30528.5);
    expect(result.gross).toBe(466650);
  });

  it('matches Excel row 4 (baseCost=521000)', () => {
    const result = splitVat(521000);
    expect(result.net).toBe(486915.89);
    expect(result.vat).toBe(34084.11);
    expect(result.gross).toBe(521000);
  });

  it('net + vat === gross invariant holds for many values', () => {
    for (const gross of [100, 999.99, 12345.67, 1_000_000, 7]) {
      const { net, vat } = splitVat(gross);
      expect(Math.round((net + vat) * 100) / 100).toBe(gross);
    }
  });
});

describe('computeSaleMoney', () => {
  it('uses the caller-supplied live claim total as campaignSubsidy', () => {
    const r = computeSaleMoney({
      sellingPrice: 1_000_000,
      totalCostWithInterest: 900_000,
      carDiscount: 30_000,
      campaignSubsidy: 50_000, // live claim after formula edit (snapshot would have been 20k)
      financeCommission: 0,
      salesCommission: 0,
      salesExpense: 0,
    });
    expect(r.campaignSubsidy).toBe(50_000);
    expect(r.netCarDiscount).toBe(-20_000);
    expect(r.netProfit).toBe(150_000); // 100,000 + 50,000
  });

  it('folds the subsidy into net profit and nets the car discount', () => {
    const r = computeSaleMoney({
      sellingPrice: 1_000_000,
      totalCostWithInterest: 900_000,
      carDiscount: 30_000,
      campaignSubsidy: 20_000,
      financeCommission: 15_000,
      salesCommission: 5_000,
      salesExpense: 3_000,
    });
    // 1,000,000 − 900,000 + 15,000 − 5,000 − 3,000 + 20,000 = 127,000
    expect(r.netProfit).toBe(127_000);
    expect(r.netCarDiscount).toBe(10_000); // 30,000 − 20,000
    expect(r.campaignSubsidy).toBe(20_000);
  });

  it('treats a null subsidy as 0 (no campaign / historical sale)', () => {
    const r = computeSaleMoney({
      sellingPrice: 1_000_000,
      totalCostWithInterest: 900_000,
      carDiscount: 30_000,
      campaignSubsidy: null,
      financeCommission: null,
      salesCommission: null,
      salesExpense: null,
    });
    expect(r.netProfit).toBe(100_000); // unchanged by subsidy
    expect(r.netCarDiscount).toBe(30_000); // equals gross discount
    expect(r.campaignSubsidy).toBe(0);
  });

  it('allows a negative net car-discount when subsidy exceeds the discount', () => {
    const r = computeSaleMoney({
      sellingPrice: 500_000,
      totalCostWithInterest: 450_000,
      carDiscount: 10_000,
      campaignSubsidy: 25_000,
    });
    expect(r.netCarDiscount).toBe(-15_000); // 10,000 − 25,000
    expect(r.netProfit).toBe(75_000); // 50,000 + 25,000
    expect(r.campaignSubsidy).toBe(25_000);
  });
});

describe('describeSalesSummaryFilters', () => {
  it('is empty when no filter is applied', () => {
    expect(describeSalesSummaryFilters({})).toBe('');
  });

  it('labels every SaleStatus in Thai', () => {
    for (const status of SALE_STATUS_FILTER_VALUES) {
      const text = describeSalesSummaryFilters({ status });
      expect(text.startsWith('สถานะ: ')).toBe(true);
      expect(text).not.toContain(status);
    }
  });

  it('joins status and vehicle type name', () => {
    expect(describeSalesSummaryFilters({ status: 'RESERVED', vehicleTypeName: 'เก๋ง' })).toBe(
      'สถานะ: จองแล้ว · ประเภทรถ: เก๋ง'
    );
    expect(describeSalesSummaryFilters({ vehicleTypeName: 'มอเตอร์ไซค์' })).toBe(
      'ประเภทรถ: มอเตอร์ไซค์'
    );
  });
});
