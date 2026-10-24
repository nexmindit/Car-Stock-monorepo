import { NUMBER_PREFIXES } from '@car-stock/shared/constants';
import { db } from '../../lib/db';

/**
 * Next receipt number, RCPT-YYMM-XXXX (monthly sequence).
 * Atomic upsert + increment — concurrent payments cannot get the same number.
 */
export async function generateReceiptNumber(): Promise<string> {
  const currentYear = new Date().getFullYear();
  const currentMonth = new Date().getMonth() + 1;
  const prefix = NUMBER_PREFIXES.RECEIPT;

  const sequence = await db.numberSequence.upsert({
    where: {
      prefix_year_month: {
        prefix,
        year: currentYear,
        month: currentMonth,
      },
    },
    create: {
      prefix,
      year: currentYear,
      month: currentMonth,
      lastNumber: 1,
    },
    update: {
      lastNumber: { increment: 1 },
    },
  });

  const yearStr = currentYear.toString().slice(-2);
  const monthStr = currentMonth.toString().padStart(2, '0');
  return `${prefix}-${yearStr}${monthStr}-${sequence.lastNumber.toString().padStart(4, '0')}`;
}

/** Name printed as ผู้รับเงิน on a receipt: the user's full name, else the username. */
export async function resolveIssuedBy(userId: string, fallback?: string): Promise<string> {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { firstName: true, lastName: true, username: true },
  });
  return (
    [user?.firstName, user?.lastName].filter(Boolean).join(' ') ||
    user?.username ||
    fallback ||
    ''
  );
}
