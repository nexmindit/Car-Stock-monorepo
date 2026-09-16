import { z } from 'zod';
import {
  CREATE_STOCK_STATUSES,
  INTEREST_RATE_FRACTION_MAX,
  VEHICLE_CARD_FIELDS,
  VEHICLE_CARD_PAPER,
  type VehicleCardFieldKey,
} from '../constants';

// ============================================
// Enums as Zod schemas
// ============================================

export const RoleSchema = z.enum([
  'ADMIN',
  'SALES_MANAGER',
  'STOCK_STAFF',
  'ACCOUNTANT',
  'SALES_STAFF',
]);

export const UserStatusSchema = z.enum(['ACTIVE', 'INACTIVE']);

export const CustomerTypeSchema = z.enum(['INDIVIDUAL', 'COMPANY']);

export const SalesTypeSchema = z.enum(['NORMAL_SALES', 'FLEET_SALES']);

export const VehicleTypeSchema = z.enum([
  'SEDAN',
  'SUV',
  'HATCHBACK',
  'PICKUP',
  'MPV',
  'COUPE',
  'CONVERTIBLE',
  'WAGON',
  'VAN',
  'TRUCK',
  'CROSSOVER',
  'EV',
]);

export const StockStatusSchema = z.enum(['AVAILABLE', 'RESERVED', 'PREPARING', 'SOLD', 'DEMO']);

/** Initial statuses allowed when creating stock (sales lifecycle statuses are not allowed). */
export const CreateStockStatusSchema = z.enum(CREATE_STOCK_STATUSES);

export const InterestBaseSchema = z.enum(['BASE_COST_ONLY', 'TOTAL_COST']);

export const DebtStatusSchema = z.enum(['NO_DEBT', 'ACTIVE', 'PAID_OFF']);

export const SaleTypeSchema = z.enum(['RESERVATION_SALE', 'DIRECT_SALE']);

// Updated: Removed INQUIRY and QUOTED - these are now handled by Quotation module
export const SaleStatusSchema = z.enum([
  'RESERVED',
  'PREPARING',
  'DELIVERED',
  'COMPLETED',
  'CANCELLED',
]);

export const PaymentModeSchema = z.enum(['CASH', 'FINANCE', 'MIXED']);

export const RefundPolicySchema = z.enum(['FULL', 'PARTIAL', 'NO_REFUND']);

export const PaymentTypeSchema = z.enum([
  'DEPOSIT',
  'DOWN_PAYMENT',
  'FINANCE_PAYMENT',
  'OTHER_EXPENSE',
  'MISCELLANEOUS',
]);

export const PaymentMethodSchema = z.enum(['CASH', 'BANK_TRANSFER', 'CHEQUE', 'CREDIT_CARD']);

export const PaymentStatusSchema = z.enum(['ACTIVE', 'VOIDED']);

export const QuotationStatusSchema = z.enum([
  'DRAFT',
  'SENT',
  'ACCEPTED',
  'REJECTED',
  'EXPIRED',
  'CONVERTED',
]);

export const CampaignStatusSchema = z.enum(['DRAFT', 'ACTIVE', 'ENDED']);

export const DocumentTypeSchema = z.enum([
  'RESERVATION_CONTRACT',
  'SHORT_RESERVATION_FORM',
  'CAR_DETAIL_CARD',
  'SALES_CONFIRMATION',
  'SALES_RECORD',
  'DELIVERY_RECEIPT',
  'THANK_YOU_LETTER',
]);

// ============================================
// Auth Schemas
// ============================================

