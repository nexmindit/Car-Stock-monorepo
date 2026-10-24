import { describe, expect, it } from 'bun:test';
import { buildReceiptItems, describeSaleVehicle } from '../modules/pdf/helpers';

const tiggo = { brand: 'CHERY', model: 'Tiggo 8', variant: 'PHEV 4WD Elite' };

describe('describeSaleVehicle', () => {
  it('uses the linked stock unit (model + exterior color) first', () => {
    expect(
      describeSaleVehicle({
        stock: { exteriorColor: 'ขาว', vehicleModel: tiggo },
        vehicleModel: { brand: 'OTHER', model: 'X', variant: null },
        preferredExtColor: 'ดำ',
      })
    ).toBe('CHERY Tiggo 8 PHEV 4WD Elite สีขาว');
  });

  it('falls back to the booked model + preferred color when no VIN is linked', () => {
    expect(
      describeSaleVehicle({ stock: null, vehicleModel: tiggo, preferredExtColor: 'ขาวมุก' })
    ).toBe('CHERY Tiggo 8 PHEV 4WD Elite สีขาวมุก');
  });

  it('separates a latin color name and does not double the สี prefix', () => {
    expect(
      describeSaleVehicle({ vehicleModel: { ...tiggo, variant: null }, preferredExtColor: 'White' })
    ).toBe('CHERY Tiggo 8 สี White');
    expect(describeSaleVehicle({ vehicleModel: tiggo, preferredExtColor: 'สีเทา' })).toBe(
      'CHERY Tiggo 8 PHEV 4WD Elite สีเทา'
    );
  });

  it('uses the sale model when the stock row has no model, and the booked color when the unit has none', () => {
    expect(
      describeSaleVehicle({
        stock: { exteriorColor: '  ', vehicleModel: null },
        vehicleModel: tiggo,
        preferredExtColor: 'แดง',
      })
    ).toBe('CHERY Tiggo 8 PHEV 4WD Elite สีแดง');
  });

  it('prints only the model when no color is known, and empty when nothing is known', () => {
    expect(describeSaleVehicle({ vehicleModel: tiggo })).toBe('CHERY Tiggo 8 PHEV 4WD Elite');
    expect(describeSaleVehicle({ stock: null, vehicleModel: null })).toBe('');
    expect(describeSaleVehicle(null)).toBe('');
    expect(describeSaleVehicle(undefined)).toBe('');
  });
});

describe('buildReceiptItems', () => {
  it('puts the vehicle on its own line under the payment type, then the description', () => {
    expect(
      buildReceiptItems({
        typeLabel: 'เงินจอง',
        amount: '20000',
        vehicle: 'CHERY Tiggo 8 PHEV 4WD Elite สีขาว',
        description: 'เงินมัดจำ - SL-2026-0001',
      })
    ).toEqual([
      { description: 'เงินจอง', amount: '20000' },
      { description: 'CHERY Tiggo 8 PHEV 4WD Elite สีขาว', amount: '' },
      { description: 'เงินมัดจำ - SL-2026-0001', amount: '' },
    ]);
  });

  it('skips empty vehicle / description lines (miscellaneous receipts)', () => {
    expect(buildReceiptItems({ typeLabel: 'เบ็ดเตล็ด', amount: '500', vehicle: '' })).toEqual([
      { description: 'เบ็ดเตล็ด', amount: '500' },
    ]);
    expect(
      buildReceiptItems({ typeLabel: 'เบ็ดเตล็ด', amount: '500', description: 'ค่าป้ายแดง' })
    ).toEqual([
      { description: 'เบ็ดเตล็ด', amount: '500' },
      { description: 'ค่าป้ายแดง', amount: '' },
    ]);
  });
});
