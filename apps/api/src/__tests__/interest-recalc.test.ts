import { describe, expect, test } from 'bun:test';
import { periodInterest, recomputeClosedPeriods } from '../modules/interest/interest.recalc';

const period = (over: Partial<Parameters<typeof recomputeClosedPeriods>[0][number]> = {}) => ({
  id: 'p1',
  startDate: new Date(2026, 0, 1),
  endDate: new Date(2026, 0, 31) as Date | null,
  principalAmount: 1_000_000,
  annualRate: 7.3,
  ...over,
});

describe('periodInterest', () => {
  test('principal × rate% ÷ 365 × days, 2dp', () => {
    // 1,000,000 × 7.3% / 365 = 200/day
    expect(periodInterest(1_000_000, 7.3, 30)).toBe(6000);
    expect(periodInterest(1_000_000, 5, 1)).toBe(136.99);
    expect(periodInterest(1_000_000, 5, 0)).toBe(0);
  });
});

describe('recomputeClosedPeriods', () => {
  test('recomputes days (exclusive) and interest from the stored dates/rate/principal', () => {
    expect(recomputeClosedPeriods([period()])).toEqual([
      { id: 'p1', daysCount: 30, calculatedInterest: 6000 },
    ]);
  });

  test('skips the open (current) period — it is computed live', () => {
    const rows = recomputeClosedPeriods([period(), period({ id: 'open', endDate: null })]);
    expect(rows.map((r) => r.id)).toEqual(['p1']);
  });

  test('fixes a stale stored amount after the rate row was edited', () => {
    const [row] = recomputeClosedPeriods([period({ annualRate: 3.65 })]);
    expect(row.calculatedInterest).toBe(3000);
  });

  test('handles a same-day period as zero', () => {
    const d = new Date(2026, 4, 5);
    expect(recomputeClosedPeriods([period({ startDate: d, endDate: d })])[0]).toEqual({
      id: 'p1',
      daysCount: 0,
      calculatedInterest: 0,
    });
  });
});