export const LoginSchema = z.object({
  username: z.string().min(3, 'Username must be at least 3 characters'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
});

export const RegisterSchema = z.object({
  username: z.string().min(3).max(50),
  email: z.string().email(),
  password: z.string().min(6).max(100),
  firstName: z.string().min(1).max(100),
  lastName: z.string().min(1).max(100),
  phone: z.string().optional(),
  role: RoleSchema.default('SALES_STAFF'),
});

// ============================================
// User Schemas
// ============================================

export const UserSchema = z.object({
  id: z.string(),
  username: z.string(),
  email: z.string().email(),
  firstName: z.string(),
  lastName: z.string(),
  phone: z.string().nullable(),
  role: RoleSchema,
  status: UserStatusSchema,
  profileImage: z.string().nullable(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});

export const CreateUserSchema = RegisterSchema;

export const UpdateUserSchema = z.object({
  email: z.string().email().optional(),
  firstName: z.string().min(1).max(100).optional(),
  lastName: z.string().min(1).max(100).optional(),
  phone: z.string().optional(),
  role: RoleSchema.optional(),
  status: UserStatusSchema.optional(),
  profileImage: z.string().optional(),
});

// ============================================
// Customer Schemas
// ============================================

const optionalPassportNumber = z.preprocess(
  (value) => {
    if (value === '' || value === null || value === undefined) return null;
    if (typeof value === 'string') return value.replace(/\s+/g, '');
    return value;
  },
  z
    .string()
    .trim()
    .max(20, 'Passport number is too long')
    .regex(/^[A-Za-z0-9-]+$/, 'Invalid passport number')
    .transform((s) => s.toUpperCase())
    .nullable()
);

export const CustomerSchema = z.object({
  id: z.string(),
  code: z.string(),
  type: CustomerTypeSchema,
  salesType: SalesTypeSchema,
  name: z.string(),
  taxId: z.string().nullable(),
  passportNumber: z.string().nullable(),

  // Address (Thai structure)
  houseNumber: z.string(),
  street: z.string().nullable(),
  subdistrict: z.string(),
  district: z.string(),
  province: z.string(),
  postalCode: z.string().nullable(),

  // Contact
  phone: z.string(),
  email: z.string().nullable(),
  website: z.string().nullable(),

  // Contact Person
  contactName: z.string().nullable(),
  contactRole: z.string().nullable(),
  contactMobile: z.string().nullable(),
  contactEmail: z.string().nullable(),

  // Credit
  creditTermDays: z.number().nullable(),
  creditLimit: z.number().nullable(),
  notes: z.string().nullable(),

  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});

export const CreateCustomerSchema = z.object({
  type: CustomerTypeSchema,
  salesType: SalesTypeSchema.default('NORMAL_SALES'),
  name: z.string().min(1, 'Name is required'),
  taxId: z.string().optional(),
  passportNumber: optionalPassportNumber,

  // Address
  houseNumber: z.string().min(1, 'House number is required'),
  street: z.string().optional(),
  subdistrict: z.string().min(1, 'Subdistrict is required'),
  district: z.string().min(1, 'District is required'),
  province: z.string().min(1, 'Province is required'),
  postalCode: z.string().optional(),

  // Contact
  phone: z.string().min(1, 'Phone is required'),
  email: z.string().email().optional().or(z.literal('')),
  website: z.string().optional(),

  // Contact Person
  contactName: z.string().optional(),
  contactRole: z.string().optional(),
  contactMobile: z.string().optional(),
  contactEmail: z.string().email().optional().or(z.literal('')),

  // Credit
  creditTermDays: z.number().optional(),
  creditLimit: z.number().optional(),
  notes: z.string().optional(),
});

export const UpdateCustomerSchema = CreateCustomerSchema.partial();

// ============================================
// Vehicle Model Schemas
// ============================================

export const VehicleModelSchema = z.object({
  id: z.string(),
  brand: z.string(),
  model: z.string(),
  variant: z.string().nullable(),
  year: z.number(),
  type: VehicleTypeSchema,

  primaryColor: z.string().nullable(),
  secondaryColor: z.string().nullable(),
  colorNotes: z.string().nullable(),

  mainOptions: z.string().nullable(),
  engineSpecs: z.string().nullable(),
  dimensions: z.string().nullable(),

  price: z.number(),
  standardCost: z.number(),
  targetMargin: z.number().nullable(),
  notes: z.string().nullable(),

  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});

export const CreateVehicleModelSchema = z.object({
  brand: z.string().min(1, 'Brand is required'),
  model: z.string().min(1, 'Model is required'),
  variant: z.string().optional(),
  year: z.number().min(2000).max(2100),
  type: VehicleTypeSchema,

  primaryColor: z.string().optional(),
  secondaryColor: z.string().optional(),
  colorNotes: z.string().optional(),

  mainOptions: z.string().optional(),
  engineSpecs: z.string().optional(),
  dimensions: z.string().optional(),

  price: z.number().positive('Price must be positive'),
  standardCost: z.number().positive('Standard cost must be positive'),
  targetMargin: z.number().optional(),
  notes: z.string().optional(),
});

export const UpdateVehicleModelSchema = CreateVehicleModelSchema.partial();

// ============================================
// Stock Schemas
// ============================================

export const StockSchema = z.object({
  id: z.string(),
  vin: z.string(),
  engineNumber: z.string().nullable(),
  motorNumber1: z.string().nullable(),
  motorNumber2: z.string().nullable(),

  vehicleModelId: z.string(),
  exteriorColor: z.string(),
  interiorColor: z.string().nullable(),

  arrivalDate: z.coerce.date().optional().nullable(),
  orderDate: z.coerce.date().nullable(),
  status: StockStatusSchema,
  parkingSlot: z.string().nullable(),

  baseCost: z.number(),
  transportCost: z.number(),
  accessoryCost: z.number(),
  otherCosts: z.number(),
  financeProvider: z.string().nullable(),

  interestRate: z.number(),
  interestPrincipalBase: InterestBaseSchema,
  accumulatedInterest: z.number(),
  financePaymentDate: z.coerce.date().nullable(),
  stopInterestCalc: z.boolean(),
  interestStoppedAt: z.coerce.date().nullable(),

  expectedSalePrice: z.number().nullable(),
  actualSalePrice: z.number().nullable(),
  soldDate: z.coerce.date().nullable(),
  deliveryNotes: z.string().nullable(),
  notes: z.string().nullable(),

  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
  deletedAt: z.coerce.date().nullable(),
});

export const CreateStockSchema = z.object({
  vin: z.string().min(1, 'VIN is required'),
  engineNumber: z.string().optional(),
  motorNumber1: z.string().optional(),
  motorNumber2: z.string().optional(),

  vehicleModelId: z.string().min(1, 'Vehicle model is required'),
  exteriorColor: z.string().min(1, 'Exterior color is required'),
  interiorColor: z.string().optional(),

  // Empty string / null → omit (undefined). Same rule for both date fields.
  arrivalDate: z.preprocess(
    (v) => (v === '' || v === null || v === undefined ? undefined : v),
    z.coerce.date().optional()
  ),
  orderDate: z.preprocess(
    (v) => (v === '' || v === null || v === undefined ? undefined : v),
    z.coerce.date().optional()
  ),
  parkingSlot: z.string().optional(),
  /** Only AVAILABLE or DEMO on create; RESERVED/PREPARING/SOLD come from sales flow. */
  status: CreateStockStatusSchema.optional().default('AVAILABLE'),

  baseCost: z.coerce.number().positive('Base cost must be positive'),
  transportCost: z.coerce.number().min(0).default(0),
  accessoryCost: z.coerce.number().min(0).default(0),
  otherCosts: z.coerce.number().min(0).default(0),
  financeProvider: z.string().optional(),

  // Stored as decimal fraction (0.065 = 6.5%/yr). Cap matches INTEREST_RATE_FRACTION_MAX.
  interestRate: z.coerce
    .number()
    .min(0, 'Interest rate cannot be negative')
    .max(
      INTEREST_RATE_FRACTION_MAX,
      `อัตราดอกเบี้ยสูงเกินไป (ค่าที่ส่งต้องเป็นทศนิยม เช่น 0.065 = 6.5% ต่อปี สูงสุด ${INTEREST_RATE_FRACTION_MAX})`
    )
    .default(0),
  interestPrincipalBase: InterestBaseSchema.default('BASE_COST_ONLY'),

  expectedSalePrice: z.preprocess(
    (v) => (v === '' || v === null || v === undefined ? undefined : v),
    z.coerce.number().positive().optional()
  ),
  notes: z.string().optional(),
});

// Update must not change sales-lifecycle status via general PATCH (use status endpoint / sales flow).
export const UpdateStockSchema = CreateStockSchema.omit({ status: true }).partial();

// ============================================
// Sale Schemas
// ============================================

export const FinanceCustomLineSchema = z.object({
  id: z.string().optional(),
  label: z.string().min(1),
  group: z.enum(['CUSTOMER_CHARGE', 'DEALER', 'INFO']),
  amount: z.number(),
  notes: z.string().optional(),
  sortOrder: z.number().int().optional(),
});

export const SaleSchema = z.object({
  id: z.string(),
  saleNumber: z.string(),
  type: SaleTypeSchema,
  status: SaleStatusSchema,

  customerId: z.string(),
  stockId: z.string().nullable(),
  vehicleModelId: z.string().nullable(),

  preferredExtColor: z.string().nullable(),
  preferredIntColor: z.string().nullable(),

  totalAmount: z.number(),
  depositAmount: z.number(),
  paidAmount: z.number(),
  remainingAmount: z.number(),

  reservedDate: z.coerce.date().nullable(),
  expirationDate: z.coerce.date().nullable(),
  hasExpiration: z.boolean(),
  deliveryDate: z.coerce.date().nullable(),
  completedDate: z.coerce.date().nullable(),

  campaignId: z.string().nullable(),
  discountSnapshot: z.number().nullable(),
  freebiesSnapshot: z.string().nullable(),

  paymentMode: PaymentModeSchema,
  downPayment: z.number().nullable(),
  financeAmount: z.number().nullable(),
  financeProvider: z.string().nullable(),
  insuranceFee: z.number().nullable(),
  compulsoryInsuranceFee: z.number().nullable(),
  registrationFee: z.number().nullable(),
  salesCommission: z.number().nullable(),
  salesExpense: z.number().nullable(),
  financeCommission: z.number().nullable(),

  refundPolicy: RefundPolicySchema,
  refundAmount: z.number().nullable(),

  notes: z.string().nullable(),
  cancellationReason: z.string().nullable(),

  createdById: z.string(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});

export const CreateSaleSchema = z.object({
  type: SaleTypeSchema,
  customerId: z.string().min(1, 'Customer is required'),
  stockId: z.string().optional(),
  vehicleModelId: z.string().optional(),

  preferredExtColor: z.string().optional(),
  preferredIntColor: z.string().optional(),

  totalAmount: z.number().positive('Total amount must be positive'),
  depositAmount: z.number().min(0).default(0),

  expirationDate: z.coerce.date().optional(),
  hasExpiration: z.boolean().default(false),
  deliveryDate: z.coerce.date().optional(),
  // Optional business/sale date — overrides default now() so operators can
  // backdate entries keyed later than the actual sale day.
  createdAt: z.coerce.date().optional(),

  campaignId: z.string().optional(),
  discountSnapshot: z.number().optional(),
  freebiesSnapshot: z.string().optional(),

  paymentMode: PaymentModeSchema.default('CASH'),
  downPayment: z.number().optional(),
  financeAmount: z.number().optional(),
  financeProvider: z.string().optional(),
  carDiscount: z.number().optional(),
  downPaymentDiscount: z.number().optional(),
  insuranceFee: z.number().min(0).optional(),
  compulsoryInsuranceFee: z.number().min(0).optional(),
  registrationFee: z.number().min(0).optional(),
  salesCommission: z.number().min(0).optional(),
  salesExpense: z.number().min(0).optional(),
  financeCommission: z.number().min(0).optional(),
  interestRate: z.number().optional(),
  numberOfTerms: z.number().int().optional(),
  monthlyInstallment: z.number().optional(),

  financeEditedKeys: z.array(z.string()).optional().default([]),
  customLines: z.array(FinanceCustomLineSchema).optional().default([]),

  refundPolicy: RefundPolicySchema.default('FULL'),
  notes: z.string().optional(),
});

export const UpdateSaleSchema = CreateSaleSchema.partial();

// ============================================
// Payment Schemas
// ============================================

export const PaymentSchema = z.object({
  id: z.string(),
  receiptNumber: z.string(),

  customerId: z.string(),
  saleId: z.string().nullable(),
  description: z.string().nullable(),

  paymentDate: z.coerce.date(),
  paymentType: PaymentTypeSchema,
  amount: z.number(),
  paymentMethod: PaymentMethodSchema,
  referenceNumber: z.string().nullable(),
  notes: z.string().nullable(),

  status: PaymentStatusSchema,
  voidReason: z.string().nullable(),
  voidedAt: z.coerce.date().nullable(),

  issuedBy: z.string(),
  createdById: z.string(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});

export const CreatePaymentSchema = z.object({
  saleId: z.string().optional(),
  customerId: z.string().min(1, 'Customer is required'),
  description: z.string().optional(),

  paymentDate: z.coerce.date().default(() => new Date()),
  paymentType: PaymentTypeSchema,
  amount: z.number().positive('Amount must be positive'),
  paymentMethod: PaymentMethodSchema,
  referenceNumber: z.string().optional(),
  notes: z.string().optional(),
  receivingBank: z.string().optional(),
  receivingBankName: z.string().optional(),
  receivingAccountNumber: z.string().optional(),
  receivingBranch: z.string().optional(),
});

export const UpdatePaymentSchema = z.object({
  description: z.string().optional(),
  paymentDate: z.coerce.date().optional(),
  paymentType: PaymentTypeSchema.optional(),
  amount: z.number().positive('Amount must be positive').optional(),
  paymentMethod: PaymentMethodSchema.optional(),
  referenceNumber: z.string().optional(),
  notes: z.string().optional(),
  issuedBy: z.string().optional(),
  receivingBank: z.string().optional(),
  receivingBankName: z.string().optional(),
  receivingAccountNumber: z.string().optional(),
  receivingBranch: z.string().optional(),
});

export const VoidPaymentSchema = z.object({
  voidReason: z.string().min(1, 'Void reason is required'),
});

// ============================================
// Campaign Schemas
// ============================================

export const CampaignSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  status: CampaignStatusSchema,
  startDate: z.coerce.date(),
  endDate: z.coerce.date(),
  notes: z.string().nullable(),
  branch: z.string().nullable(),
  createdById: z.string(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});

export const CreateCampaignSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  description: z.string().optional(),
  status: CampaignStatusSchema.default('DRAFT'),
  startDate: z.coerce.date(),
  endDate: z.coerce.date(),
  notes: z.string().optional(),
  branch: z.string().trim().max(100).optional(),
  vehicleModelIds: z.array(z.string()).default([]),
});

export const UpdateCampaignSchema = CreateCampaignSchema.partial();

// ============================================
// Quotation Schemas
// ============================================

export const QuotationSchema = z.object({
  id: z.string(),
  quotationNumber: z.string(),
  saleId: z.string(),
  version: z.number(),
  quotedPrice: z.number(),
  validUntil: z.coerce.date(),
  status: QuotationStatusSchema,
  notes: z.string().nullable(),
  createdById: z.string(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});

export const CreateQuotationSchema = z.object({
  saleId: z.string().min(1, 'Sale is required'),
  quotedPrice: z.number().positive('Quoted price must be positive'),
  validUntil: z.coerce.date(),
  notes: z.string().optional(),
});

// ============================================
// Query/Filter Schemas
// ============================================

export const PaginationSchema = z.object({
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(20),
});

export const CustomerFilterSchema = PaginationSchema.extend({
  search: z.string().optional(),
  type: CustomerTypeSchema.optional(),
  salesType: SalesTypeSchema.optional(),
});

export const StockFilterSchema = PaginationSchema.extend({
  search: z.string().optional(),
  status: StockStatusSchema.optional(),
  vehicleModelId: z.string().optional(),
});

export const SaleFilterSchema = PaginationSchema.extend({
  search: z.string().optional(),
  status: SaleStatusSchema.optional(),
  type: SaleTypeSchema.optional(),
  customerId: z.string().optional(),
  createdById: z.string().optional(),
});

export const PaymentFilterSchema = PaginationSchema.extend({
  search: z.string().optional(),
  saleId: z.string().optional(),
  customerId: z.string().optional(),
  status: PaymentStatusSchema.optional(),
  paymentType: PaymentTypeSchema.optional(),
});

// ============================================================================
// Daily Stock Snapshot Report (new)
// ============================================================================

export const DailyStockSnapshotQuerySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'date must be YYYY-MM-DD'),
});

