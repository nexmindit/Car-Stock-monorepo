import { NUMBER_PREFIXES } from '@car-stock/shared/constants';
import { db } from '../../lib/db';

/**
 * Next sale number, SL-YYYY-XXXX.
 *
 * Atomic read-modify-write inside a serializable transaction prevents the
 * concurrent-find-then-update race that produces duplicate sale numbers.
 * Prisma's compound-key upsert can't be used because the year-only sequences
 * have `month: null`, which isn't addressable via the `prefix_year_month`
 * unique selector. Runs in its own transaction so the increment survives a
 * rollback of the caller's work (standard SEQUENCE semantics).
 */
export async function generateSaleNumber(): Promise<string> {
  const currentYear = new Date().getFullYear();
  const prefix = NUMBER_PREFIXES.SALE;

  const nextNumber = await db.$transaction(
    async (tx) => {
      const updated = await tx.numberSequence.updateMany({
        where: { prefix, year: currentYear, month: null },
        data: { lastNumber: { increment: 1 } },
      });

      if (updated.count > 0) {
        const sequence = await tx.numberSequence.findFirst({
          where: { prefix, year: currentYear, month: null },
          select: { lastNumber: true },
        });
        return sequence!.lastNumber;
      }

      const created = await tx.numberSequence.create({
        data: { prefix, year: currentYear, lastNumber: 1 },
        select: { lastNumber: true },
      });
      return created.lastNumber;
    },
    { isolationLevel: 'Serializable' }
  );

  return `${prefix}-${currentYear}-${nextNumber.toString().padStart(4, '0')}`;
}
