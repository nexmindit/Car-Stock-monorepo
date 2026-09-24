import { describe, expect, it } from 'bun:test';
import { vehicleCardEngineNo } from '../modules/pdf/helpers';

describe('vehicleCardEngineNo', () => {
  it('prints the engine number when the car has one', () => {
    expect(
      vehicleCardEngineNo({
        engineNumber: 'ENG-001',
        motorNumber1: 'MOT-1',
        motorNumber2: 'MOT-2',
      })
    ).toBe('ENG-001');
  });

  it('prints motor 1 when the engine number is empty', () => {
    expect(
      vehicleCardEngineNo({ engineNumber: null, motorNumber1: 'MOT-1', motorNumber2: 'MOT-2' })
    ).toBe('MOT-1');
    expect(vehicleCardEngineNo({ engineNumber: '  ', motorNumber1: 'MOT-1' })).toBe('MOT-1');
  });

  it('prints motor 2 when engine and motor 1 are empty', () => {
    expect(
      vehicleCardEngineNo({ engineNumber: '', motorNumber1: null, motorNumber2: 'MOT-2' })
    ).toBe('MOT-2');
  });

  it('prints a dash when neither engine nor motor number is set', () => {
    expect(vehicleCardEngineNo({ engineNumber: null, motorNumber1: '', motorNumber2: '  ' })).toBe(
      '-'
    );
  });
});
