import { describe, expect, it } from 'bun:test';
import { groupPaymentsByDay } from '../modules/pdf/helpers';

describe('groupPaymentsByDay (รายงานรายวันรับเงิน รวมประจำวัน)', () => {
  it('subtotals each document day instead of one total for the whole range', () => {
    const days = groupPaymentsByDay([
      { paymentDate: new Date('2026-10-08T00:00:00Z'), amount: 1000, baseAmount: 1000, transferAmount: 1000 },
      { paymentDate: new Date('2026-10-08T00:00:00Z'), amount: 2000, baseAmount: 2000, cashAmount: 2000 },
      { paymentDate: '2026-10-09T00:00:00.000Z', amount: 500, baseAmount: 500, cashAmount: 500 },
    ]);
    expect(days.map((d) => d.date)).toEqual(['2026-10-08', '2026-10-09']);
    expect(days[0].summary).toMatchObject({ totalCount: 2, amount: 3000, cashAmount: 2000, transferAmount: 1000 });
    expect(days[1].summary).toMatchObject({ totalCount: 1, amount: 500, cashAmount: 500, transferAmount: 0 });
  });

  it('keys by the stored calendar day, not the server local day', () => {
    // midnight UTC is 07:00 Bangkok but 19:00 the previous day in UTC-5
    const [day] = groupPaymentsByDay([{ paymentDate: '2026-10-08T00:00:00.000Z', amount: 1 }]);
    expect(day.date).toBe('2026-10-08');
  });
});
