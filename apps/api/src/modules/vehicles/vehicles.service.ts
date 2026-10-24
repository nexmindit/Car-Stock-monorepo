import { CreateVehicleModelSchema, UpdateVehicleModelSchema } from '@car-stock/shared/schemas';
import type { Prisma } from '@prisma/client';
import { db } from '../../lib/db';
import { AppError, ConflictError, ForbiddenError, NotFoundError } from '../../lib/errors';
import { authService } from '../auth/auth.service';
import { isVehicleTypeChange } from '../vehicle-types/vehicle-types.helpers';
import { vehicleTypesService } from '../vehicle-types/vehicle-types.service';

export function vehicleModelDeleteBlocked(liveStockCount: number, salesCount: number): boolean {
  return liveStockCount > 0 || salesCount > 0;
}

export function cannotDeleteVehicleModelError(): AppError {
  return new AppError(
    'Cannot delete vehicle model with existing stock or sales',
    400,
    'CANNOT_DELETE_VEHICLE_WITH_STOCK',
  );
}

function prismaErrorCode(error: unknown): string | undefined {
  if (error && typeof error === 'object' && 'code' in error && typeof error.code === 'string') {
    return error.code;
  }
  if (error instanceof Error && error.cause) {
    return prismaErrorCode(error.cause);
  }
  return undefined;
}

export function isVehicleModelDeleteFkError(error: unknown): boolean {
  const code = prismaErrorCode(error);
  if (code === 'P2003' || code === 'P2014' || code === 'P2017') {
    return true;
  }
  const message =
    error instanceof Error
      ? `${error.message} ${error.cause instanceof Error ? error.cause.message : ''}`
      : '';
  return /foreign key|restrict|required relation|constraint/i.test(message);
}

