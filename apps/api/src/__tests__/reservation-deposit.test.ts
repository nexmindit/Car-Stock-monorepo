import { describe, expect, it } from 'bun:test';
import { reservationAmounts, uniqueColors } from '../modules/sales/reservation-deposit.helpers';

describe('reservationAmounts', () => {
  it('records the deposit as paid and leaves the rest of the car price outstanding', () => {
    expect(reservationAmounts({ totalAmount: 1_000_000, depositAmount: 20_000 })).toEqual({
      totalAmount: 1_000_000,
      depositAmount: 20_000,
      paidAmount: 20_000,
      remainingAmount: 980_000,
    });
  });

  it('defaults the car price to the model list price when none is given', () => {
    expect(
      reservationAmounts({ depositAmount: 50_000, modelPrice: 1_299_000 }).totalAmount
    ).toBe(1_299_000);
    // an explicit price wins over the list price
    expect(
      reservationAmounts({ totalAmount: 1_250_000, depositAmount: 50_000, modelPrice: 1_299_000 })
        .remainingAmount
    ).toBe(1_200_000);
  });

  it('allows a zero deposit (quotation conversion without a deposit)', () => {
    expect(reservationAmounts({ totalAmount: 900_000, depositAmount: 0 })).toEqual({
      totalAmount: 900_000,
      depositAmount: 0,
      paidAmount: 0,
      remainingAmount: 900_000,
    });
  });

  it('rejects a deposit above the car price, a negative deposit and a missing price', () => {
    expect(() => reservationAmounts({ totalAmount: 10_000, depositAmount: 10_001 })).toThrow(
      'ยอดเงินจองต้องไม่เกินราคารถ'
    );
    expect(() => reservationAmounts({ totalAmount: 10_000, depositAmount: -1 })).toThrow();
    expect(() => reservationAmounts({ depositAmount: 1_000 })).toThrow('กรุณาระบุราคารถ');
    expect(() => reservationAmounts({ depositAmount: 1_000, modelPrice: 0 })).toThrow(
      'กรุณาระบุราคารถ'
    );
  });
});

describe('uniqueColors', () => {
  it('keeps the first spelling of each color, drops blanks, preserves priority order', () => {
    expect(uniqueColors(['White', null, 'Gray'], [' WHITE ', '', 'orange', 'Orange', undefined])).toEqual([
      'White',
      'Gray',
      'orange',
    ]);
  });
});
