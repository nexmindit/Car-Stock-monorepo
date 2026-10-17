import { db } from '../../lib/db';
import { CreateStockSchema, UpdateStockSchema, StockFilterSchema } from '@car-stock/shared/schemas';
import {
  NUMBER_PREFIXES,
  isManualStockStatusTransitionAllowed,
  type CreateStockStatusValue,
} from '@car-stock/shared/constants';
import { authService } from '../auth/auth.service';
import { Decimal } from '@prisma/client/runtime/library';
import { NotFoundError, ForbiddenError, ConflictError, BadRequestError } from '../../lib/errors';
import { buildStockAttributeWhere } from './stock-filter.helpers';

/** SOLD rows may only change `notes`; any other PATCH field stays rejected. */
export function isNotesOnlyStockUpdate(data: Record<string, unknown>): boolean {
  const keys = Object.keys(data).filter((k) => data[k] !== undefined);
  return keys.length === 1 && keys[0] === 'notes';
}

export class StockService {
  /**
   * Cost-related fields to strip for users without STOCK_VIEW_COST permission
   */
  private static readonly COST_FIELDS = [
    'baseCost', 'transportCost', 'accessoryCost', 'otherCosts',
    'interestRate', 'accumulatedInterest',
    'financeProvider', 'financePaymentDate', 'interestPrincipalBase',
    'stopInterestCalc', 'interestStoppedAt',
    'debtAmount', 'paidDebtAmount', 'paidInterestAmount',
    'remainingDebt', 'debtStatus', 'debtPaidOffDate',
  ];

  /**
   * Strip cost fields from stock data if user lacks STOCK_VIEW_COST permission
   */
  private stripCostFields(data: any, currentUser: any): any {
    if (authService.hasPermission(currentUser.role, 'STOCK_VIEW_COST')) {
      return data;
    }
    const stripped = { ...data };
    for (const field of StockService.COST_FIELDS) {
      delete stripped[field];
    }
    return stripped;
  }

  /**
   * Calculate days in stock
   */
  private calculateDaysInStock(arrivalDate: Date | null): number {
    if (!arrivalDate) return 0;
    const today = new Date();
    const diffTime = Math.abs(today.getTime() - arrivalDate.getTime());
    return Math.floor(diffTime / (1000 * 60 * 60 * 24));
  }

  /**
   * Calculate accumulated interest
   */
  private calculateAccumulatedInterest(
    baseCost: number,
    transportCost: number,
    accessoryCost: number,
    otherCosts: number,
    interestRate: number,
    arrivalDate: Date | null,
    orderDate: Date | null,
    interestPrincipalBase: string,
    stopInterestCalc: boolean,
    interestStoppedAt: Date | null,
    debtStatus: string,
    soldDate?: Date | null,
    interestPeriods?: Array<{
      startDate: Date;
      endDate: Date | null;
      annualRate: number | Decimal;
      principalAmount: number | Decimal;
      calculatedInterest: number | Decimal;
    }>
  ): number {
    if (!arrivalDate && !orderDate) return 0;
    const totalCost = baseCost + transportCost + accessoryCost + otherCosts;
    const principalAmount = interestPrincipalBase === 'BASE_COST_ONLY' ? baseCost : totalCost;
    const today = new Date();
    const activeEndDate = soldDate || today;
    const interestStartDate = orderDate ?? arrivalDate;
    if (!interestStartDate) return 0;
    const hasStopDate = stopInterestCalc && interestStoppedAt;
    const endDate = hasStopDate
      ? new Date(Math.min(activeEndDate.getTime(), interestStoppedAt!.getTime()))
      : activeEndDate;
    const canAccrueActiveInterest = debtStatus !== 'PAID_OFF' && !stopInterestCalc;

    if (interestPeriods && interestPeriods.length > 0) {
      let totalAccumulatedInterest = 0;

      interestPeriods.forEach((period) => {
        if (period.endDate) {
          totalAccumulatedInterest += Number(period.calculatedInterest);
          return;
        }

        if (!canAccrueActiveInterest) {
          return;
        }

        const days = Math.ceil(
          Math.abs(activeEndDate.getTime() - period.startDate.getTime()) / (1000 * 60 * 60 * 24)
        );
        const dailyRate = Number(period.annualRate) / 100 / 365;
        totalAccumulatedInterest += Number(period.principalAmount) * dailyRate * days;
      });

      return totalAccumulatedInterest;
    }

    const canAccrueInterest = debtStatus !== 'PAID_OFF' || hasStopDate;

    if (!canAccrueInterest) {
      return 0;
    }

    const days = Math.ceil(Math.abs(endDate.getTime() - interestStartDate.getTime()) / (1000 * 60 * 60 * 24));

    // Annual rate to daily rate (interestRate is decimal, e.g., 0.05 for 5%)
    const dailyRate = interestRate / 365;
    return principalAmount * dailyRate * days;
  }

