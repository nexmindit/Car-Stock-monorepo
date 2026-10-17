import { daysBetween } from './interest.dates';

/**
 * Interest for one period, rounded like the Decimal(15,2) column it lands in.
 * Same math as InterestService.calculateInterestForPeriod (principal × rate% ÷ 365 × days).
 */
export function periodInterest(
  principalAmount: number,
  annualRatePercent: number,
  days: number
): number {
  return Math.round(principalAmount * (annualRatePercent / 100 / 365) * days * 100) / 100;
}

/**
 * Recompute the stored daysCount / calculatedInterest of every CLOSED period from its
 * own dates, rate and principal. The open period is skipped — it is always computed live.
 */
export function recomputeClosedPeriods(
  periods: Array<{
    id: string;
    startDate: Date;
    endDate: Date | null;
    principalAmount: number;
    annualRate: number;
  }>
): Array<{ id: string; daysCount: number; calculatedInterest: number }> {
  return periods
    .filter((p): p is typeof p & { endDate: Date } => p.endDate !== null)
    .map((p) => {
      const daysCount = daysBetween(p.startDate, p.endDate);
      return {
        id: p.id,
        daysCount,
        calculatedInterest: periodInterest(p.principalAmount, p.annualRate, daysCount),
      };
    });
}
