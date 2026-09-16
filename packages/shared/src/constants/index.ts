// ============================================
// Application Constants
// ============================================

export const APP_NAME = 'VBeyond Car Sales';
export const APP_VERSION = '1.0.0';

// ============================================
// Company Information
// ============================================

export const COMPANY = {
  name: 'บริษัท วีบียอนด์ อินโนเวชั่น จำกัด',
  nameEn: 'VBeyond Innovation Co., Ltd.',
  address: {
    houseNumber: '438/288',
    street: 'ถนนมิตรภาพ-หนองคาย',
    subdistrict: 'ตำบลในเมือง',
    district: 'อำเภอเมือง',
    province: 'จังหวัดนครราชสีมา',
    postalCode: '30000',
  },
  phone: '044-272-888',
  fax: '044-271-224',
  fullAddress: '438/288 ถนนมิตรภาพ-หนองคาย ตำบลในเมือง อำเภอเมือง จังหวัดนครราชสีมา 30000',
} as const;

// ============================================
// Role Labels (Thai)
// ============================================

export const ROLE_LABELS = {
  ADMIN: 'กรรมการ',
  SALES_MANAGER: 'ผู้จัดการขาย',
  STOCK_STAFF: 'พนักงานสต็อก',
  ACCOUNTANT: 'พนักงานบัญชี',
  SALES_STAFF: 'พนักงานขาย',
} as const;

// ============================================
// Status Labels (Thai)
// ============================================

export const STOCK_STATUS_LABELS = {
  AVAILABLE: 'พร้อมขาย',
  RESERVED: 'จองแล้ว',
  PREPARING: 'เตรียมส่งมอบ',
  SOLD: 'ขายแล้ว',
  DEMO: 'รถ Demo',
} as const;

/** Full stock status set (mirrors StockStatusSchema / Prisma enum). */
export type StockStatusValue = keyof typeof STOCK_STATUS_LABELS;

/**
 * Statuses allowed when creating stock.
 * Sales-lifecycle statuses (RESERVED / PREPARING / SOLD) come from the sales flow only.
 */
export const CREATE_STOCK_STATUSES = ['AVAILABLE', 'DEMO'] as const;
export type CreateStockStatusValue = (typeof CREATE_STOCK_STATUSES)[number];

/**
 * Manual stock status transitions outside the sales flow.
 * Only AVAILABLE ↔ DEMO; RESERVED / PREPARING / SOLD are owned by sales.
 */
export const MANUAL_STOCK_STATUS_TRANSITIONS = {
  AVAILABLE: ['DEMO'],
  DEMO: ['AVAILABLE'],
} as const satisfies Partial<Record<StockStatusValue, readonly CreateStockStatusValue[]>>;

/** Targets reachable by a manual status change from `from`, or undefined if none. */
export function getManualStockStatusTargets(
  from: StockStatusValue | string
): readonly CreateStockStatusValue[] | undefined {
  if (from === 'AVAILABLE' || from === 'DEMO') {
    return MANUAL_STOCK_STATUS_TRANSITIONS[from];
  }
  return undefined;
}

/** Whether a manual status transition is allowed (same status is a no-op and allowed). */
export function isManualStockStatusTransitionAllowed(
  from: StockStatusValue | string,
  to: StockStatusValue | string
): boolean {
  if (from === to) return true;
  const targets = getManualStockStatusTargets(from);
  return (targets as readonly string[] | undefined)?.includes(to) ?? false;
}

// ============================================
// Stock interest rate units
// UI: percent per year (6.5 = 6.5%). API/DB: fraction (0.065).
// Prisma Stock.interestRate is Decimal(5,4) → absolute value < 10.
// ============================================

/** Product/UI max for percent-per-year input. */
export const INTEREST_RATE_PERCENT_MAX = 100;

/** API/DB fraction hard limit (Decimal(5,4)). */
export const INTEREST_RATE_FRACTION_MAX = 9.9999;

export function percentToInterestRate(percent: number): number {
  return percent / 100;
}

export function interestRateToPercent(rate: number): number {
  return rate * 100;
}

export function isValidInterestPercent(percent: number): boolean {
  return Number.isFinite(percent) && percent >= 0 && percent <= INTEREST_RATE_PERCENT_MAX;
}

export const SALE_STATUS_LABELS = {
  RESERVED: 'จองแล้ว',
  PREPARING: 'เตรียมส่งมอบ',
  DELIVERED: 'ส่งมอบแล้ว',
  COMPLETED: 'เสร็จสิ้น',
  CANCELLED: 'ยกเลิก',
} as const;