  /**
   * Get all stock with pagination and filters
   */
  async getAllStock(params: any, currentUser: any) {
    // Check permission
    if (!authService.hasPermission(currentUser.role, 'STOCK_VIEW')) {
      throw new ForbiddenError();
    }

    const validated = StockFilterSchema.parse(params);
    const skip = (validated.page - 1) * validated.limit;

    let where: any = {
      deletedAt: null, // Exclude soft deleted records
      ...buildStockAttributeWhere(validated),
    };

    if (validated.search) {
      where.OR = [
        { vin: { contains: validated.search, mode: 'insensitive' } },
        { vehicleModel: { brand: { contains: validated.search, mode: 'insensitive' } } },
        { vehicleModel: { model: { contains: validated.search, mode: 'insensitive' } } },
        { exteriorColor: { contains: validated.search, mode: 'insensitive' } },
      ];
    }

    if (validated.status) {
      where.status = validated.status;
    }

    if (validated.vehicleModelId) {
      where.vehicleModelId = validated.vehicleModelId;
    }

    const [stocks, total] = await Promise.all([
      db.stock.findMany({
        where,
        select: {
          id: true,
          vin: true,
          engineNumber: true,
          vehicleModel: {
            select: {
              id: true,
              brand: true,
              model: true,
              variant: true,
              year: true,
              price: true,
            },
          },
          exteriorColor: true,
          interiorColor: true,
          status: true,
          parkingSlot: true,
          baseCost: true,
          transportCost: true,
          accessoryCost: true,
          otherCosts: true,
          interestRate: true,
          interestPrincipalBase: true,
          orderDate: true,
          stopInterestCalc: true,
          interestStoppedAt: true,
          debtStatus: true,
          soldDate: true,
          interestPeriods: {
            select: {
              startDate: true,
              endDate: true,
              annualRate: true,
              principalAmount: true,
              calculatedInterest: true,
            },
          },
          accumulatedInterest: true,
          expectedSalePrice: true,
          actualSalePrice: true,
          arrivalDate: true,
          createdAt: true,
        },
        skip,
        take: validated.limit,
        orderBy: { arrivalDate: 'desc' },
      }),
      db.stock.count({ where }),
    ]);

    const canViewCost = authService.hasPermission(currentUser.role, 'STOCK_VIEW_COST');

    const data = stocks.map((stock: any) => {
      const { interestPeriods, ...stockData } = stock;

      const result: any = {
        ...stockData,
        calculatedInterest: this.calculateAccumulatedInterest(
          Number(stock.baseCost),
          Number(stock.transportCost),
          Number(stock.accessoryCost),
          Number(stock.otherCosts),
          Number(stock.interestRate),
          stock.arrivalDate,
          stock.orderDate,
          stock.interestPrincipalBase,
          stock.stopInterestCalc,
          stock.interestStoppedAt,
          stock.debtStatus,
          stock.soldDate,
          interestPeriods
        ),
      };

      return canViewCost ? result : this.stripCostFields(result, currentUser);
    });

    return {
      data,
      meta: {
        total,
        page: validated.page,
        limit: validated.limit,
        totalPages: Math.ceil(total / validated.limit),
        hasNextPage: validated.page < Math.ceil(total / validated.limit),
        hasPrevPage: validated.page > 1,
      },
    };
  }

