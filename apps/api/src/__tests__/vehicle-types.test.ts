import { describe, expect, it } from 'bun:test';
import { CreateVehicleTypeSchema, UpdateVehicleTypeSchema } from '@car-stock/shared/schemas';
import { AppError } from '../lib/errors';
import {
  DEFAULT_VEHICLE_TYPES,
  assertVehicleTypeUsable,
  cannotDeleteVehicleTypeError,
  isVehicleTypeChange,
  normalizeVehicleTypeCode,
  vehicleTypeDeleteBlocked,
} from '../modules/vehicle-types/vehicle-types.helpers';

describe('normalizeVehicleTypeCode', () => {
  it('trims and upper-cases a valid code', () => {
    expect(normalizeVehicleTypeCode('  motorcycle ')).toBe('MOTORCYCLE');
    expect(normalizeVehicleTypeCode('big_bike2')).toBe('BIG_BIKE2');
  });

  it('rejects empty, spaced, Thai or over-long codes', () => {
    expect(normalizeVehicleTypeCode('')).toBeNull();
    expect(normalizeVehicleTypeCode('   ')).toBeNull();
    expect(normalizeVehicleTypeCode('BIG BIKE')).toBeNull();
    expect(normalizeVehicleTypeCode('มอไซค์')).toBeNull();
    expect(normalizeVehicleTypeCode('A-B')).toBeNull();
    expect(normalizeVehicleTypeCode('X'.repeat(31))).toBeNull();
  });
});

describe('CreateVehicleTypeSchema', () => {
  it('normalizes the code the same way as the helper', () => {
    const parsed = CreateVehicleTypeSchema.parse({ code: ' tuk_tuk ', nameTh: ' ตุ๊กตุ๊ก ' });
    expect(parsed).toEqual({ code: 'TUK_TUK', nameTh: 'ตุ๊กตุ๊ก', sortOrder: 0, isActive: true });
  });

  it('requires a Thai name and a valid code', () => {
    expect(CreateVehicleTypeSchema.safeParse({ code: 'OK', nameTh: '  ' }).success).toBe(false);
    expect(CreateVehicleTypeSchema.safeParse({ code: 'a b', nameTh: 'x' }).success).toBe(false);
  });

  it('does not let an update change the code', () => {
    const parsed = UpdateVehicleTypeSchema.parse({ code: 'NEW', nameTh: 'ใหม่' });
    expect(parsed).not.toHaveProperty('code');
    expect(parsed.nameTh).toBe('ใหม่');
  });
});

describe('vehicleTypeDeleteBlocked', () => {
  it('allows delete only when no vehicle model uses the type', () => {
    expect(vehicleTypeDeleteBlocked(0)).toBe(false);
    expect(vehicleTypeDeleteBlocked(1)).toBe(true);
    expect(vehicleTypeDeleteBlocked(12)).toBe(true);
  });
});

describe('cannotDeleteVehicleTypeError', () => {
  it('is a Thai 400 that suggests deactivating instead', () => {
    const err = cannotDeleteVehicleTypeError('เก๋ง', 3);
    expect(err).toBeInstanceOf(AppError);
    expect(err.statusCode).toBe(400);
    expect(err.message).toContain('เก๋ง');
    expect(err.message).toContain('3');
    expect(err.message).toContain('ปิดใช้งาน');
  });
});

describe('assertVehicleTypeUsable', () => {
  it('passes for an active type', () => {
    expect(() => assertVehicleTypeUsable({ isActive: true }, 'SEDAN')).not.toThrow();
  });

  it('throws a 400 for an unknown code', () => {
    try {
      assertVehicleTypeUsable(null, 'NOPE');
      throw new Error('should have thrown');
    } catch (e) {
      expect((e as AppError).statusCode).toBe(400);
      expect((e as AppError).message).toContain('NOPE');
    }
  });

  it('throws a 400 for an inactive type', () => {
    expect(() => assertVehicleTypeUsable({ isActive: false, nameTh: 'รถตู้' }, 'VAN')).toThrow(
      /ปิดใช้งาน/
    );
  });
});

describe('isVehicleTypeChange', () => {
  it('is false when the type is missing or unchanged', () => {
    expect(isVehicleTypeChange(undefined, 'SEDAN')).toBe(false);
    expect(isVehicleTypeChange('SEDAN', 'SEDAN')).toBe(false);
  });

  it('is true when a different type is sent', () => {
    expect(isVehicleTypeChange('MOTORCYCLE', 'SEDAN')).toBe(true);
  });
});

describe('DEFAULT_VEHICLE_TYPES', () => {
  it('covers every former enum value including MOTORCYCLE with unique codes', () => {
    const codes = DEFAULT_VEHICLE_TYPES.map((t) => t.code);
    expect(new Set(codes).size).toBe(13);
    for (const c of ['SEDAN', 'PICKUP', 'SUV', 'EV', 'MOTORCYCLE']) {
      expect(codes).toContain(c);
    }
    expect(DEFAULT_VEHICLE_TYPES.find((t) => t.code === 'MOTORCYCLE')?.nameTh).toBe('มอเตอร์ไซค์');
  });
});
