/**
 * Campaign.startDate / endDate are date-only: the form sends 'YYYY-MM-DD', stored as
 * UTC midnight of that calendar day. The dealership runs on Bangkok time, so "is this
 * moment inside the campaign?" must compare Bangkok calendar days — comparing raw
 * instants ended every campaign at 07:00 on its last day.
 */
const BANGKOK_OFFSET_MS = 7 * 60 * 60 * 1000; // ponytail: Thailand has no DST
const DAY_MS = 24 * 60 * 60 * 1000;

/** Bangkok calendar day of `at`, encoded like Campaign dates (UTC midnight). */
export function campaignDay(at: Date): Date {
  const shifted = new Date(at.getTime() + BANGKOK_OFFSET_MS);
  return new Date(Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate()));
}

/** Half-open instant range [first day 00:00 ICT, day after last 00:00 ICT) for timestamp filters. */
export function campaignWindow(startDate: Date, endDate: Date): { gte: Date; lt: Date } {
  return {
    gte: new Date(campaignDay(startDate).getTime() - BANGKOK_OFFSET_MS),
    lt: new Date(campaignDay(endDate).getTime() + DAY_MS - BANGKOK_OFFSET_MS),
  };
}
