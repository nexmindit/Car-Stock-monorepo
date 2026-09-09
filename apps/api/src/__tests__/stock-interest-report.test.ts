import { describe, expect, it } from 'bun:test';
import {
  type StockInterestStockInput,
  resolveStockInterestDisplay,
  resolveStockInterestWindow,
} from '../modules/interest/stock-interest-display';

const today = new Date(2026, 8, 1); // 1 Sep 2026 local

function stock(overrides: Partial<StockInterestStockInput> = {}): StockInterestStockInput {
  return {
    orderDate: new Date(2026, 0, 20),
    arrivalDate: new Date(2026, 0, 22),
    soldDate: null,
    stopInterestCalc: false,
    interestStoppedAt: null,
    debtStatus: 'ACTIVE',
    interestRate: 0.03,
    interestPrincipalBase: 'BASE_COST_ONLY',
    baseCost: 118_504,
    transportCost: 0,
    accessoryCost: 0,
    otherCosts: 0,
    interestPeriods: [],
    ...overrides,
  };
}

describe('resolveStockInterestDisplay', () => {
  it('uses orderDate and accrues to today when there are no periods', () => {
    const row = resolveStockInterestDisplay(stock(), today);
    expect(row.interestStartDate).toEqual(new Date(2026, 0, 20));
    expect(row.interestActionDate).toEqual(new Date(2026, 0, 20));
    expect(row.isCalculating).toBe(true);
    expect(row.daysCount).toBe(224);
    expect(row.currentRate).toBe(3);
    expect(row.principalAmount).toBe(118_504);
    expect(row.accumulatedInterest).toBeCloseTo(118_504 * (3 / 100 / 365) * 224, 6);
  });

  it('after resume, start date follows the new open period not orderDate', () => {
    const row = resolveStockInterestDisplay(
      stock({
        interestPeriods: [
          {
            startDate: new Date(2026, 0, 20),
            endDate: new Date(2026, 5, 1),
            annualRate: 3,
            principalBase: 'BASE_COST_ONLY',
            principalAmount: 118_504,
            calculatedInterest: 1000,
            daysCount: 132,
          },
          {
            startDate: new Date(2026, 7, 15),
            endDate: null,
            annualRate: 3.5,
            principalBase: 'BASE_COST_ONLY',
            principalAmount: 118_504,
            calculatedInterest: 0,
            daysCount: 0,
          },
        ],
      }),
      today
    );
    expect(row.interestStartDate).toEqual(new Date(2026, 7, 15));
    expect(row.interestActionDate).toEqual(new Date(2026, 7, 15));
    expect(row.isCalculating).toBe(true);
    expect(row.daysCount).toBe(17);
    expect(row.currentRate).toBe(3.5);
    expect(row.accumulatedInterest).toBeGreaterThan(1000);
  });

  it('when stopped, uses the last closed period for start/days and keeps closed interest', () => {
    const row = resolveStockInterestDisplay(
      stock({
        stopInterestCalc: true,
        interestStoppedAt: new Date(2026, 5, 1),
        interestPeriods: [
          {
            startDate: new Date(2026, 0, 20),
            endDate: new Date(2026, 5, 1),
            annualRate: 3,
            principalBase: 'BASE_COST_ONLY',
            principalAmount: 118_504,
            calculatedInterest: 4321.5,
            daysCount: 132,
          },
        ],
      }),
      today
    );
    expect(row.interestStartDate).toEqual(new Date(2026, 0, 20));
    expect(row.interestActionDate).toEqual(new Date(2026, 5, 1));
    expect(row.interestStoppedAt).toEqual(new Date(2026, 5, 1));
    expect(row.isCalculating).toBe(false);
    expect(row.daysCount).toBe(132);
    expect(row.currentRate).toBe(3);
    expect(row.accumulatedInterest).toBe(4321.5);
  });

  it('when several closed periods share a start date, uses the one that ended last', () => {
    const row = resolveStockInterestDisplay(
      stock({
        orderDate: null,
        arrivalDate: null,
        stopInterestCalc: true,
        interestStoppedAt: new Date(2026, 7, 27),
        interestPeriods: [
          {
            startDate: new Date(2026, 7, 17),
            endDate: new Date(2026, 7, 16),
            annualRate: 0,
            principalBase: 'BASE_COST_ONLY',
            principalAmount: 1_500_000,
            calculatedInterest: 0,
            daysCount: 1,
          },
          {
            startDate: new Date(2026, 7, 17),
            endDate: new Date(2026, 7, 27),
            annualRate: 2.5,
            principalBase: 'BASE_COST_ONLY',
            principalAmount: 1_500_000,
            calculatedInterest: 1027.4,
            daysCount: 10,
          },
        ],
      }),
      today
    );
    expect(row.interestStartDate).toEqual(new Date(2026, 7, 17));
    expect(row.interestActionDate).toEqual(new Date(2026, 7, 27));
    expect(row.isCalculating).toBe(false);
    expect(row.daysCount).toBe(10);
    expect(row.currentRate).toBe(2.5);
    expect(row.accumulatedInterest).toBe(1027.4);
  });

  it('uses the period start when orderDate and arrivalDate are missing', () => {
    const row = resolveStockInterestDisplay(
      stock({
        orderDate: null,
        arrivalDate: null,
        stopInterestCalc: true,
        interestStoppedAt: new Date(2026, 7, 20),
        interestPeriods: [
          {
            startDate: new Date(2026, 7, 1),
            endDate: new Date(2026, 7, 20),
            annualRate: 2.5,
            principalBase: 'TOTAL_COST',
            principalAmount: 200_000,
            calculatedInterest: 260,
            daysCount: 19,
          },
        ],
      }),
      today
    );
    expect(row.interestStartDate).toEqual(new Date(2026, 7, 1));
    expect(row.interestActionDate).toEqual(new Date(2026, 7, 20));
    expect(row.isCalculating).toBe(false);
    expect(row.daysCount).toBe(19);
    expect(row.currentRate).toBe(2.5);
    expect(row.accumulatedInterest).toBe(260);
  });
});