  /**
   * Get stock by ID
   */
  async getStockById(id: string, currentUser: any) {
    // Check permission
    if (!authService.hasPermission(currentUser.role, 'STOCK_VIEW')) {
      throw new ForbiddenError();
    }

    const stock = await db.stock.findUnique({
      where: { id },
      select: {
        id: true,
        vin: true,
        engineNumber: true,
        motorNumber1: true,
        motorNumber2: true,
        vehicleModelId: true,
        vehicleModel: {
          select: {
            id: true,
            brand: true,
            model: true,
            variant: true,
            year: true,
            type: true,
          },
        },
        exteriorColor: true,
        interiorColor: true,
        arrivalDate: true,
        orderDate: true,
        status: true,
        parkingSlot: true,
        baseCost: true,
        transportCost: true,
        accessoryCost: true,
        otherCosts: true,
        financeProvider: true,
        interestRate: true,
        interestPrincipalBase: true,
        accumulatedInterest: true,
        financePaymentDate: true,
        stopInterestCalc: true,
        interestStoppedAt: true,
        debtStatus: true,
        soldDate: true,



        expectedSalePrice: true,
        actualSalePrice: true,
        deliveryNotes: true,
        notes: true,
        createdAt: true,
        updatedAt: true,
        interestPeriods: {
          select: {
            startDate: true,
            endDate: true,
            annualRate: true,
            principalAmount: true,
            calculatedInterest: true,
          },
        },
        sale: {
          select: {
            id: true,
            saleNumber: true,
            customer: {
              select: {
                id: true,
                code: true,
                name: true,
              },
            },
            totalAmount: true,
            status: true,
            deliveryDate: true,
          },
        },
      },
    });

    if (!stock) {
      throw new NotFoundError('Stock');
    }

    // Calculate days in stock
    const daysInStock = this.calculateDaysInStock(stock.arrivalDate);

    // Recalculate accumulated interest
    const accumulatedInterest = this.calculateAccumulatedInterest(
      Number(stock.baseCost),
      Number(stock.transportCost),
      Number(stock.accessoryCost),
      Number(stock.otherCosts),
      Number(stock.interestRate),
      stock.arrivalDate,
      stock.orderDate,
      stock.interestPrincipalBase,
      stock.stopInterestCalc,
      stock.interestStoppedAt,
      stock.debtStatus,
      stock.soldDate,
      stock.interestPeriods
    );

    const result = {
      ...(() => {
        const { interestPeriods, ...rest } = stock;
        return rest;
      })(),
      daysInStock,
      calculatedInterest: accumulatedInterest,
    };

    return this.stripCostFields(result, currentUser);
  }

  /**
   * Generate stock number (STK-YYYY-XXXX)
   */
  private async generateStockNumber(arrivalDate?: Date | null): Promise<string> {
    const date = arrivalDate ? new Date(arrivalDate) : new Date();
    const month = date.getMonth() + 1;
    const buddhistYear = date.getFullYear() + 543;
    const prefix = NUMBER_PREFIXES.STOCK;
    const mm = month.toString().padStart(2, '0');

    const sequence = await db.numberSequence.upsert({
      where: { prefix_year_month: { prefix, year: buddhistYear, month } },
      create: { prefix, year: buddhistYear, month, lastNumber: 1 },
      update: { lastNumber: { increment: 1 } },
    });

    return `${prefix}${mm}${buddhistYear}${sequence.lastNumber.toString().padStart(4, '0')}`;
  }