export const DailyStockSnapshotModelSchema = z.object({
  vehicleModelId: z.string(),
  modelName: z.string(),
  reservationsByColor: z.record(z.string(), z.number()),
  reservationsTotal: z.number(),
  availableByColor: z.record(z.string(), z.number()),
  availableTotal: z.number(),
  demoByColor: z.record(z.string(), z.number()),
  demoTotal: z.number(),
  requiredByColor: z.record(z.string(), z.number()),
  requiredTotal: z.number(),
});

export const DailyStockSnapshotResponseSchema = z.object({
  date: z.string(),
  colors: z.array(z.string()),
  models: z.array(DailyStockSnapshotModelSchema),
  grand: z.object({
    reservations: z.number(),
    available: z.number(),
    demo: z.number(),
    required: z.number(),
  }),
  unassignedReservations: z.number(),
});

// ============================================================================
// Monthly Purchases Report (new)
// ============================================================================

export const MonthlyPurchasesQuerySchema = z.object({
  year: z.coerce.number().int().min(2000).max(3000),
  month: z.coerce.number().int().min(1).max(12),
  vehicleType: VehicleTypeSchema.optional(),
});

export const MonthlyPurchasesItemSchema = z.object({
  no: z.number(),
  vehicleModelName: z.string(),
  exteriorColor: z.string(),
  vin: z.string(),
  engineNumber: z.string(),
  orderDate: z.string().nullable(),
  arrivalDate: z.string(),
  receivedFrom: z.string(),
  priceNet: z.number(),
  priceVat: z.number(),
  priceGross: z.number(),
  parkingSlot: z.string(),
  customerName: z.string().nullable(),
  soldDate: z.string().nullable(),
  salesperson: z.string().nullable(),
  notes: z.string().nullable(),
});