export const CUSTOMER_TYPE_LABELS = {
  INDIVIDUAL: 'บุคคลธรรมดา',
  COMPANY: 'นิติบุคคล',
} as const;

export const SALES_TYPE_LABELS = {
  NORMAL_SALES: 'ขายปกติ',
  FLEET_SALES: 'ขายฟลีท',
} as const;

export const SALE_TYPE_LABELS = {
  RESERVATION_SALE: 'ขายผ่านการจอง',
  DIRECT_SALE: 'ขายตรง',
} as const;

export const PAYMENT_MODE_LABELS = {
  CASH: 'เงินสด',
  FINANCE: 'ผ่านไฟแนนซ์',
  MIXED: 'ผสม',
} as const;

export const PAYMENT_TYPE_LABELS = {
  DEPOSIT: 'เงินจอง',
  DOWN_PAYMENT: 'เงินดาวน์',
  FINANCE_PAYMENT: 'ยอดไฟแนนซ์',
  OTHER_EXPENSE: 'ค่าใช้จ่ายอื่น',
  MISCELLANEOUS: 'รายการทั่วไป',
} as const;

export const PAYMENT_METHOD_LABELS = {
  CASH: 'เงินสด',
  BANK_TRANSFER: 'โอนเงิน',
  CHEQUE: 'เช็ค',
  CREDIT_CARD: 'บัตรเครดิต',
} as const;

export const REFUND_POLICY_LABELS = {
  FULL: 'คืนเงินเต็มจำนวน',
  PARTIAL: 'คืนเงินบางส่วน',
  NO_REFUND: 'ไม่คืนเงิน',
} as const;

export const VEHICLE_TYPE_LABELS = {
  SUV: 'SUV',
  SEDAN: 'Sedan',
  PICKUP: 'Pickup',
  HATCHBACK: 'Hatchback',
  MPV: 'MPV',
  COUPE: 'Coupe',
  CONVERTIBLE: 'Convertible',
  WAGON: 'Wagon',
  VAN: 'Van',
  TRUCK: 'Truck',
  CROSSOVER: 'Crossover',
  EV: 'Electric Vehicle',
} as const;

export const QUOTATION_STATUS_LABELS = {
  DRAFT: 'ร่าง',
  SENT: 'ส่งแล้ว',
  ACCEPTED: 'ซื้อ',
  REJECTED: 'ไม่ซื้อ',
  EXPIRED: 'หมดอายุ',
  CONVERTED: 'แปลงเป็นการจอง',
} as const;

export const CAMPAIGN_STATUS_LABELS = {
  DRAFT: 'ร่าง',
  ACTIVE: 'ใช้งาน',
  ENDED: 'สิ้นสุด',
} as const;

// ============================================
// Document Labels
// ============================================

export const DOCUMENT_TYPE_LABELS = {
  RESERVATION_CONTRACT: 'สัญญาจองรถยนต์',
  SHORT_RESERVATION_FORM: 'ใบจอง (ย่อ)',
  CAR_DETAIL_CARD: 'การ์ดรายละเอียดรถยนต์',
  SALES_CONFIRMATION: 'หนังสือยืนยันการซื้อ-ขาย',
  SALES_RECORD: 'ใบบันทึกการขาย',
  DELIVERY_RECEIPT: 'ใบปล่อยรถ/ใบรับรถ',
  THANK_YOU_LETTER: 'หนังสือขอบคุณ',
} as const;

// ============================================
// Number Prefixes
// ============================================

export const NUMBER_PREFIXES = {
  CUSTOMER: 'CUST',
  SALE: 'SL',
  QUOTATION: 'QTN',
  RESERVATION: 'RSV',
  RECEIPT: 'RCPT',
  STOCK: 'STK',
} as const;

// ============================================
// Pagination Defaults
// ============================================

export const PAGINATION = {
  DEFAULT_PAGE: 1,
  DEFAULT_LIMIT: 20,
  MAX_LIMIT: 100,
} as const;

// ============================================
// Status Colors (for UI)
// ============================================

export const STOCK_STATUS_COLORS = {
  AVAILABLE: 'green',
  RESERVED: 'yellow',
  PREPARING: 'blue',
  SOLD: 'gray',
  DEMO: 'purple',
} as const;

export const SALE_STATUS_COLORS = {
  RESERVED: 'yellow',
  PREPARING: 'orange',
  DELIVERED: 'cyan',
  COMPLETED: 'green',
  CANCELLED: 'red',
} as const;

// ============================================
// Thai Provinces (for dropdown)
// ============================================

