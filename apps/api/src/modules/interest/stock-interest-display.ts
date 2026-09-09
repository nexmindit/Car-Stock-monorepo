import {
  canAccrueWithoutPeriods,
  daysBetween,
  implicitAccrualEndDate,
  parseDay,
} from './interest.dates';

export type StockInterestPeriodInput = {
  startDate: Date;
  endDate: Date | null;
  annualRate: number;
  principalBase: string;
  principalAmount: number;
  calculatedInterest: number;
  daysCount: number;
};

export type StockInterestStockInput = {
  orderDate: Date | null;
  arrivalDate: Date | null;
  soldDate: Date | null;
  stopInterestCalc: boolean;
  interestStoppedAt: Date | null;
  debtStatus: string;
  /** Fraction, e.g. 0.03 for 3%. */
  interestRate: number;
  interestPrincipalBase: string;
  baseCost: number;
  transportCost: number;
  accessoryCost: number;
  otherCosts: number;
  interestPeriods: StockInterestPeriodInput[];
};

export type StockInterestWindow = {
  /** Days the stock actually accrued inside the window (exclusive count, like the rest of the module). */
  daysCount: number;
  /** Interest accrued inside the window only. */
  interest: number;
};

export type StockInterestDisplay = {
  interestStartDate: Date | null;
  interestStoppedAt: Date | null;
  /** Start date while accruing; stop date when stopped/paid off. */
  interestActionDate: Date | null;
  isCalculating: boolean;
  daysCount: number;
  currentRate: number;
  principalBase: string;
  principalAmount: number;
  accumulatedInterest: number;
};

function calculateInterest(principal: number, annualRatePercent: number, days: number): number {
  return principal * (annualRatePercent / 100 / 365) * days;
}

function closedPeriodDays(period: StockInterestPeriodInput): number {
  if (period.daysCount > 0) return period.daysCount;
  if (!period.endDate) return 0;
  return daysBetween(period.startDate, period.endDate);
}

function latestPeriod(
  periods: StockInterestPeriodInput[]
): StockInterestPeriodInput | undefined {
  const active = periods.find((p) => !p.endDate);
  if (active) return active;
  return [...periods].sort((a, b) => {
    const endDelta = (b.endDate?.getTime() ?? 0) - (a.endDate?.getTime() ?? 0);
    if (endDelta !== 0) return endDelta;
    return b.startDate.getTime() - a.startDate.getTime();
  })[0];
}

type AccrualSegment = {
  start: Date;
  end: Date;
  annualRate: number;
  principalAmount: number;
  /** Stored interest for a closed period, reused when the window covers it whole. */
  storedInterest: number | null;
};

/**
 * Every stretch of time this stock accrued interest, as (start, end, rate, principal).
 * Mirrors what resolveStockInterestDisplay sums into `accumulatedInterest`:
 * closed periods always count, the open period only while still accruing, and a
 * stock with no periods at all falls back to one implicit stretch.
 */
function accrualSegments(stock: StockInterestStockInput, today: Date): AccrualSegment[] {
  const canAccrueActive = !stock.stopInterestCalc && stock.debtStatus !== 'PAID_OFF';
  const soldOrToday = stock.soldDate || today;
  const segments: AccrualSegment[] = [];

  for (const period of stock.interestPeriods) {
    if (period.endDate) {
      segments.push({
        start: period.startDate,
        end: period.endDate,
        annualRate: period.annualRate,
        principalAmount: period.principalAmount,
        storedInterest: period.calculatedInterest,
      });
    } else if (canAccrueActive) {
      segments.push({
        start: period.startDate,
        end: soldOrToday,
        annualRate: period.annualRate,
        principalAmount: period.principalAmount,
        storedInterest: null,
      });
    }
  }

  if (segments.length === 0 && stock.interestPeriods.length === 0) {
    const fallbackStart = stock.orderDate || stock.arrivalDate;
    if (fallbackStart && canAccrueWithoutPeriods(stock)) {
      const totalCost =
        stock.baseCost + stock.transportCost + stock.accessoryCost + stock.otherCosts;
      segments.push({
        start: fallbackStart,
        end: implicitAccrualEndDate({
          stopInterestCalc: stock.stopInterestCalc,
          interestStoppedAt: stock.interestStoppedAt,
          soldDate: stock.soldDate,
          today,
        }),
        annualRate: stock.interestRate * 100,
        principalAmount:
          stock.interestPrincipalBase === 'BASE_COST_ONLY' ? stock.baseCost : totalCost,
        storedInterest: null,
      });
    }
  }

  return segments;
}