export class VehiclesService {
  /**
   * Get all vehicle models with pagination
   */
  async getAllVehicles(
    page: number = 1,
    limit: number = 20,
    search?: string,
    brand?: string
  ) {
    const skip = (page - 1) * limit;

    // brand + search are ANDed: brand narrows the catalog; search matches
    // brand/model/variant within that slice (or the whole catalog).
    const where: Prisma.VehicleModelWhereInput = {};
    if (brand?.trim()) {
      where.brand = { equals: brand.trim(), mode: 'insensitive' };
    }
    if (search?.trim()) {
      const q = search.trim();
      where.OR = [
        { brand: { contains: q, mode: 'insensitive' } },
        { model: { contains: q, mode: 'insensitive' } },
        { variant: { contains: q, mode: 'insensitive' } },
      ];
    }

    const [vehicles, total] = await Promise.all([
      db.vehicleModel.findMany({
        where,
        select: {
          id: true,
          brand: true,
          model: true,
          variant: true,
          year: true,
          type: true,
          price: true,
          standardCost: true,
          targetMargin: true,
          createdAt: true,
          updatedAt: true,
        },
        skip,
        take: limit,
        orderBy: [{ brand: 'asc' }, { model: 'asc' }],
      }),
      db.vehicleModel.count({ where }),
    ]);

    return {
      data: vehicles,
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
   * Get vehicle model by ID
   */
  async getVehicleById(id: string) {
    const vehicle = await db.vehicleModel.findUnique({
      where: { id },
      include: {
        stocks: {
          select: {
            id: true,
            vin: true,
            status: true,
            exteriorColor: true,
            arrivalDate: true,
          },
          orderBy: { arrivalDate: 'desc' },
        },
        _count: {
          select: {
            stocks: true,
            sales: true,
          },
        },
      },
    });

    if (!vehicle) {
      throw new NotFoundError('Vehicle model');
    }

    return vehicle;
  }

  /**
   * Create new vehicle model
   */
  async createVehicle(data: any, currentUser: any) {
    // Check permission (defence in depth — route-level guard is STOCK_CREATE)
    if (!authService.hasPermission(currentUser.role, 'STOCK_CREATE' as any)) {
      throw new ForbiddenError();
    }

    const validated = CreateVehicleModelSchema.parse(data);
    await vehicleTypesService.assertUsable(validated.type);

    // Check for duplicate (brand + model + variant + year)
    const existing = await db.vehicleModel.findFirst({
      where: {
        brand: validated.brand,
        model: validated.model,
        variant: validated.variant,
        year: validated.year,
      },
    });

    if (existing) {
      throw new ConflictError('Vehicle model');
    }

    // Create vehicle model + activity log in transaction
    const vehicle = await db.$transaction(async (tx) => {
      const created = await tx.vehicleModel.create({
        data: validated,
      });

      await tx.activityLog.create({
        data: {
          userId: currentUser.id,
          action: 'CREATE_VEHICLE_MODEL',
          entity: 'VEHICLE_MODEL',
          entityId: created.id,
          details: {
            brand: created.brand,
            model: created.model,
            variant: created.variant,
            year: created.year,
          },
        },
      });

      return created;
    });

    return vehicle;
  }

  /**
   * Update vehicle model
   */
  async updateVehicle(id: string, data: any, currentUser: any) {
    // Check permission
    if (!authService.hasPermission(currentUser.role, 'STOCK_UPDATE' as any)) {
      throw new ForbiddenError();
    }

    const validated = UpdateVehicleModelSchema.parse(data);

    // Check if vehicle exists
    const existingVehicle = await db.vehicleModel.findUnique({
      where: { id },
      select: { id: true, brand: true, model: true, variant: true, year: true, type: true },
    });

    if (!existingVehicle) {
      throw new NotFoundError('Vehicle model');
    }

    // Only a newly picked type must be active — re-saving a model on a retired type is fine.
    if (validated.type && isVehicleTypeChange(validated.type, existingVehicle.type)) {
      await vehicleTypesService.assertUsable(validated.type);
    }

    // Check for duplicate (if updating key fields)
    if (validated.brand || validated.model || validated.variant || validated.year) {
      const checkBrand = validated.brand || existingVehicle.brand;
      const checkModel = validated.model || existingVehicle.model;
      const checkVariant = validated.variant || existingVehicle.variant;
      const checkYear = validated.year || existingVehicle.year;

      const duplicate = await db.vehicleModel.findFirst({
        where: {
          brand: checkBrand,
          model: checkModel,
          variant: checkVariant,
          year: checkYear,
          NOT: { id },
        },
      });

      if (duplicate) {
        throw new ConflictError('Vehicle model');
      }
    }

    // Update vehicle model
    const vehicle = await db.vehicleModel.update({
      where: { id },
      data: validated,
    });

    // Log activity
    await db.activityLog.create({
      data: {
        userId: currentUser.id,
        action: 'UPDATE_VEHICLE_MODEL',
        entity: 'VEHICLE_MODEL',
        entityId: vehicle.id,
        details: {
          brand: vehicle.brand,
          model: vehicle.model,
          changes: validated,
        },
      },
    });

    return vehicle;
  }

  /**
   * Delete vehicle model
   */
  async deleteVehicle(id: string, currentUser: any) {
    // Check permission
    if (!authService.hasPermission(currentUser.role, 'STOCK_DELETE' as any)) {
      throw new ForbiddenError();
    }

    // Live stock / any sale still blocks. Soft-deleted stock is purged below so
    // the RESTRICT FK on stocks.vehicle_model_id does not 500 the request.
    const [liveStockCount, salesCount] = await Promise.all([
      db.stock.count({ where: { vehicleModelId: id, deletedAt: null } }),
      db.sale.count({ where: { vehicleModelId: id } }),
    ]);

    if (vehicleModelDeleteBlocked(liveStockCount, salesCount)) {
      throw cannotDeleteVehicleModelError();
    }

    // Get vehicle for logging
    const vehicle = await db.vehicleModel.findUnique({
      where: { id },
      select: { brand: true, model: true, variant: true, year: true },
    });

    if (!vehicle) {
      throw new NotFoundError('Vehicle model');
    }

    try {
      // Prisma schema omits onDelete for quotations/sales/stocks, so the client
      // Restricts even when the DB would SET NULL / CASCADE. Clear dependents first.
      await db.$transaction(async (tx) => {
        await tx.quotation.updateMany({
          where: { vehicleModelId: id },
          data: { vehicleModelId: null },
        });
        await tx.campaignModelFormula.deleteMany({ where: { vehicleModelId: id } });
        await tx.campaignVehicleModel.deleteMany({ where: { vehicleModelId: id } });
        await tx.sale.updateMany({
          where: { stock: { vehicleModelId: id, deletedAt: { not: null } } },
          data: { stockId: null },
        });
        await tx.stock.deleteMany({
          where: { vehicleModelId: id, deletedAt: { not: null } },
        });
        await tx.vehicleModel.delete({ where: { id } });
      });
    } catch (error) {
      if (isVehicleModelDeleteFkError(error)) {
        throw cannotDeleteVehicleModelError();
      }
      throw error;
    }

    // Log activity
    await db.activityLog.create({
      data: {
        userId: currentUser.id,
        action: 'DELETE_VEHICLE_MODEL',
        entity: 'VEHICLE_MODEL',
        entityId: id,
        details: {
          brand: vehicle.brand,
          model: vehicle.model,
          variant: vehicle.variant,
          year: vehicle.year,
        },
      },
    });

    return { success: true, message: 'Vehicle model deleted successfully' };
  }

  /**
   * Get vehicle models with available stock
   */
  async getAvailableModels() {
    const vehicles = await db.vehicleModel.findMany({
      select: {
        id: true,
        brand: true,
        model: true,
        variant: true,
        year: true,
        type: true,
        primaryColor: true,
        secondaryColor: true,
        mainOptions: true,
        price: true,
        _count: {
          select: {
            stocks: {
              where: { status: 'AVAILABLE' },
            },
          },
        },
      },
      orderBy: [{ brand: 'asc' }, { model: 'asc' }],
    });

    return vehicles;
  }
}

export const vehiclesService = new VehiclesService();