export const MonthlyPurchasesResponseSchema = z.object({
  period: z.object({
    year: z.number(),
    month: z.number(),
    startDate: z.string(),
    endDate: z.string(),
  }),
  vehicleType: VehicleTypeSchema.optional(),
  items: z.array(MonthlyPurchasesItemSchema),
  summary: z.object({
    totalVehicles: z.number(),
    totalPriceNet: z.number(),
    totalPriceVat: z.number(),
    totalPriceGross: z.number(),
    byType: z.array(
      z.object({
        type: VehicleTypeSchema,
        count: z.number(),
        totalGross: z.number(),
      })
    ),
  }),
});

// ============================================================================
// Campaign Claim Report (new)
// ============================================================================

// @deprecated Brand-bucket subsidy shape. No longer part of the claim report
// response (now editor-driven). Retained for the computeCampaignSubsidies unit test.
export const CampaignSubsidySchema = z.object({
  stockLevel: z.number(), // MSRP × 0.5%
  afterSalesNoComplaint: z.number(), // MSRP × 0.25%
  afterSalesQr: z.number(), // MSRP × 0.25%
  marketing: z.number(), // DNP × 1%
  retailTarget: z.number(), // DNP × tier (0.5/1.0/1.5%)
  total: z.number(), // รวมรับเงิน (subsidies only)
});