export const THAI_PROVINCES = [
  'กรุงเทพมหานคร',
  'กระบี่',
  'กาญจนบุรี',
  'กาฬสินธุ์',
  'กำแพงเพชร',
  'ขอนแก่น',
  'จันทบุรี',
  'ฉะเชิงเทรา',
  'ชลบุรี',
  'ชัยนาท',
  'ชัยภูมิ',
  'ชุมพร',
  'เชียงราย',
  'เชียงใหม่',
  'ตรัง',
  'ตราด',
  'ตาก',
  'นครนายก',
  'นครปฐม',
  'นครพนม',
  'นครราชสีมา',
  'นครศรีธรรมราช',
  'นครสวรรค์',
  'นนทบุรี',
  'นราธิวาส',
  'น่าน',
  'บึงกาฬ',
  'บุรีรัมย์',
  'ปทุมธานี',
  'ประจวบคีรีขันธ์',
  'ปราจีนบุรี',
  'ปัตตานี',
  'พระนครศรีอยุธยา',
  'พังงา',
  'พัทลุง',
  'พิจิตร',
  'พิษณุโลก',
  'เพชรบุรี',
  'เพชรบูรณ์',
  'แพร่',
  'พะเยา',
  'ภูเก็ต',
  'มหาสารคาม',
  'มุกดาหาร',
  'แม่ฮ่องสอน',
  'ยะลา',
  'ยโสธร',
  'ร้อยเอ็ด',
  'ระนอง',
  'ระยอง',
  'ราชบุรี',
  'ลพบุรี',
  'ลำปาง',
  'ลำพูน',
  'เลย',
  'ศรีสะเกษ',
  'สกลนคร',
  'สงขลา',
  'สตูล',
  'สมุทรปราการ',
  'สมุทรสงคราม',
  'สมุทรสาคร',
  'สระแก้ว',
  'สระบุรี',
  'สิงห์บุรี',
  'สุโขทัย',
  'สุพรรณบุรี',
  'สุราษฎร์ธานี',
  'สุรินทร์',
  'หนองคาย',
  'หนองบัวลำภู',
  'อ่างทอง',
  'อุดรธานี',
  'อุทัยธานี',
  'อุตรดิตถ์',
  'อุบลราชธานี',
  'อำนาจเจริญ',
] as const;

// ============================================
// Permission Matrix
// ============================================

