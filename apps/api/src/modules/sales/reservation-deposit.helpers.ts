import { BadRequestError } from '../../lib/errors';
import { initialRemaining } from './sales-remaining';

/**
 * Money on a booking created together with its deposit receipt.
 * The car price defaults to the model list price; the deposit is recorded as
 * paid right away (a DEPOSIT payment is created in the same transaction), so
 * remaining = price − deposit — the same formula createSale uses.
 */
export function reservationAmounts(args: {
  totalAmount?: number | null;
  depositAmount: number;
  modelPrice?: number | null;
}) {
  const totalAmount = args.totalAmount ?? args.modelPrice ?? 0;
  if (!(totalAmount > 0)) {
    throw new BadRequestError('กรุณาระบุราคารถ');
  }
  const depositAmount = args.depositAmount;
  if (!(depositAmount >= 0)) {
    throw new BadRequestError('ยอดเงินจองต้องไม่ติดลบ');
  }
  if (depositAmount > totalAmount) {
    throw new BadRequestError('ยอดเงินจองต้องไม่เกินราคารถ');
  }
  return {
    totalAmount,
    depositAmount,
    paidAmount: depositAmount,
    remainingAmount: initialRemaining(totalAmount, depositAmount),
  };
}

/**
 * Color suggestions for a booking: stock colors are free text (White/WHITE),
 * so keep the first spelling of each color across the lists, in list order.
 */
export function uniqueColors(...lists: (string | null | undefined)[][]): string[] {
  const seen = new Map<string, string>();
  for (const list of lists) {
    for (const raw of list) {
      const color = raw?.trim();
      if (!color) continue;
      const key = color.toLowerCase();
      if (!seen.has(key)) seen.set(key, color);
    }
  }
  return [...seen.values()];
}