export const CampaignClaimRowSchema = z.object({
  no: z.number(),
  saleId: z.string(),
  saleNumber: z.string(),
  customerName: z.string(),
  modelName: z.string(),
  engineNumber: z.string(),
  vin: z.string(),
  financeProvider: z.string(),
  saleDate: z.string().nullable(),
  notifyDate: z.string().nullable(),
  campaignName: z.string(),
  salePrice: z.number(),
  // Per-car expense amounts, aligned 1:1 to expenseColumns; null = the car's
  // model does not define that expense line.
  cells: z.array(z.number().nullable()),
  total: z.number(), // sum of this car's expense lines (ยอดเบิกต่อคัน)
});

export const CampaignClaimReportResponseSchema = z.object({
  period: z.object({
    startDate: z.string(),
    endDate: z.string(),
  }),
  brand: z.string(),
  // Distinct expense-line names (union across the month's sales), report columns.
  expenseColumns: z.array(z.string()),
  rows: z.array(CampaignClaimRowSchema),
  summary: z.object({
    totalCars: z.number(),
    columnTotals: z.array(z.number()), // aligned 1:1 to expenseColumns
    grandTotal: z.number(),
  }),
});

// ============================================================================
// vehicleType filter extension for Stock & Sales reports
// ============================================================================

