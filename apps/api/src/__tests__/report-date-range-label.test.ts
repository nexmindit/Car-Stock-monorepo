import { describe, expect, test } from 'bun:test';
import { formatThaiDate, formatThaiDateRange } from '../modules/pdf/helpers';

// The shops (and their Windows PCs) run on Bangkok time.
process.env.TZ = 'Asia/Bangkok';

describe('report header date range', () => {
  test('picking 23–23 prints 23 ถึง 23, not 23 ถึง 24', () => {
    expect(formatThaiDateRange('2026-11-23', '2026-11-23', 'numeric', ' ถึง ')).toBe(
      '23/11/2569 ถึง 23/11/2569'
    );
  });

  test('the old label source (filter end instant) is the next day in Bangkok', () => {
    // Documents why the label must not format the query's end-of-day instant.
    expect(formatThaiDate(new Date('2026-11-23T23:59:59.999Z'), 'numeric')).toBe('24/11/2569');
  });

  test('missing either bound means the whole range', () => {
    expect(formatThaiDateRange(undefined, '2026-11-23', 'short', ' - ')).toBe('ทั้งหมด');
  });
});