  /**
   * Create new stock
   */
  async createStock(data: any, currentUser: any) {
    // Check permission
    if (!authService.hasPermission(currentUser.role, 'STOCK_CREATE')) {
      throw new ForbiddenError();
    }

    const validated = CreateStockSchema.parse(data);

    // Sanitize empty strings to null for unique optional fields
    const engineNumber = validated.engineNumber?.trim() || null;
    const motorNumber1 = validated.motorNumber1?.trim() || null;
    const motorNumber2 = validated.motorNumber2?.trim() || null;

    // Check if VIN exists (exclude soft-deleted records)
    const existingStock = await db.stock.findFirst({
      where: { vin: validated.vin, deletedAt: null },
    });

    if (existingStock) {
      throw new ConflictError('VIN');
    }

    // Check if Engine Number exists (only when provided, exclude soft-deleted)
    if (engineNumber) {
      const existingEngineNumber = await db.stock.findFirst({
        where: { engineNumber, deletedAt: null },
      });

      if (existingEngineNumber) {
        throw new ConflictError('Engine Number');
      }
    }

    // Check if vehicle model exists
    const vehicleModel = await db.vehicleModel.findUnique({
      where: { id: validated.vehicleModelId },
      select: { id: true },
    });

    if (!vehicleModel) {
      throw new NotFoundError('Vehicle model');
    }

    // Generate stock number based on arrival date
    const stockNumber = await this.generateStockNumber(validated.arrivalDate);

    // Create stock + activity log in a transaction
    const stock = await db.$transaction(async (tx) => {
      const created = await tx.stock.create({
        data: {
          ...validated,
          stockNumber,
          engineNumber,
          motorNumber1,
          motorNumber2,
        },
      });

      await tx.activityLog.create({
        data: {
          userId: currentUser.id,
          action: 'CREATE_STOCK',
          entity: 'STOCK',
          entityId: created.id,
          details: {
            vin: created.vin,
            vehicleModel: validated.vehicleModelId,
          },
        },
      });

      return created;
    });

    return stock;
  }

  /**
   * Update stock
   */
  async updateStock(id: string, data: any, currentUser: any) {
    // Check permission
    if (!authService.hasPermission(currentUser.role, 'STOCK_UPDATE')) {
      throw new ForbiddenError();
    }

    const validated = UpdateStockSchema.parse(data);

    // Check if stock exists
    const existingStock = await db.stock.findUnique({
      where: { id },
      select: { id: true, status: true },
    });

    if (!existingStock) {
      throw new NotFoundError('Stock');
    }

    // Sold stock is frozen except for the free-text note (used on the detail
    // page and the sales-summary หมายเหตุ column).
    if (existingStock.status === 'SOLD' && !isNotesOnlyStockUpdate(validated as Record<string, unknown>)) {
      throw new BadRequestError('Cannot update sold stock');
    }

    // Sanitize empty strings to null for unique optional fields
    const updateData = {
      ...validated,
      // Only sanitize if the field is being updated
      ...(validated.engineNumber !== undefined && { engineNumber: validated.engineNumber?.trim() || null }),
      ...(validated.motorNumber1 !== undefined && { motorNumber1: validated.motorNumber1?.trim() || null }),
      ...(validated.motorNumber2 !== undefined && { motorNumber2: validated.motorNumber2?.trim() || null }),
      ...(validated.notes !== undefined && { notes: validated.notes.trim() || null }),
    };

    // Update stock
    const stock = await db.stock.update({
      where: { id },
      data: updateData,
    });

    if (validated.notes !== undefined) {
      await db.sale.updateMany({
        where: { stockId: id },
        data: { notes: updateData.notes as string | null },
      });
    }

    // Log activity
    await db.activityLog.create({
      data: {
        userId: currentUser.id,
        action: 'UPDATE_STOCK',
        entity: 'STOCK',
        entityId: stock.id,
        details: {
          vin: stock.vin,
          changes: validated,
        },
      },
    });

    return stock;
  }

  /**
   * Update stock status (manual only: AVAILABLE ↔ DEMO).
   * RESERVED / PREPARING / SOLD are driven by the sales module.
   * Transition policy lives in @car-stock/shared/constants.
   */
  async updateStockStatus(
    id: string,
    status: CreateStockStatusValue,
    notes: string | undefined,
    currentUser: any
  ) {
    // Check permission
    if (!authService.hasPermission(currentUser.role, 'STOCK_UPDATE')) {
      throw new ForbiddenError();
    }

    // Check if stock exists
    const existingStock = await db.stock.findUnique({
      where: { id },
      select: { id: true, status: true },
    });

    if (!existingStock) {
      throw new NotFoundError('Stock');
    }

    if (!isManualStockStatusTransitionAllowed(existingStock.status, status)) {
      throw new BadRequestError(
        'สามารถเปลี่ยนสถานะมือได้เฉพาะระหว่าง พร้อมขาย (AVAILABLE) กับ รถ Demo (DEMO) เท่านั้น — สถานะจอง/เตรียมส่งมอบ/ขายแล้วต้องเปลี่ยนผ่านใบสั่งขาย',
        { fromStatus: existingStock.status, toStatus: status }
      );
    }

    // Update status
    const stock = await db.stock.update({
      where: { id },
      data: {
        status,
        notes: notes || undefined,
      },
    });

    // Log activity
    await db.activityLog.create({
      data: {
        userId: currentUser.id,
        action: 'UPDATE_STOCK_STATUS',
        entity: 'STOCK',
        entityId: stock.id,
        details: {
          vin: stock.vin,
          fromStatus: existingStock.status,
          toStatus: status,
          notes,
        },
      },
    });

    // Same shape as GET /stock/:id — the detail page swaps this straight into
    // state, and a bare row (no vehicleModel) crashed it on `.brand`.
    return this.getStockById(stock.id, currentUser);
  }

