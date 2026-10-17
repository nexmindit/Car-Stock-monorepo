import { describe, expect, it } from 'bun:test';
import { buildStockAttributeWhere } from '../modules/stock/stock-filter.helpers';

describe('buildStockAttributeWhere', () => {
  it('returns an empty where when no filter is set', () => {
    expect(buildStockAttributeWhere({})).toEqual({});
  });

  it('filters by brand alone', () => {
    expect(buildStockAttributeWhere({ brand: 'Toyota' })).toEqual({
      vehicleModel: { brand: 'Toyota' },
    });
  });

  it('filters by model alone', () => {
    expect(buildStockAttributeWhere({ model: 'Yaris' })).toEqual({
      vehicleModel: { model: 'Yaris' },
    });
  });

  it('filters by exterior colour alone', () => {
    expect(buildStockAttributeWhere({ exteriorColor: 'ขาว' })).toEqual({ exteriorColor: 'ขาว' });
  });

  it('filters by interior colour alone (null interiors never match)', () => {
    expect(buildStockAttributeWhere({ interiorColor: 'ดำ' })).toEqual({ interiorColor: 'ดำ' });
  });

  it('combines every filter with AND', () => {
    expect(
      buildStockAttributeWhere({
        brand: 'Toyota',
        model: 'Yaris',
        exteriorColor: 'ขาว',
        interiorColor: 'ดำ',
      })
    ).toEqual({
      vehicleModel: { brand: 'Toyota', model: 'Yaris' },
      exteriorColor: 'ขาว',
      interiorColor: 'ดำ',
    });
  });

  it('ignores blank ("ทั้งหมด") and whitespace values', () => {
    expect(
      buildStockAttributeWhere({ brand: '', model: '  ', exteriorColor: '', interiorColor: '' })
    ).toEqual({});
  });

  it('leaves interiorColor unconstrained when blank so null interiors are kept', () => {
    const where = buildStockAttributeWhere({ exteriorColor: 'ขาว', interiorColor: '' });
    expect(where).toEqual({ exteriorColor: 'ขาว' });
    expect('interiorColor' in where).toBe(false);
  });
});
