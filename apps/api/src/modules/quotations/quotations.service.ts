import { db } from '../../lib/db';
import { NUMBER_PREFIXES } from '@car-stock/shared/constants';
import { authService } from '../auth/auth.service';
import { NotFoundError, ForbiddenError, BadRequestError, ConflictError } from '../../lib/errors';
import { checkStockSellable, logDemoStockSold } from '../sales/demo-sale.service';
import { reservationAmounts } from '../sales/reservation-deposit.helpers';
import { createReservationWithDeposit } from '../sales/reservation-deposit.service';
import { generateSaleNumber } from '../sales/sale-number';
import { generateReceiptNumber, resolveIssuedBy } from '../payments/receipt-number';
import type { StockStatus } from '@prisma/client';

export class QuotationsService {
  /**
   * Generate quotation number
   */
  private async generateQuotationNumber(): Promise<string> {
    const currentDate = new Date();
    const currentYear = currentDate.getFullYear();
    const currentMonth = currentDate.getMonth() + 1;
    const prefix = NUMBER_PREFIXES.QUOTATION;

    // Use a composite per-month sequence key. Atomic via the prefix_year_month
    // unique constraint — eliminates the race where two concurrent quotations
    // would both read the same lastNumber and produce duplicate numbers.
    const sequenceKey = `${prefix}-${currentYear}-${currentMonth.toString().padStart(2, '0')}`;

    const sequence = await db.numberSequence.upsert({
      where: {
        prefix_year_month: {
          prefix: sequenceKey,
          year: currentYear,
          month: currentMonth,
        },
      },
      create: {
        prefix: sequenceKey,
        year: currentYear,
        month: currentMonth,
        lastNumber: 1,
      },
      update: {
        lastNumber: { increment: 1 },
      },
    });

    // Format: QTN-YYMM-XXX
    const yearShort = currentYear.toString().slice(-2);
    const month = currentMonth.toString().padStart(2, '0');
    return `${prefix}-${yearShort}${month}-${sequence.lastNumber.toString().padStart(3, '0')}`;
  }