export const VehicleTypeFilterSchema = z.object({
  vehicleType: VehicleTypeSchema.optional(),
});

// ============================================================================
// Vehicle card print layout (positions in mm from the paper's top-left)
// ============================================================================

export const VehicleCardFieldSchema = z.object({
  x: z.number().min(0).max(VEHICLE_CARD_PAPER.w),
  y: z.number().min(0).max(VEHICLE_CARD_PAPER.h),
  w: z.number().min(1).max(VEHICLE_CARD_PAPER.w),
  align: z.enum(['left', 'center', 'right']),
  bold: z.boolean(),
  /** px; omitted = the layout's fontSize */
  fontSize: z.number().min(5).max(20).optional(),
});

export const VEHICLE_CARD_FONTS = {
  Sarabun: 'Sarabun, Kanit, sans-serif',
  Kanit: 'Kanit, Sarabun, sans-serif',
  Tahoma: 'Tahoma, Sarabun, sans-serif',
} as const;

export type VehicleCardField = z.infer<typeof VehicleCardFieldSchema>;

const fieldKeys = Object.keys(VEHICLE_CARD_FIELDS) as [
  VehicleCardFieldKey,
  ...VehicleCardFieldKey[],
];

export const VehicleCardLayoutSchema = z.object({
  /** Whole-sheet shift, mm — the printer-feed calibration knob. */
  offsetX: z.number().min(-50).max(50),
  offsetY: z.number().min(-50).max(50),
  fontSize: z.number().min(5).max(20),
  fontFamily: z.enum(['Sarabun', 'Kanit', 'Tahoma']),
  fields: z.record(z.enum(fieldKeys), VehicleCardFieldSchema),
});

