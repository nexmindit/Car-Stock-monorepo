import { DEFAULT_DEMO_SALE_POLICY } from '@car-stock/shared/constants';
import type { Prisma, StockStatus } from '@prisma/client';
import { settingsService } from '../settings/settings.service';
import { assertStockSellable } from './demo-sale.helpers';

/**
 * A car can be sold from stock (AVAILABLE) or off demo duty (DEMO) when the
 * company setting allows the user's role — see assertStockSellable.
 */
export async function checkStockSellable(
  status: StockStatus,
  role: string,
  notAvailableMessage?: string
): Promise<{ isDemo: boolean }> {
  // Settings are read only when they matter (a DEMO unit).
  const policy =
    status === 'DEMO' ? await settingsService.getDemoSalePolicy() : DEFAULT_DEMO_SALE_POLICY;
  return assertStockSellable(status, policy, role, notAvailableMessage);
}

/** Audit trail entry on the stock unit when a DEMO car is sold. */
export async function logDemoStockSold(
  tx: Prisma.TransactionClient,
  args: { userId: string; stockId: string; saleId: string; saleNumber: string; via: string }
) {
  await tx.activityLog.create({
    data: {
      userId: args.userId,
      action: 'SELL_DEMO_STOCK',
      entity: 'STOCK',
      entityId: args.stockId,
      details: {
        note: 'ขายรถ Demo',
        saleId: args.saleId,
        saleNumber: args.saleNumber,
        via: args.via,
      },
    },
  });
}
