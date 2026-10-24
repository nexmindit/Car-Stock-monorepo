/**
 * API Error Class
 * Extends Error with additional properties for structured error handling
 */
export class ApiError extends Error {
  public readonly errorCode: string;
  public readonly status: number;
  public readonly details?: Record<string, unknown>;

  constructor(
    errorCode: string,
    message: string,
    status: number = 500,
    details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'ApiError';
    this.errorCode = errorCode;
    this.status = status;
    this.details = details;
  }
}

/**
 * Error code to Thai message mapping
 */
export const ERROR_MESSAGES: Record<string, string> = {
  // Not Found Errors
  'STOCK_NOT_FOUND': 'ไม่พบรถในสต็อก',
  'SALE_NOT_FOUND': 'ไม่พบรายการขาย',
  'CUSTOMER_NOT_FOUND': 'ไม่พบลูกค้า',
  'USER_NOT_FOUND': 'ไม่พบผู้ใช้งาน',
  'VEHICLE_MODEL_NOT_FOUND': 'ไม่พบรุ่นรถ',
  'PAYMENT_NOT_FOUND': 'ไม่พบรายการชำระเงิน',
  'QUOTATION_NOT_FOUND': 'ไม่พบใบเสนอราคา',
  'CAMPAIGN_NOT_FOUND': 'ไม่พบแคมเปญ',
  
  // Conflict Errors
  'VIN_ALREADY_EXISTS': 'เลขตัวถัง (VIN) นี้มีอยู่แล้วในระบบ',
  'ENGINE_NUMBER_ALREADY_EXISTS': 'เลขเครื่องยนต์นี้มีอยู่แล้วในระบบ',
  'TAX_ID_ALREADY_EXISTS': 'เลขประจำตัวผู้เสียภาษีนี้มีอยู่แล้วในระบบ',
  'PASSPORT_NUMBER_ALREADY_EXISTS': 'เลขพาสปอร์ตนี้มีอยู่แล้วในระบบ',
  'USERNAME_ALREADY_EXISTS': 'ชื่อผู้ใช้งานนี้มีอยู่แล้วในระบบ',
  'EMAIL_ALREADY_EXISTS': 'อีเมลนี้มีอยู่แล้วในระบบ',
  'VEHICLE_MODEL_ALREADY_EXISTS': 'รุ่นรถนี้มีอยู่แล้วในระบบ',
  'VEHICLE_TYPE_CODE_ALREADY_EXISTS': 'รหัสประเภทรถนี้มีอยู่แล้วในระบบ',
  'MOTOR_NUMBER_ALREADY_EXISTS': 'เลขมอเตอร์นี้มีอยู่แล้วในระบบ',
  'STOCK_ALREADY_IN_SALE': 'รถคันนี้มีรายการขายอยู่แล้ว',
  'CONTRACT_NUMBER_ALREADY_EXISTS': 'เลขสัญญานี้มีอยู่แล้วในระบบ',

  // Sale-specific errors
  'STOCK_NOT_AVAILABLE': 'รถไม่พร้อมขาย (ไม่ได้สถานะ AVAILABLE)',
  'SALE_ALREADY_COMPLETED': 'รายการขายนี้เสร็จสิ้นแล้ว',
  'SALE_ALREADY_CANCELLED': 'รายการขายนี้ถูกยกเลิกแล้ว',

  // Payment errors
  'PAYMENT_ALREADY_VOIDED': 'รายการชำระเงินนี้ถูกยกเลิกแล้ว',
  'OVERPAYMENT': 'จำนวนเงินเกินยอดที่ต้องชำระ',

  // Permission Errors
  'INSUFFICIENT_PERMISSIONS': 'คุณไม่มีสิทธิ์ทำรายการนี้',
  'UNAUTHORIZED': 'กรุณาเข้าสู่ระบบใหม่',
  
  // Bad Request Errors
  'BAD_REQUEST': 'คำขอไม่ถูกต้อง',
  'VALIDATION_ERROR': 'ข้อมูลที่กรอกไม่ถูกต้อง',
  'CANNOT_UPDATE_SOLD_STOCK': 'ไม่สามารถแก้ไขรถที่ขายแล้ว',
  'CANNOT_DELETE_SOLD_STOCK': 'ไม่สามารถลบรถที่ขายแล้ว',
  'CANNOT_DELETE_CUSTOMER_WITH_SALES': 'ไม่สามารถลบลูกค้าที่มีรายการขาย',
  'CANNOT_DELETE_VEHICLE_WITH_STOCK': 'ไม่สามารถลบรุ่นรถที่มีสต็อกหรือรายการขาย',
  'CANNOT_VOID_ALREADY_VOIDED_PAYMENT': 'ไม่สามารถยกเลิกรายการที่ยกเลิกแล้ว',
  'STOCK_IS_NOT_AVAILABLE': 'รถไม่พร้อมขาย (ไม่ได้สถานะ AVAILABLE)',
  'CAMPAIGN_IS_NOT_ACTIVE': 'แคมเปญไม่ได้อยู่ในสถานะใช้งาน',
  
  // Generic Errors
  'INTERNAL_ERROR': 'เกิดข้อผิดพลาดภายในระบบ',
  'DATABASE_ERROR': 'เกิดข้อผิดพลาดในการเชื่อมต่อฐานข้อมูล',
  'NOT_FOUND': 'ไม่พบข้อมูลที่ต้องการ',
};

/**
 * Get Thai error message from error code.
 *
 * For BAD_REQUEST the API often returns a specific reason (e.g. remaining
 * balance, completed sale). Prefer that over the generic "คำขอไม่ถูกต้อง"
 * so users can act on the real problem.
 */
const GENERIC_FALLBACKS = new Set([
  'Bad Request',
  'BAD_REQUEST',
  'An unexpected error occurred',
  'Request failed',
  'INTERNAL_ERROR',
  'VALIDATION_ERROR',
]);

function shortenErrorMessage(raw: string): string {
  const unknownArg = raw.match(/Unknown argument `[^`]+`/);
  if (unknownArg) return `บันทึกไม่สำเร็จ: ${unknownArg[0]}`;
  const line = raw
    .split('\n')
    .map((s) => s.trim())
    .find((s) => s.length > 0);
  const text = line || raw.trim();
  return text.length > 180 ? `${text.slice(0, 177)}…` : text;
}

export function getErrorMessage(errorCode: string, fallbackMessage?: string): string {
  const specific =
    fallbackMessage &&
    fallbackMessage.trim() &&
    !GENERIC_FALLBACKS.has(fallbackMessage.trim())
      ? shortenErrorMessage(fallbackMessage)
      : undefined;

  if (
    specific &&
    (errorCode === 'BAD_REQUEST' ||
      errorCode === 'INTERNAL_ERROR' ||
      errorCode === 'VALIDATION_ERROR')
  ) {
    return specific;
  }
  return ERROR_MESSAGES[errorCode] || specific || fallbackMessage || 'เกิดข้อผิดพลาดที่ไม่ทราบสาเหตุ';
}

/**
 * Type guard to check if error is ApiError
 */
export function isApiError(error: unknown): error is ApiError {
  return error instanceof ApiError;
}
