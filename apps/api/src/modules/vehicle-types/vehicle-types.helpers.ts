import { BadRequestError } from '../../lib/errors';

/** The former VehicleType enum values — seeded by migration 20261024081659 and prisma/seed.ts. */
export const DEFAULT_VEHICLE_TYPES: ReadonlyArray<{
  code: string;
  nameTh: string;
  sortOrder: number;
}> = [
  { code: 'SEDAN', nameTh: 'เก๋ง', sortOrder: 10 },
  { code: 'PICKUP', nameTh: 'กระบะ', sortOrder: 20 },
  { code: 'SUV', nameTh: 'SUV', sortOrder: 30 },
  { code: 'CROSSOVER', nameTh: 'ครอสโอเวอร์', sortOrder: 40 },
  { code: 'HATCHBACK', nameTh: 'แฮทช์แบ็ก', sortOrder: 50 },
  { code: 'MPV', nameTh: 'MPV', sortOrder: 60 },
  { code: 'VAN', nameTh: 'รถตู้', sortOrder: 70 },
  { code: 'COUPE', nameTh: 'คูเป้', sortOrder: 80 },
  { code: 'CONVERTIBLE', nameTh: 'เปิดประทุน', sortOrder: 90 },
  { code: 'WAGON', nameTh: 'สเตชันแวกอน', sortOrder: 100 },
  { code: 'TRUCK', nameTh: 'รถบรรทุก', sortOrder: 110 },
  { code: 'EV', nameTh: 'รถไฟฟ้า (EV)', sortOrder: 120 },
  { code: 'MOTORCYCLE', nameTh: 'มอเตอร์ไซค์', sortOrder: 130 },
];

const CODE_PATTERN = /^[A-Z0-9_]{1,30}$/;

/** Upper-cases and trims a code; null when it is not A-Z, 0-9 or _ (max 30 chars). */
export function normalizeVehicleTypeCode(raw: string): string | null {
  const code = raw.trim().toUpperCase();
  return CODE_PATTERN.test(code) ? code : null;
}

/** A type can be deleted only when no vehicle model points at it. */
export function vehicleTypeDeleteBlocked(modelCount: number): boolean {
  return modelCount > 0;
}

export function cannotDeleteVehicleTypeError(nameTh: string, modelCount: number): BadRequestError {
  return new BadRequestError(
    `ลบประเภทรถ "${nameTh}" ไม่ได้ เพราะมีรุ่นรถใช้อยู่ ${modelCount} รุ่น — ให้ปิดใช้งานแทน`
  );
}

/** Throws unless the type exists and is active (used when a vehicle model picks a type). */
export function assertVehicleTypeUsable(
  row: { isActive: boolean; nameTh?: string } | null,
  code: string
): void {
  if (!row) {
    throw new BadRequestError(`ไม่พบประเภทรถ "${code}"`);
  }
  if (!row.isActive) {
    throw new BadRequestError(`ประเภทรถ "${row.nameTh ?? code}" ถูกปิดใช้งานแล้ว`);
  }
}

/** True when an update sends a type different from the stored one. */
export function isVehicleTypeChange(next: string | undefined, current: string): boolean {
  return next !== undefined && next !== current;
}
