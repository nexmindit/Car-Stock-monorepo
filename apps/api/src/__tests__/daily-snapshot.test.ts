import { describe, expect, it } from 'bun:test';
import { buildDailySnapshot } from '../modules/reports/reports.service';

type ReservationFixture = { vehicleModelId: string | null; modelName: string; color: string };
type StockFixture = {
  vehicleModelId: string;
  modelName: string;
  color: string;
  status: 'AVAILABLE' | 'DEMO';
};

describe('buildDailySnapshot pivot', () => {
  it('groups reservations and stock by model × color and computes required = max(0, res - avail)', () => {
    const reservations: ReservationFixture[] = [
      { vehicleModelId: 'm1', modelName: 'NETA V', color: 'WHITE' },
      { vehicleModelId: 'm1', modelName: 'NETA V', color: 'WHITE' },
      { vehicleModelId: 'm1', modelName: 'NETA V', color: 'GRAY' },
      { vehicleModelId: 'm2', modelName: 'NETA U', color: 'WHITE' },
    ];
    const stocks: StockFixture[] = [
      { vehicleModelId: 'm1', modelName: 'NETA V', color: 'WHITE', status: 'AVAILABLE' },
      { vehicleModelId: 'm1', modelName: 'NETA V', color: 'WHITE', status: 'DEMO' },
      { vehicleModelId: 'm2', modelName: 'NETA U', color: 'WHITE', status: 'AVAILABLE' },
      { vehicleModelId: 'm2', modelName: 'NETA U', color: 'WHITE', status: 'AVAILABLE' },
    ];

    const result = buildDailySnapshot({ reservations, stocks, date: '2026-04-17' });

    expect(result.colors).toEqual(['Gray', 'White']);
    const m1 = result.models.find((m) => m.vehicleModelId === 'm1');
    if (!m1) throw new Error('m1 missing');
    expect(m1.reservationsByColor).toEqual({ White: 2, Gray: 1 });
    expect(m1.reservationsTotal).toBe(3);
    expect(m1.availableByColor).toEqual({ White: 1 });
    expect(m1.availableTotal).toBe(1);
    expect(m1.demoByColor).toEqual({ White: 1 });
    expect(m1.demoTotal).toBe(1);
    expect(m1.requiredByColor).toEqual({ White: 1, Gray: 1 });
    expect(m1.requiredTotal).toBe(2);

    const m2 = result.models.find((m) => m.vehicleModelId === 'm2');
    if (!m2) throw new Error('m2 missing');
    expect(m2.requiredByColor).toEqual({ White: 0 });
    expect(m2.requiredTotal).toBe(0);

    expect(result.grand).toEqual({ reservations: 4, available: 3, demo: 1, required: 2 });
    expect(result.unassignedReservations).toBe(0);
  });

  it('skips reservations with null vehicleModelId and counts them', () => {
    const reservations: ReservationFixture[] = [
      { vehicleModelId: null, modelName: '', color: 'BLACK' },
      { vehicleModelId: 'm1', modelName: 'NETA V', color: 'WHITE' },
    ];
    const stocks: StockFixture[] = [];
    const result = buildDailySnapshot({ reservations, stocks, date: '2026-04-17' });
    expect(result.models.length).toBe(1);
    expect(result.unassignedReservations).toBe(1);
  });

  it('merges colors that differ only by letter case (stock data has White/WHITE, Orange/orange)', () => {
    const reservations: ReservationFixture[] = [
      { vehicleModelId: 'm1', modelName: 'V23', color: 'orange' },
      { vehicleModelId: 'm1', modelName: 'V23', color: 'PURPLE' },
    ];
    const stocks: StockFixture[] = [
      { vehicleModelId: 'm1', modelName: 'V23', color: 'Orange', status: 'AVAILABLE' },
      { vehicleModelId: 'm1', modelName: 'V23', color: ' WHITE ', status: 'AVAILABLE' },
      { vehicleModelId: 'm1', modelName: 'V23', color: 'White', status: 'AVAILABLE' },
      { vehicleModelId: 'm1', modelName: 'V23', color: 'Purple', status: 'DEMO' },
    ];
    const result = buildDailySnapshot({ reservations, stocks, date: '2026-10-16' });
    expect(result.colors).toEqual(['Orange', 'Purple', 'White']);
    const m1 = result.models[0];
    expect(m1.reservationsByColor).toEqual({ Orange: 1, Purple: 1 });
    expect(m1.availableByColor).toEqual({ Orange: 1, White: 2 });
    expect(m1.demoByColor).toEqual({ Purple: 1 });
    expect(m1.requiredByColor).toEqual({ Orange: 0, Purple: 1, White: 0 });
  });

  it('handles empty inputs', () => {
    const result = buildDailySnapshot({ reservations: [], stocks: [], date: '2026-04-17' });
    expect(result.colors).toEqual([]);
    expect(result.models).toEqual([]);
    expect(result.grand).toEqual({ reservations: 0, available: 0, demo: 0, required: 0 });
  });
});