export const PERMISSIONS = {
  // User Management
  USER_CREATE: ['ADMIN'],
  USER_UPDATE: ['ADMIN'],
  USER_DELETE: ['ADMIN'],
  USER_VIEW: ['ADMIN'],

  // Customer Management
  CUSTOMER_CREATE: ['ADMIN', 'SALES_MANAGER', 'SALES_STAFF', 'ACCOUNTANT'],
  CUSTOMER_UPDATE: ['ADMIN', 'SALES_MANAGER', 'SALES_STAFF', 'ACCOUNTANT'],
  CUSTOMER_DELETE: ['ADMIN'],
  CUSTOMER_VIEW: ['ADMIN', 'SALES_MANAGER', 'SALES_STAFF', 'ACCOUNTANT'],

  // Vehicle Model Management
  VEHICLE_VIEW: ['ADMIN', 'SALES_MANAGER', 'STOCK_STAFF', 'ACCOUNTANT', 'SALES_STAFF'],
  VEHICLE_EDIT: ['ADMIN', 'STOCK_STAFF'],

  // Stock Management
  STOCK_CREATE: ['ADMIN', 'STOCK_STAFF'],
  STOCK_UPDATE: ['ADMIN', 'STOCK_STAFF'],
  STOCK_DELETE: ['ADMIN'],
  STOCK_VIEW: ['ADMIN', 'SALES_MANAGER', 'STOCK_STAFF', 'ACCOUNTANT', 'SALES_STAFF'],
  STOCK_VIEW_COST: ['ADMIN', 'STOCK_STAFF'],

  // Sales Management
  SALE_CREATE: ['ADMIN', 'SALES_MANAGER', 'SALES_STAFF', 'ACCOUNTANT'],
  SALE_UPDATE: ['ADMIN', 'ACCOUNTANT'],
  SALE_STATUS_UPDATE: ['ADMIN', 'SALES_MANAGER', 'SALES_STAFF', 'ACCOUNTANT'],
  SALE_CANCEL: ['ADMIN'],
  SALE_ASSIGN_STOCK: ['ADMIN', 'SALES_MANAGER', 'SALES_STAFF', 'ACCOUNTANT'],
  SALE_DELETE: ['ADMIN'],
  SALE_VIEW: ['ADMIN', 'SALES_MANAGER', 'STOCK_STAFF', 'ACCOUNTANT', 'SALES_STAFF'],
  SALE_VIEW_PROFIT: ['ADMIN', 'SALES_MANAGER'],
  SALE_DISCOUNT: ['ADMIN', 'SALES_MANAGER', 'STOCK_STAFF', 'ACCOUNTANT', 'SALES_STAFF'],

  // Quotation Management
  QUOTATION_CREATE: ['ADMIN', 'SALES_MANAGER', 'SALES_STAFF', 'ACCOUNTANT'],
  QUOTATION_UPDATE: ['ADMIN', 'SALES_MANAGER', 'SALES_STAFF', 'ACCOUNTANT'],
  QUOTATION_DELETE: ['ADMIN'],
  QUOTATION_CONVERT: ['ADMIN', 'SALES_MANAGER', 'SALES_STAFF', 'ACCOUNTANT'],

  // Payment Management
  PAYMENT_CREATE: ['ADMIN', 'ACCOUNTANT'],
  PAYMENT_UPDATE: ['ADMIN', 'ACCOUNTANT'],
  PAYMENT_VOID: ['ADMIN', 'ACCOUNTANT'],
  PAYMENT_VIEW: ['ADMIN', 'SALES_MANAGER', 'STOCK_STAFF', 'ACCOUNTANT', 'SALES_STAFF'],

  // Campaign Management
  CAMPAIGN_CREATE: ['ADMIN'],
  CAMPAIGN_UPDATE: ['ADMIN'],
  CAMPAIGN_DELETE: ['ADMIN'],
  CAMPAIGN_VIEW: ['ADMIN', 'SALES_MANAGER', 'ACCOUNTANT', 'SALES_STAFF'],

  // Interest Management
  INTEREST_VIEW: ['ADMIN', 'ACCOUNTANT', 'STOCK_STAFF'],
  INTEREST_UPDATE: ['ADMIN', 'ACCOUNTANT'],

  // Reports
  REPORTS_INDEX: ['ADMIN', 'SALES_MANAGER', 'STOCK_STAFF', 'ACCOUNTANT'],
  REPORT_ALL: ['ADMIN'],
  REPORT_SALES: ['ADMIN', 'SALES_MANAGER'],
  REPORT_STOCK: ['ADMIN', 'SALES_MANAGER', 'STOCK_STAFF'],
  REPORT_FINANCE: ['ADMIN', 'ACCOUNTANT'],

  // Settings
  SETTINGS_VIEW: ['ADMIN'],

  // System update / backup
  SYSTEM_VIEW: ['ADMIN', 'SALES_MANAGER', 'STOCK_STAFF', 'ACCOUNTANT', 'SALES_STAFF'],
  SYSTEM_UPDATE: ['ADMIN'],

  // Documents
  DOC_CAR_DETAIL_CARD: ['ADMIN', 'STOCK_STAFF', 'ACCOUNTANT'],
  DOC_SALES_RECORD: ['ADMIN', 'ACCOUNTANT'],
  DOC_GENERAL: ['ADMIN', 'SALES_MANAGER', 'STOCK_STAFF', 'ACCOUNTANT', 'SALES_STAFF'],
} as const;

export type Permission = keyof typeof PERMISSIONS;

// ============================================
// Vehicle card (การ์ดรถยนต์) print layout
// ============================================

/** Values printed onto the pre-printed green card, with Thai labels for the layout editor. */
export const VEHICLE_CARD_FIELDS = {
  model: 'รุ่น',
  engineNo: 'เลขเครื่อง',
  chassisNo: 'เลขตัวถัง',
  color: 'สี',
  stockNumber: 'เลขสต็อก',
  orderDate: 'วันที่สั่งซื้อ',
  beforeVatInt: 'ราคาก่อน VAT (บาท)',
  beforeVatDec: 'ราคาก่อน VAT (สต.)',
  vatAmountInt: 'VAT (บาท)',
  vatAmountDec: 'VAT (สต.)',
  totalWithVatInt: 'รวม (บาท)',
  totalWithVatDec: 'รวม (สต.)',
} as const;

export type VehicleCardFieldKey = keyof typeof VEHICLE_CARD_FIELDS;

/** Custom-cut card stock, mm. */
export const VEHICLE_CARD_PAPER = { w: 270, h: 210 } as const;

/** Every printed value box is one row of the pre-printed grid tall, mm. */
export const VEHICLE_CARD_FIELD_HEIGHT = 6.6;
