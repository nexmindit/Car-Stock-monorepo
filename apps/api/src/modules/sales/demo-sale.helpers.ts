import {
  DEFAULT_DEMO_SALE_POLICY,
  type DemoSalePolicy,
  type RoleValue,
  demoSaleBlockReason,
} from '@car-stock/shared/constants';
import type { StockStatus } from '@prisma/client';
import { BadRequestError } from '../../lib/errors';

/** CompanySettings row (or null when none saved yet) → demo-sale policy. */
export function toDemoSalePolicy(
  row: { allowDemoSale?: boolean | null; demoSaleRoles?: readonly string[] | null } | null
): DemoSalePolicy {
  if (!row) return DEFAULT_DEMO_SALE_POLICY;
  return {
    allowDemoSale: row.allowDemoSale ?? DEFAULT_DEMO_SALE_POLICY.allowDemoSale,
    demoSaleRoles: (row.demoSaleRoles ?? DEFAULT_DEMO_SALE_POLICY.demoSaleRoles) as RoleValue[],
  };
}

/**
 * A unit can be sold from stock (AVAILABLE) or off demo duty (DEMO) when the
 * company setting allows the user's role. Throws BadRequestError otherwise.
 * Callers claim the unit atomically with `status: <the status checked here>`,
 * so DEMO is only ever claimed after this check passed.
 */
export function assertStockSellable(
  status: StockStatus,
  policy: DemoSalePolicy,
  role: string | null | undefined,
  notAvailableMessage = 'Stock is not available'
): { isDemo: boolean } {
  if (status === 'AVAILABLE') return { isDemo: false };
  if (status === 'DEMO') {
    const reason = demoSaleBlockReason(policy, role);
    if (reason) throw new BadRequestError(reason);
    return { isDemo: true };
  }
  throw new BadRequestError(notAvailableMessage);
}
