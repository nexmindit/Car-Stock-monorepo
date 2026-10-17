import { describe, expect, test } from 'bun:test';
import { campaignDay, campaignWindow } from '../lib/campaignDate';
import { claimCampaignFor } from '../modules/reports/campaign-claim.helpers';

// Campaign dates come from the form as 'YYYY-MM-DD' → stored as UTC midnight.
const END = new Date('2026-10-31');
const START = new Date('2026-10-01');
const bkk = (s: string) => new Date(`${s}+07:00`);

describe('campaignDay', () => {
  test('maps a Bangkok instant to its calendar day (UTC-midnight encoding)', () => {
    expect(campaignDay(bkk('2026-10-31T10:00:00')).toISOString()).toBe(END.toISOString());
    expect(campaignDay(bkk('2026-10-31T23:59:59')).toISOString()).toBe(END.toISOString());
    // 00:30 Bangkok on Nov 1 is still Oct 31 in UTC — must count as Nov 1.
    expect(campaignDay(bkk('2026-11-01T00:30:00')).toISOString()).toBe(
      new Date('2026-11-01').toISOString()
    );
  });

  test('is idempotent on stored campaign dates', () => {
    expect(campaignDay(END).toISOString()).toBe(END.toISOString());
  });

  test('a 10:00 sale on the last day is inside the campaign (was cut off at 07:00)', () => {
    const day = campaignDay(bkk('2026-10-31T10:00:00'));
    expect(END >= day).toBe(true);
    expect(START <= day).toBe(true);
  });
});

describe('campaignWindow', () => {
  const w = campaignWindow(START, END);
  const inside = (t: Date) => t >= w.gte && t < w.lt;

  test('covers the whole first and last Bangkok day', () => {
    expect(inside(bkk('2026-10-01T00:00:00'))).toBe(true);
    expect(inside(bkk('2026-10-31T23:59:59'))).toBe(true);
  });

  test('excludes the day before and the day after', () => {
    expect(inside(bkk('2026-09-30T23:59:59'))).toBe(false);
    expect(inside(bkk('2026-11-01T00:00:00'))).toBe(false);
    expect(inside(bkk('2026-11-01T06:00:00'))).toBe(false); // old +24h rule leaked this
  });
});

describe('claimCampaignFor', () => {
  const vm = { id: 'vm1', brand: 'CHERY', model: 'V23', variant: null, price: 500_000 };
  const candidate = (name: string, status: string) => ({
    name,
    status,
    startDate: START,
    endDate: END,
    vehicleModels: [{ vehicleModelId: 'vm1', formulas: [] }],
  });
  const pick = (saleDate: Date, catalog: ReturnType<typeof candidate>[]) =>
    claimCampaignFor({ campaign: null, vehicleModel: vm, stock: null, saleDate }, catalog);

  test('ignores DRAFT and ENDED campaigns — only ACTIVE ones are claimable', () => {
    const at = bkk('2026-10-15T12:00:00');
    expect(pick(at, [candidate('draft clone', 'DRAFT')])).toBeNull();
    expect(pick(at, [candidate('ended', 'ENDED')])).toBeNull();
    expect(pick(at, [candidate('draft', 'DRAFT'), candidate('live', 'ACTIVE')])?.name).toBe('live');
  });

  test('matches a sale late on the last day', () => {
    expect(pick(bkk('2026-10-31T18:00:00'), [candidate('live', 'ACTIVE')])?.name).toBe('live');
  });
});