// z.record over an enum infers Partial<>; the layout always carries every field.
export type VehicleCardLayout = Omit<z.infer<typeof VehicleCardLayoutSchema>, 'fields'> & {
  fields: Record<VehicleCardFieldKey, VehicleCardField>;
};

// Derived from the old table grid: left margin 10 + top 13 + title 7 → grid at y=20, rows 6.6mm.
export const DEFAULT_VEHICLE_CARD_LAYOUT: VehicleCardLayout = {
  offsetX: 0,
  offsetY: 0,
  fontSize: 8.5,
  fontFamily: 'Sarabun',
  fields: {
    model: { x: 54, y: 26.6, w: 43, align: 'center', bold: false },
    engineNo: { x: 97, y: 26.6, w: 43, align: 'center', bold: false },
    chassisNo: { x: 140, y: 26.6, w: 42, align: 'center', bold: false },
    color: { x: 182, y: 26.6, w: 26, align: 'center', bold: false },
    stockNumber: { x: 234, y: 26.6, w: 28, align: 'center', bold: true },
    orderDate: { x: 35, y: 33.2, w: 35, align: 'left', bold: true },
    beforeVatInt: { x: 70, y: 46.4, w: 30, align: 'right', bold: false },
    beforeVatDec: { x: 100, y: 46.4, w: 7.5, align: 'center', bold: false },
    vatAmountInt: { x: 70, y: 53, w: 30, align: 'right', bold: false },
    vatAmountDec: { x: 100, y: 53, w: 7.5, align: 'center', bold: false },
    totalWithVatInt: { x: 70, y: 86, w: 30, align: 'right', bold: true },
    totalWithVatDec: { x: 100, y: 86, w: 7.5, align: 'center', bold: true },
  },
};

/** Fill any missing field from the default so a partially-saved layout still prints. */
export function mergeVehicleCardLayout(saved: unknown): VehicleCardLayout {
  // Parse each value on its own so one stale/invalid entry (e.g. a renamed
  // field key in an old row) only loses itself, not every calibrated position.
  const pick = <T>(schema: z.ZodType<T>, v: unknown): T | undefined => {
    const r = schema.safeParse(v);
    return r.success ? r.data : undefined;
  };
  const obj = (v: unknown): Record<string, unknown> =>
    v && typeof v === 'object' ? (v as Record<string, unknown>) : {};
  const s = obj(saved);
  const sf = obj(s.fields);
  const shape = VehicleCardLayoutSchema.shape;
  const fields = {} as VehicleCardLayout['fields'];
  for (const key of fieldKeys) {
    const d = DEFAULT_VEHICLE_CARD_LAYOUT.fields[key];
    const f: Partial<VehicleCardField> = pick(VehicleCardFieldSchema.partial(), sf[key]) ?? {};
    fields[key] = {
      x: f.x ?? d.x,
      y: f.y ?? d.y,
      w: f.w ?? d.w,
      align: f.align ?? d.align,
      bold: f.bold ?? d.bold,
      ...(f.fontSize != null ? { fontSize: f.fontSize } : {}),
    };
  }
  return {
    offsetX: pick(shape.offsetX, s.offsetX) ?? DEFAULT_VEHICLE_CARD_LAYOUT.offsetX,
    offsetY: pick(shape.offsetY, s.offsetY) ?? DEFAULT_VEHICLE_CARD_LAYOUT.offsetY,
    fontSize: pick(shape.fontSize, s.fontSize) ?? DEFAULT_VEHICLE_CARD_LAYOUT.fontSize,
    fontFamily: pick(shape.fontFamily, s.fontFamily) ?? DEFAULT_VEHICLE_CARD_LAYOUT.fontFamily,
    fields,
  };
}