  /**
   * Recalculate interest for a stock item
   */
  async recalculateInterest(id: string, currentUser: any) {
    // Check permission
    if (!authService.hasPermission(currentUser.role, 'STOCK_UPDATE')) {
      throw new ForbiddenError();
    }

    const stock = await db.stock.findUnique({
      where: { id },
      include: {
        interestPeriods: {
          select: {
            startDate: true,
            endDate: true,
            annualRate: true,
            principalAmount: true,
            calculatedInterest: true,
          },
        },
      },
    });

    if (!stock) {
      throw new NotFoundError('Stock');
    }

    // Calculate accumulated interest
    const accumulatedInterest = this.calculateAccumulatedInterest(
      Number(stock.baseCost),
      Number(stock.transportCost),
      Number(stock.accessoryCost),
      Number(stock.otherCosts),
      Number(stock.interestRate),
      stock.arrivalDate,
      stock.orderDate,
      stock.interestPrincipalBase,
      stock.stopInterestCalc,
      stock.interestStoppedAt,
      stock.debtStatus,
      stock.soldDate,
      stock.interestPeriods
    );

    // Update accumulated interest
    const updatedStock = await db.stock.update({
      where: { id },
      data: {
        accumulatedInterest: new Decimal(accumulatedInterest),
      },
    });

    // Log activity
    await db.activityLog.create({
      data: {
        userId: currentUser.id,
        action: 'RECALCULATE_INTEREST',
        entity: 'STOCK',
        entityId: stock.id,
        details: {
          vin: stock.vin,
          accumulatedInterest,
        },
      },
    });

    return this.getStockById(updatedStock.id, currentUser);
  }

  /**
   * Delete stock
   */
  async deleteStock(id: string, currentUser: any) {
    // Check permission
    if (!authService.hasPermission(currentUser.role, 'STOCK_DELETE')) {
      throw new ForbiddenError();
    }

    // Check if stock exists
    const existingStock = await db.stock.findUnique({
      where: { id },
      select: { id: true, status: true, vin: true, engineNumber: true },
    });

    if (!existingStock) {
      throw new NotFoundError('Stock');
    }

    // Cannot delete sold stock
    if (existingStock.status === 'SOLD') {
      throw new BadRequestError('Cannot delete sold stock');
    }

    const stock = existingStock;

    // Soft delete stock — append timestamp to VIN/engineNumber to free unique constraint
    const deletedAt = new Date();
    const suffix = `_DEL_${deletedAt.getTime()}`;
    await db.stock.update({
      where: { id },
      data: {
        deletedAt,
        vin: existingStock.vin + suffix,
        ...(existingStock.engineNumber ? { engineNumber: existingStock.engineNumber + suffix } : {}),
      },
    });

    // Log activity
    await db.activityLog.create({
      data: {
        userId: currentUser.id,
        action: 'DELETE_STOCK',
        entity: 'STOCK',
        entityId: id,
        details: {
          vin: stock?.vin,
        },
      },
    });

    return { success: true, message: 'Stock deleted successfully' };
  }

  /**
   * Stock units shown when picking a car for a sale.
   * Includes DEMO so staff can see demo cars in the list; sale/assign still
   * reject DEMO on the write path — UI must disable selection.
   */
  async getAvailableStock() {
    const stocks = await db.stock.findMany({
      where: {
        status: { in: ['AVAILABLE', 'DEMO'] },
        deletedAt: null,
      },
      select: {
        id: true,
        vin: true,
        status: true,
        exteriorColor: true,
        interiorColor: true,
        arrivalDate: true,
        expectedSalePrice: true,
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
      },
      // AVAILABLE first, then DEMO; newest arrival within each group
      orderBy: [{ status: 'asc' }, { arrivalDate: 'desc' }],
    });

    return stocks;
  }