/**
 * Interest accrued *inside* [windowStart, windowEnd] only — the per-cycle view the
 * stock-interest report needs, instead of the lifetime total.
 * Each accrual stretch is clipped to the window and re-priced pro-rata; a stretch the
 * window covers whole keeps its stored interest so a wide-open window still sums to
 * exactly `resolveStockInterestDisplay(...).accumulatedInterest`.
 * A null bound means "unbounded on that side".
 */
export function resolveStockInterestWindow(
  stock: StockInterestStockInput,
  today: Date,
  windowStart: Date | null,
  windowEnd: Date | null
): StockInterestWindow {
  const startBound = windowStart ? parseDay(windowStart).getTime() : Number.NEGATIVE_INFINITY;
  const endBound = windowEnd ? parseDay(windowEnd).getTime() : Number.POSITIVE_INFINITY;

  let daysCount = 0;
  let interest = 0;

  for (const seg of accrualSegments(stock, today)) {
    const segStart = parseDay(seg.start).getTime();
    const segEnd = parseDay(seg.end).getTime();
    const from = Math.max(segStart, startBound);
    const to = Math.min(segEnd, endBound);
    if (to <= from) continue; // no overlap (or a same-day touch, which is 0 days here)

    const days = daysBetween(new Date(from), new Date(to));
    daysCount += days;
    const coversWholeSegment = from === segStart && to === segEnd;
    interest +=
      coversWholeSegment && seg.storedInterest !== null
        ? seg.storedInterest
        : calculateInterest(seg.principalAmount, seg.annualRate, days);
  }

  return { daysCount, interest };
}

/**
 * Display fields for stock-interest list and report rows.
 * Start date / days / rate / principal follow the current or last period;
 * accumulated interest still sums every period.
 */
export function resolveStockInterestDisplay(
  stock: StockInterestStockInput,
  today: Date
): StockInterestDisplay {
  const totalCost =
    stock.baseCost + stock.transportCost + stock.accessoryCost + stock.otherCosts;
  const fallbackPrincipal =
    stock.interestPrincipalBase === 'BASE_COST_ONLY' ? stock.baseCost : totalCost;
  const fallbackRate = stock.interestRate * 100;
  const fallbackStart = stock.orderDate || stock.arrivalDate;
  const soldOrToday = stock.soldDate || today;
  const implicitEnd = implicitAccrualEndDate({
    stopInterestCalc: stock.stopInterestCalc,
    interestStoppedAt: stock.interestStoppedAt,
    soldDate: stock.soldDate,
    today,
  });
  const canAccrueActive = !stock.stopInterestCalc && stock.debtStatus !== 'PAID_OFF';
  const periods = stock.interestPeriods;
  const active = periods.find((p) => !p.endDate);

  let accumulatedInterest = 0;
  for (const period of periods) {
    if (period.endDate) {
      accumulatedInterest += period.calculatedInterest;
    }
  }
  if (active && canAccrueActive) {
    accumulatedInterest += calculateInterest(
      active.principalAmount,
      active.annualRate,
      daysBetween(active.startDate, soldOrToday)
    );
  } else if (periods.length === 0 && canAccrueWithoutPeriods(stock) && fallbackStart) {
    accumulatedInterest = calculateInterest(
      fallbackPrincipal,
      fallbackRate,
      daysBetween(fallbackStart, implicitEnd)
    );
  }

  const display = latestPeriod(periods);
  const interestStartDate = display?.startDate ?? fallbackStart;
  const interestStoppedAt =
    stock.interestStoppedAt || display?.endDate || stock.soldDate || null;
  const interestActionDate = canAccrueActive
    ? interestStartDate
    : interestStoppedAt || interestStartDate;

  if (display) {
    const daysCount = display.endDate
      ? closedPeriodDays(display)
      : daysBetween(display.startDate, canAccrueActive ? soldOrToday : implicitEnd);
    return {
      interestStartDate: display.startDate,
      interestStoppedAt,
      interestActionDate,
      isCalculating: canAccrueActive,
      daysCount,
      currentRate: display.annualRate,
      principalBase: display.principalBase,
      principalAmount: display.principalAmount,
      accumulatedInterest,
    };
  }

  return {
    interestStartDate: fallbackStart,
    interestStoppedAt,
    interestActionDate,
    isCalculating: canAccrueActive,
    daysCount: fallbackStart ? daysBetween(fallbackStart, implicitEnd) : 0,
    currentRate: fallbackRate,
    principalBase: stock.interestPrincipalBase,
    principalAmount: fallbackPrincipal,
    accumulatedInterest,
  };
}
