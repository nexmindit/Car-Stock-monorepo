import { CreateVehicleTypeSchema, UpdateVehicleTypeSchema } from '@car-stock/shared/schemas';
import type { Prisma } from '@prisma/client';
import { db } from '../../lib/db';
import { ConflictError, NotFoundError } from '../../lib/errors';
import {
  assertVehicleTypeUsable,
  cannotDeleteVehicleTypeError,
  vehicleTypeDeleteBlocked,
} from './vehicle-types.helpers';

type Client = Prisma.TransactionClient | typeof db;

export class VehicleTypesService {
  private static instance: VehicleTypesService;
  private constructor() {}

  public static getInstance(): VehicleTypesService {
    if (!VehicleTypesService.instance) {
      VehicleTypesService.instance = new VehicleTypesService();
    }
    return VehicleTypesService.instance;
  }

  async list(includeInactive = false) {
    return db.vehicleType.findMany({
      where: includeInactive ? {} : { isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { nameTh: 'asc' }],
    });
  }

  /** Throws a 400 unless `code` is an existing, active type. */
  async assertUsable(code: string, client: Client = db) {
    const row = await client.vehicleType.findUnique({ where: { code } });
    assertVehicleTypeUsable(row, code);
  }

  async create(input: unknown) {
    const data = CreateVehicleTypeSchema.parse(input);
    const existing = await db.vehicleType.findUnique({ where: { code: data.code } });
    if (existing) throw new ConflictError('Vehicle type code', data.code);
    return db.vehicleType.create({ data });
  }

  async update(code: string, input: unknown) {
    const data = UpdateVehicleTypeSchema.parse(input);
    const existing = await db.vehicleType.findUnique({ where: { code } });
    if (!existing) throw new NotFoundError('Vehicle type');
    return db.vehicleType.update({ where: { code }, data });
  }

  async remove(code: string) {
    const existing = await db.vehicleType.findUnique({
      where: { code },
      include: { _count: { select: { models: true } } },
    });
    if (!existing) throw new NotFoundError('Vehicle type');
    if (vehicleTypeDeleteBlocked(existing._count.models)) {
      throw cannotDeleteVehicleTypeError(existing.nameTh, existing._count.models);
    }
    await db.vehicleType.delete({ where: { code } });
  }
}

export const vehicleTypesService = VehicleTypesService.getInstance();