  /**
   * Get all quotations with pagination and filters
   */
  async getAllQuotations(params: any, currentUser: any) {
    // Check permission
    if (!authService.hasPermission(currentUser.role, 'SALE_VIEW')) {
      throw new ForbiddenError();
    }

    const page = parseInt(params.page) || 1;
    const limit = parseInt(params.limit) || 20;
    const skip = (page - 1) * limit;

    const where: any = {};

    if (params.search) {
      where.OR = [
        { quotationNumber: { contains: params.search, mode: 'insensitive' } },
        { customer: { name: { contains: params.search, mode: 'insensitive' } } },
        { customer: { code: { contains: params.search, mode: 'insensitive' } } },
      ];
    }

    if (params.status) {
      where.status = params.status;
    }

    if (params.customerId) {
      where.customerId = params.customerId;
    }

    const [quotations, total] = await Promise.all([
      db.quotation.findMany({
        where,
        select: {
          id: true,
          quotationNumber: true,
          version: true,
          quotedPrice: true,
          discountAmount: true,
          finalPrice: true,
          validUntil: true,
          status: true,
          notes: true,
          preferredExtColor: true,
          preferredIntColor: true,
          customer: {
            select: {
              id: true,
              code: true,
              name: true,
              type: true,
              phone: true,
              email: true,
            },
          },
          vehicleModel: {
            select: {
              id: true,
              brand: true,
              model: true,
              variant: true,
              year: true,
              type: true,
              price: true,
            },
          },
          sale: {
            select: {
              id: true,
              saleNumber: true,
              status: true,
            },
          },
          createdBy: {
            select: {
              id: true,
              username: true,
              firstName: true,
              lastName: true,
            },
          },
          createdAt: true,
          updatedAt: true,
        },
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      db.quotation.count({ where }),
    ]);

    return {
      data: quotations,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
        hasNextPage: page < Math.ceil(total / limit),
        hasPrevPage: page > 1,
      },
    };
  }

  /**
   * Get quotation by ID
   */
  async getQuotationById(id: string, currentUser: any) {
    // Check permission
    if (!authService.hasPermission(currentUser.role, 'SALE_VIEW')) {
      throw new ForbiddenError();
    }

    const quotation = await db.quotation.findUnique({
      where: { id },
      include: {
        customer: true,
        vehicleModel: true,
        sale: {
          select: {
            id: true,
            saleNumber: true,
            status: true,
          },
        },
        createdBy: {
          select: {
            id: true,
            username: true,
            firstName: true,
            lastName: true,
          },
        },
      },
    });

    if (!quotation) {
      throw new NotFoundError('Quotation');
    }

    return quotation;
  }

  /**
   * Get quotation statistics
   */
  async getQuotationStats(currentUser: any) {
    // Check permission
    if (!authService.hasPermission(currentUser.role, 'SALE_VIEW')) {
      throw new ForbiddenError();
    }

    const [
      totalQuotations,
      draftQuotations,
      sentQuotations,
      acceptedQuotations,
      rejectedQuotations,
      expiredQuotations,
      convertedQuotations,
      totalQuotedValue,
    ] = await Promise.all([
      db.quotation.count(),
      db.quotation.count({ where: { status: 'DRAFT' } }),
      db.quotation.count({ where: { status: 'SENT' } }),
      db.quotation.count({ where: { status: 'ACCEPTED' } }),
      db.quotation.count({ where: { status: 'REJECTED' } }),
      db.quotation.count({ where: { status: 'EXPIRED' } }),
      db.quotation.count({ where: { status: 'CONVERTED' } }),
      db.quotation.aggregate({
        where: { status: { in: ['SENT', 'ACCEPTED', 'CONVERTED'] } },
        _sum: { quotedPrice: true },
      }),
    ]);

    const sentAndConverted = sentQuotations + acceptedQuotations + convertedQuotations + rejectedQuotations + expiredQuotations;
    const conversionRate = sentAndConverted > 0 ? (convertedQuotations / sentAndConverted) * 100 : 0;

    return {
      totalQuotations,
      draftQuotations,
      sentQuotations,
      acceptedQuotations,
      rejectedQuotations,
      expiredQuotations,
      convertedQuotations,
      conversionRate: Math.round(conversionRate * 100) / 100,
      totalQuotedValue: totalQuotedValue._sum.quotedPrice || 0,
    };
  }

  /**
   * Create new quotation
   */
  async createQuotation(data: any, currentUser: any) {
    // Check permission
    if (!authService.hasPermission(currentUser.role, 'QUOTATION_CREATE')) {
      throw new ForbiddenError();
    }

    // Check if customer exists
    const customer = await db.customer.findUnique({
      where: { id: data.customerId },
      select: { id: true },
    });

    if (!customer) {
      throw new NotFoundError('Customer');
    }

    // Check if vehicle model exists (if provided)
    if (data.vehicleModelId) {
      const vehicleModel = await db.vehicleModel.findUnique({
        where: { id: data.vehicleModelId },
        select: { id: true },
      });

      if (!vehicleModel) {
        throw new NotFoundError('Vehicle model');
      }
    }

    // Generate quotation number
    const quotationNumber = await this.generateQuotationNumber();

    // Calculate final price
    const quotedPrice = Number(data.quotedPrice);
    const discountAmount = Number(data.discountAmount || 0);
    const finalPrice = quotedPrice - discountAmount;

    // Create quotation
    const quotation = await db.quotation.create({
      data: {
        quotationNumber,
        customerId: data.customerId,
        vehicleModelId: data.vehicleModelId || null,
        preferredExtColor: data.preferredExtColor || null,
        preferredIntColor: data.preferredIntColor || null,
        quotedPrice,
        discountAmount,
        finalPrice,
        validUntil: new Date(data.validUntil),
        notes: data.notes || null,
        version: 1,
        status: 'DRAFT',
        createdById: currentUser.id,
      },
      include: {
        customer: true,
        vehicleModel: true,
        createdBy: {
          select: {
            id: true,
            username: true,
            firstName: true,
            lastName: true,
          },
        },
      },
    });

    // Log activity
    await db.activityLog.create({
      data: {
        userId: currentUser.id,
        action: 'CREATE_QUOTATION',
        entity: 'QUOTATION',
        entityId: quotation.id,
        details: {
          quotationNumber: quotation.quotationNumber,
          customerId: quotation.customerId,
          quotedPrice: quotation.quotedPrice,
        },
      },
    });

    return quotation;
  }

  /**
   * Update quotation
   */
  async updateQuotation(id: string, data: any, currentUser: any) {
    // Check permission
    if (!authService.hasPermission(currentUser.role, 'QUOTATION_UPDATE')) {
      throw new ForbiddenError();
    }

    const existing = await db.quotation.findUnique({
      where: { id },
      select: { id: true, status: true, version: true },
    });

    if (!existing) {
      throw new NotFoundError('Quotation');
    }

    // Can only update DRAFT quotations
    if (existing.status !== 'DRAFT') {
      throw new BadRequestError('Can only update draft quotations');
    }

    // Check if vehicle model exists (if provided)
    if (data.vehicleModelId) {
      const vehicleModel = await db.vehicleModel.findUnique({
        where: { id: data.vehicleModelId },
        select: { id: true },
      });
      if (!vehicleModel) {
        throw new NotFoundError('Vehicle model');
      }
    }

    // Calculate final price if prices are updated
    let updateData: any = {
      vehicleModelId: data.vehicleModelId !== undefined ? data.vehicleModelId : undefined,
      preferredExtColor: data.preferredExtColor,
      preferredIntColor: data.preferredIntColor,
      validUntil: data.validUntil ? new Date(data.validUntil) : undefined,
      notes: data.notes,
    };

    if (data.quotedPrice !== undefined || data.discountAmount !== undefined) {
      const quotedPrice = data.quotedPrice !== undefined ? Number(data.quotedPrice) : undefined;
      const discountAmount = data.discountAmount !== undefined ? Number(data.discountAmount) : undefined;
      
      if (quotedPrice !== undefined) {
        updateData.quotedPrice = quotedPrice;
      }
      if (discountAmount !== undefined) {
        updateData.discountAmount = discountAmount;
      }
      
      // Recalculate final price
      const currentQuotation = await db.quotation.findUnique({ where: { id } });
      if (currentQuotation) {
        const newQuotedPrice = quotedPrice ?? Number(currentQuotation.quotedPrice);
        const newDiscount = discountAmount ?? Number(currentQuotation.discountAmount);
        updateData.finalPrice = newQuotedPrice - newDiscount;
      }
    }

    const quotation = await db.quotation.update({
      where: { id },
      data: updateData,
      include: {
        customer: true,
        vehicleModel: true,
        createdBy: {
          select: {
            id: true,
            username: true,
            firstName: true,
            lastName: true,
          },
        },
      },
    });

    // Log activity
    await db.activityLog.create({
      data: {
        userId: currentUser.id,
        action: 'UPDATE_QUOTATION',
        entity: 'QUOTATION',
        entityId: quotation.id,
        details: {
          quotationNumber: quotation.quotationNumber,
        },
      },
    });

    return quotation;
  }

  /**
   * Update quotation status
   */
  async updateQuotationStatus(id: string, status: string, currentUser: any) {
    // Check permission
    if (!authService.hasPermission(currentUser.role, 'QUOTATION_UPDATE')) {
      throw new ForbiddenError();
    }

    const existing = await db.quotation.findUnique({
      where: { id },
      select: { id: true, status: true },
    });

    if (!existing) {
      throw new NotFoundError('Quotation');
    }

    // Validate status transitions
    const validTransitions: Record<string, string[]> = {
      DRAFT: ['SENT'],
      SENT: ['ACCEPTED', 'REJECTED', 'EXPIRED'],
      ACCEPTED: ['CONVERTED'],
      REJECTED: [],
      EXPIRED: [],
      CONVERTED: [],
    };

    const allowed = validTransitions[existing.status] || [];
    if (!allowed.includes(status)) {
      throw new BadRequestError(`Cannot transition from ${existing.status} to ${status}`);
    }

    const quotation = await db.quotation.update({
      where: { id },
      data: { status: status as any },
      include: {
        customer: true,
        vehicleModel: true,
        sale: {
          select: {
            id: true,
            saleNumber: true,
            status: true,
          },
        },
        createdBy: {
          select: {
            id: true,
            username: true,
            firstName: true,
            lastName: true,
          },
        },
      },
    });

    // Log activity
    await db.activityLog.create({
      data: {
        userId: currentUser.id,
        action: 'UPDATE_QUOTATION_STATUS',
        entity: 'QUOTATION',
        entityId: quotation.id,
        details: {
          quotationNumber: quotation.quotationNumber,
          fromStatus: existing.status,
          toStatus: status,
        },
      },
    });

    return quotation;
  }

  /**
   * Convert quotation to sale
   */
  async convertToSale(id: string, data: any, currentUser: any) {
    // Check permission
    if (!authService.hasPermission(currentUser.role, 'QUOTATION_CONVERT')) {
      throw new ForbiddenError();
    }

    const quotation = await db.quotation.findUnique({
      where: { id },
      include: {
        customer: true,
        vehicleModel: true,
      },
    });

    if (!quotation) {
      throw new NotFoundError('Quotation');
    }

    if (quotation.status !== 'ACCEPTED') {
      throw new BadRequestError('Can only convert accepted quotations');
    }

    // A unit picked at conversion must be sellable (AVAILABLE, or DEMO when the
    // setting allows this role); it is claimed atomically inside the transaction.
    let pickedStockStatus: StockStatus | undefined;
    let pickedFromDemo = false;
    if (data.stockId) {
      const stock = await db.stock.findFirst({
        where: { id: data.stockId, deletedAt: null },
        select: { status: true },
      });
      if (!stock) {
        throw new NotFoundError('Stock');
      }
      pickedFromDemo = (await checkStockSellable(stock.status, currentUser.role)).isDemo;
      pickedStockStatus = stock.status;
    }

    // Sale number in its own serializable transaction so the increment
    // survives a rollback of the conversion (standard SEQUENCE semantics).
    const saleNumber = await generateSaleNumber();

    // Determine sale type
    const saleType = data.saleType || 'RESERVATION_SALE';
    // Total = the agreed car price; the deposit is paid now toward it
    // (remaining = total − deposit; quotations carry no buyer fees).
    const amounts = reservationAmounts({
      totalAmount: Number(quotation.finalPrice),
      depositAmount: Number(data.depositAmount || 0),
    });
    // Pre-generate receipt number outside transaction (uses its own sequence)
    const receiptNumber = amounts.depositAmount > 0 ? await generateReceiptNumber() : null;
    // The JWT user carries no names — read them so ผู้รับเงิน is not "undefined undefined".
    const issuedBy = receiptNumber
      ? await resolveIssuedBy(currentUser.id, currentUser.username)
      : '';

    // All mutations in a single transaction
    const result = await db.$transaction(async (tx) => {
      const { sale } = await createReservationWithDeposit(tx, {
        userId: currentUser.id,
        sale: {
          saleNumber,
          type: saleType,
          status: saleType === 'DIRECT_SALE' ? 'PREPARING' : 'RESERVED',
          customerId: quotation.customerId,
          stockId: data.stockId || null,
          vehicleModelId: quotation.vehicleModelId,
          preferredExtColor: quotation.preferredExtColor,
          preferredIntColor: quotation.preferredIntColor,
          totalAmount: amounts.totalAmount,
          depositAmount: amounts.depositAmount,
          remainingAmount: amounts.remainingAmount,
          reservedDate: new Date(),
          discountSnapshot: quotation.discountAmount,
          paymentMode: data.paymentMode || 'CASH',
          notes: quotation.notes,
        },
        deposit: receiptNumber
          ? {
              receiptNumber,
              paymentDate: new Date(),
              paymentMethod: data.paymentMethod || 'CASH',
              referenceNumber: data.paymentReferenceNumber || null,
              notes: `เงินมัดจำจากใบเสนอราคา ${quotation.quotationNumber}`,
              description: `เงินมัดจำ - ${saleNumber}`,
              issuedBy,
              logDetails: { quotationNumber: quotation.quotationNumber },
            }
          : null,
      });

      // Update quotation status to CONVERTED and link to sale
      const updatedQuotation = await tx.quotation.update({
        where: { id },
        data: {
          status: 'CONVERTED',
          saleId: sale.id,
        },
        include: {
          customer: true,
          vehicleModel: true,
          sale: {
            select: {
              id: true,
              saleNumber: true,
              status: true,
            },
          },
          createdBy: {
            select: {
              id: true,
              username: true,
              firstName: true,
              lastName: true,
            },
          },
        },
      });

      // If stock is assigned, reserve it — only if still in the status checked above
      if (data.stockId) {
        const reserved = await tx.stock.updateMany({
          where: { id: data.stockId, status: pickedStockStatus, deletedAt: null },
          data: { status: 'RESERVED' },
        });
        if (reserved.count === 0) {
          throw new BadRequestError('Stock is not available');
        }
        if (pickedFromDemo) {
          await logDemoStockSold(tx, {
            userId: currentUser.id,
            stockId: data.stockId,
            saleId: sale.id,
            saleNumber: sale.saleNumber,
            via: 'CONVERT_QUOTATION',
          });
        }
      }

      await tx.saleHistory.create({
        data: {
          saleId: sale.id,
          action: 'CONVERT_FROM_QUOTATION',
          fromStatus: null,
          toStatus: sale.status,
          notes: `Converted from quotation ${quotation.quotationNumber}`,
          createdById: currentUser.id,
        },
      });

      await tx.activityLog.create({
        data: {
          userId: currentUser.id,
          action: 'CONVERT_QUOTATION_TO_SALE',
          entity: 'QUOTATION',
          entityId: quotation.id,
          details: {
            quotationNumber: quotation.quotationNumber,
            saleNumber: sale.saleNumber,
            saleId: sale.id,
          },
        },
      });

      return { updatedQuotation, sale };
    });

    return {
      quotation: result.updatedQuotation,
      sale: {
        id: result.sale.id,
        saleNumber: result.sale.saleNumber,
        status: result.sale.status,
      },
    };
  }

  /**
   * Create new version of quotation
   */
  async createNewVersion(id: string, data: any, currentUser: any) {
    // Check permission
    if (!authService.hasPermission(currentUser.role, 'QUOTATION_CREATE')) {
      throw new ForbiddenError();
    }

    const original = await db.quotation.findUnique({
      where: { id },
      include: {
        customer: true,
        vehicleModel: true,
      },
    });

    if (!original) {
      throw new NotFoundError('Quotation');
    }

    // Get the highest version for this customer/vehicle combination
    const maxVersion = await db.quotation.aggregate({
      where: {
        customerId: original.customerId,
        vehicleModelId: original.vehicleModelId,
      },
      _max: {
        version: true,
      },
    });

    const newVersion = (maxVersion._max.version || 0) + 1;
    const quotationNumber = await this.generateQuotationNumber();

    // Calculate prices
    const quotedPrice = data.quotedPrice !== undefined ? Number(data.quotedPrice) : Number(original.quotedPrice);
    const discountAmount = data.discountAmount !== undefined ? Number(data.discountAmount) : Number(original.discountAmount);
    const finalPrice = quotedPrice - discountAmount;

    // Create new version
    const newQuotation = await db.quotation.create({
      data: {
        quotationNumber,
        customerId: original.customerId,
        vehicleModelId: data.vehicleModelId || original.vehicleModelId,
        preferredExtColor: data.preferredExtColor || original.preferredExtColor,
        preferredIntColor: data.preferredIntColor || original.preferredIntColor,
        quotedPrice,
        discountAmount,
        finalPrice,
        validUntil: data.validUntil ? new Date(data.validUntil) : new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
        notes: data.notes || original.notes,
        version: newVersion,
        status: 'DRAFT',
        createdById: currentUser.id,
      },
      include: {
        customer: true,
        vehicleModel: true,
        createdBy: {
          select: {
            id: true,
            username: true,
            firstName: true,
            lastName: true,
          },
        },
      },
    });

    // Log activity
    await db.activityLog.create({
      data: {
        userId: currentUser.id,
        action: 'CREATE_QUOTATION_VERSION',
        entity: 'QUOTATION',
        entityId: newQuotation.id,
        details: {
          quotationNumber: newQuotation.quotationNumber,
          originalQuotationId: original.id,
          version: newVersion,
        },
      },
    });

    return newQuotation;
  }

  /**
   * Delete quotation (only DRAFT)
   */
  async deleteQuotation(id: string, currentUser: any) {
    // Check permission
    if (!authService.hasPermission(currentUser.role, 'QUOTATION_DELETE')) {
      throw new ForbiddenError();
    }

    const quotation = await db.quotation.findUnique({
      where: { id },
      select: { id: true, status: true, quotationNumber: true },
    });

    if (!quotation) {
      throw new NotFoundError('Quotation');
    }

    if (quotation.status !== 'DRAFT') {
      throw new BadRequestError('Can only delete draft quotations');
    }

    await db.quotation.delete({
      where: { id },
    });

    // Log activity
    await db.activityLog.create({
      data: {
        userId: currentUser.id,
        action: 'DELETE_QUOTATION',
        entity: 'QUOTATION',
        entityId: id,
        details: {
          quotationNumber: quotation.quotationNumber,
        },
      },
    });

    return { success: true };
  }
}

export const quotationsService = new QuotationsService();