  /**
   * Distinct brand/model and colour values present in (non-deleted) stock, for the
   * stock list + stock report filter dropdowns.
   */
  async getFilterOptions(currentUser: any) {
    if (!authService.hasPermission(currentUser.role, 'STOCK_VIEW')) {
      throw new ForbiddenError();
    }

    const [models, exterior, interior] = await Promise.all([
      db.vehicleModel.findMany({
        where: { stocks: { some: { deletedAt: null } } },
        select: { brand: true, model: true },
        distinct: ['brand', 'model'],
        orderBy: [{ brand: 'asc' }, { model: 'asc' }],
      }),
      db.stock.findMany({
        where: { deletedAt: null },
        select: { exteriorColor: true },
        distinct: ['exteriorColor'],
        orderBy: { exteriorColor: 'asc' },
      }),
      db.stock.findMany({
        where: { deletedAt: null, interiorColor: { not: null } },
        select: { interiorColor: true },
        distinct: ['interiorColor'],
        orderBy: { interiorColor: 'asc' },
      }),
    ]);

    return {
      models,
      exteriorColors: exterior.map((s) => s.exteriorColor).filter(Boolean),
      interiorColors: interior.map((s) => s.interiorColor as string).filter(Boolean),
    };
  }

  /**
   * Get stock statistics
   */
  async getStockStats(currentUser: any) {
    // Check permission
    if (!authService.hasPermission(currentUser.role, 'STOCK_VIEW')) {
      throw new ForbiddenError();
    }

    const [
      totalStock,
      availableStock,
      reservedStock,
      preparingStock,
      soldStock,
      availableStocks,
    ] = await Promise.all([
      db.stock.count({ where: { deletedAt: null } }),
      db.stock.count({ where: { status: 'AVAILABLE', deletedAt: null } }),
      db.stock.count({ where: { status: 'RESERVED', deletedAt: null } }),
      db.stock.count({ where: { status: 'PREPARING', deletedAt: null } }),
      db.stock.count({ where: { status: 'SOLD', deletedAt: null } }),
      db.stock.findMany({
        where: { status: 'AVAILABLE', deletedAt: null },
        select: {
          baseCost: true,
          transportCost: true,
          accessoryCost: true,
          otherCosts: true,
          interestRate: true,
          arrivalDate: true,
          orderDate: true,
          interestPrincipalBase: true,
          stopInterestCalc: true,
          interestStoppedAt: true,
          debtStatus: true,
          soldDate: true,
          financeProvider: true,
          interestPeriods: {
            select: {
              startDate: true,
              endDate: true,
              annualRate: true,
              principalAmount: true,
              calculatedInterest: true,
            },
          },
        },
      }),
    ]);

    const totalValue = availableStocks.reduce(
      (sum: number, stock: (typeof availableStocks)[number]) => {
        const baseCost = Number(stock.baseCost || 0);
        const transportCost = Number(stock.transportCost || 0);
        const accessoryCost = Number(stock.accessoryCost || 0);
        const otherCosts = Number(stock.otherCosts || 0);
        const costWithoutInterest = baseCost + transportCost + accessoryCost + otherCosts;
        const accumulatedInterest = stock.financeProvider
          ? this.calculateAccumulatedInterest(
              baseCost,
              transportCost,
              accessoryCost,
              otherCosts,
              Number(stock.interestRate || 0),
              stock.arrivalDate,
              stock.orderDate,
              stock.interestPrincipalBase,
              stock.stopInterestCalc,
              stock.interestStoppedAt,
              stock.debtStatus,
              stock.soldDate,
              stock.interestPeriods
            )
          : 0;

        return sum + costWithoutInterest + accumulatedInterest;
      },
      0
    );

    const canViewCost = authService.hasPermission(currentUser.role, 'STOCK_VIEW_COST');

    return {
      totalStock,
      availableStock,
      reservedStock,
      preparingStock,
      soldStock,
      ...(canViewCost ? { totalValue } : {}),
    };
  }
}

export const stockService = new StockService();
