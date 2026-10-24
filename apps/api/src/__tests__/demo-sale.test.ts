import { describe, expect, it } from 'bun:test';
import {
  DEFAULT_DEMO_SALE_POLICY,
  PERMISSIONS,
  canSellDemoStock,
  demoSaleBlockReason,
} from '@car-stock/shared/constants';
import { DemoSaleSettingsSchema } from '@car-stock/shared/schemas';
import type { AppError } from '../lib/errors';
import { assertStockSellable, toDemoSalePolicy } from '../modules/sales/demo-sale.helpers';

const on = (roles: string[]) => toDemoSalePolicy({ allowDemoSale: true, demoSaleRoles: roles });
const off = toDemoSalePolicy({ allowDemoSale: false, demoSaleRoles: ['ADMIN', 'SALES_STAFF'] });

function thrown(fn: () => unknown): AppError | undefined {
  try {
    fn();
  } catch (e) {
    return e as AppError;
  }
  return undefined;
}

describe('demo sale policy (shared)', () => {
  it('defaults keep today’s behaviour: on, every SALE_CREATE role', () => {
    expect(DEFAULT_DEMO_SALE_POLICY.allowDemoSale).toBe(true);
    expect([...DEFAULT_DEMO_SALE_POLICY.demoSaleRoles]).toEqual([...PERMISSIONS.SALE_CREATE]);
    for (const role of PERMISSIONS.SALE_CREATE) {
      expect(canSellDemoStock(DEFAULT_DEMO_SALE_POLICY, role)).toBe(true);
    }
  });

  it('switch off blocks everyone, admin included', () => {
    expect(demoSaleBlockReason(off, 'ADMIN')).toBe('ระบบปิดการขายรถ Demo');
    expect(canSellDemoStock(off, 'SALES_STAFF')).toBe(false);
  });

  it('switch on allows only ticked roles', () => {
    const policy = on(['SALES_STAFF']);
    expect(canSellDemoStock(policy, 'SALES_STAFF')).toBe(true);
    expect(demoSaleBlockReason(policy, 'SALES_MANAGER')).toBe('ไม่มีสิทธิ์ขายรถ Demo');
    expect(canSellDemoStock(policy, 'ADMIN')).toBe(false);
    expect(canSellDemoStock(policy, undefined)).toBe(false);
  });
});

describe('toDemoSalePolicy', () => {
  it('falls back to defaults when there is no settings row', () => {
    expect(toDemoSalePolicy(null)).toEqual(DEFAULT_DEMO_SALE_POLICY);
  });

  it('reads the row as-is (empty role list stays empty)', () => {
    expect(toDemoSalePolicy({ allowDemoSale: true, demoSaleRoles: [] })).toEqual({
      allowDemoSale: true,
      demoSaleRoles: [],
    });
  });
});

describe('assertStockSellable', () => {
  it('AVAILABLE is always sellable, whatever the demo policy', () => {
    expect(assertStockSellable('AVAILABLE', off, 'SALES_STAFF')).toEqual({ isDemo: false });
  });

  it('DEMO is sellable only when the policy allows the role', () => {
    expect(assertStockSellable('DEMO', on(['SALES_STAFF']), 'SALES_STAFF')).toEqual({
      isDemo: true,
    });

    const roleErr = thrown(() => assertStockSellable('DEMO', on(['SALES_STAFF']), 'ACCOUNTANT'));
    expect(roleErr?.statusCode).toBe(400);
    expect(roleErr?.message).toBe('ไม่มีสิทธิ์ขายรถ Demo');

    const offErr = thrown(() => assertStockSellable('DEMO', off, 'ADMIN'));
    expect(offErr?.statusCode).toBe(400);
    expect(offErr?.message).toBe('ระบบปิดการขายรถ Demo');
  });

  it('reserved / sold / preparing units are never sellable', () => {
    for (const status of ['RESERVED', 'PREPARING', 'SOLD'] as const) {
      const err = thrown(() => assertStockSellable(status, DEFAULT_DEMO_SALE_POLICY, 'ADMIN'));
      expect(err?.statusCode).toBe(400);
      expect(err?.message).toBe('Stock is not available');
    }
    const custom = thrown(() =>
      assertStockSellable('SOLD', DEFAULT_DEMO_SALE_POLICY, 'ADMIN', 'รถคันนี้ไม่พร้อมขาย')
    );
    expect(custom?.message).toBe('รถคันนี้ไม่พร้อมขาย');
  });
});

describe('DemoSaleSettingsSchema', () => {
  it('accepts valid roles and de-duplicates them', () => {
    expect(
      DemoSaleSettingsSchema.parse({
        allowDemoSale: false,
        demoSaleRoles: ['SALES_STAFF', 'SALES_STAFF', 'ADMIN'],
      })
    ).toEqual({ allowDemoSale: false, demoSaleRoles: ['SALES_STAFF', 'ADMIN'] });
  });

  it('rejects unknown roles', () => {
    expect(DemoSaleSettingsSchema.safeParse({ demoSaleRoles: ['BOSS'] }).success).toBe(false);
  });

  it('both fields are optional', () => {
    expect(DemoSaleSettingsSchema.parse({})).toEqual({});
  });
});