// The report's date range is a *window*: only interest accrued between the two
// dates counts. Ground truth below is the module formula by hand:
// principal x (rate/100/365) x days, with days counted exclusively (daysBetween).
describe('resolveStockInterestWindow', () => {
  const rate3PerDay = 118_504 * (3 / 100 / 365);

  it('counts only the days inside the window, not the whole time in stock', () => {
    // Accruing since 20 Jan; window 16 Aug - 15 Sep; today is 1 Sep so accrual
    // stops there. 16 Aug -> 1 Sep = 16 days.
    const w = resolveStockInterestWindow(
      stock(),
      today,
      new Date(2026, 7, 16),
      new Date(2026, 8, 15)
    );
    expect(w.daysCount).toBe(16);
    expect(w.interest).toBeCloseTo(rate3PerDay * 16, 6);
    // ...and that is far below the 224-day lifetime figure the report used to show.
    expect(w.interest).toBeLessThan(
      resolveStockInterestDisplay(stock(), today).accumulatedInterest
    );
  });

  it('returns zero for a stock that had not started accruing yet', () => {
    const w = resolveStockInterestWindow(
      stock(),
      today,
      new Date(2026, 0, 1),
      new Date(2026, 0, 10)
    );
    expect(w).toEqual({ daysCount: 0, interest: 0 });
  });

  it('returns zero for a stock that stopped accruing before the window', () => {
    const stopped = stock({ stopInterestCalc: true, interestStoppedAt: new Date(2026, 6, 1) });
    const w = resolveStockInterestWindow(
      stopped,
      today,
      new Date(2026, 7, 16),
      new Date(2026, 8, 15)
    );
    expect(w).toEqual({ daysCount: 0, interest: 0 });
  });

  it('pro-rates a closed period the window only partly covers', () => {
    const withClosedPeriod = stock({
      interestPeriods: [
        {
          startDate: new Date(2026, 0, 20),
          endDate: new Date(2026, 5, 1),
          annualRate: 3,
          principalBase: 'BASE_COST_ONLY',
          principalAmount: 118_504,
          calculatedInterest: 1000,
          daysCount: 132,
        },
      ],
    });
    // 1 May -> 1 Jun = 31 days, so the stored 1000 for the full period must not be reused.
    const w = resolveStockInterestWindow(
      withClosedPeriod,
      today,
      new Date(2026, 4, 1),
      new Date(2026, 5, 1)
    );
    expect(w.daysCount).toBe(31);
    expect(w.interest).toBeCloseTo(rate3PerDay * 31, 6);
    expect(w.interest).not.toBe(1000);
  });

  it('an unbounded window equals the lifetime accumulated interest', () => {
    const resumed = stock({
      interestPeriods: [
        {
          startDate: new Date(2026, 0, 20),
          endDate: new Date(2026, 5, 1),
          annualRate: 3,
          principalBase: 'BASE_COST_ONLY',
          principalAmount: 118_504,
          calculatedInterest: 1000,
          daysCount: 132,
        },
        {
          startDate: new Date(2026, 7, 15),
          endDate: null,
          annualRate: 3.5,
          principalBase: 'BASE_COST_ONLY',
          principalAmount: 118_504,
          calculatedInterest: 0,
          daysCount: 0,
        },
      ],
    });
    const w = resolveStockInterestWindow(resumed, today, null, null);
    // closed period keeps its stored 1000, open period accrues 15 Aug -> 1 Sep = 17 days
    expect(w.interest).toBeCloseTo(1000 + 118_504 * (3.5 / 100 / 365) * 17, 6);
    expect(w.interest).toBeCloseTo(
      resolveStockInterestDisplay(resumed, today).accumulatedInterest,
      6
    );
  });
});
