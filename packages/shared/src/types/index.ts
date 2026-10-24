import type { z } from 'zod';
import type {
  CampaignSchema,
  CampaignStatusSchema,
  CreateCampaignSchema,
  CreateCustomerSchema,
  CreatePaymentSchema,
  CreateReservationDepositSchema,
  CreateQuotationSchema,
  CreateSaleSchema,
  CreateStockSchema,
  CreateStockStatusSchema,
  CreateUserSchema,
  CreateVehicleModelSchema,
  CreateVehicleTypeSchema,
  CustomerSchema,
  CustomerTypeSchema,
  DebtStatusSchema,
  DocumentTypeSchema,
  FinanceCustomLineSchema,
  InterestBaseSchema,
  LoginSchema,
  PaginationSchema,
  PaymentMethodSchema,
  PaymentModeSchema,
  PaymentSchema,
  PaymentStatusSchema,
  PaymentTypeSchema,
  QuotationSchema,
  QuotationStatusSchema,
  RefundPolicySchema,
  RoleSchema,
  SaleSchema,
  SaleStatusSchema,
  SaleTypeSchema,
  SalesTypeSchema,
  StockSchema,
  StockStatusSchema,
  UpdateCampaignSchema,
  UpdateCustomerSchema,
  UpdateSaleSchema,
  UpdateStockSchema,
  UpdateUserSchema,
  UpdateVehicleModelSchema,
  UpdateVehicleTypeSchema,
  UserSchema,
  UserStatusSchema,
  VehicleModelSchema,
  VehicleTypeSchema,
  VoidPaymentSchema,
} from '../schemas';

// ============================================
// Enum Types
// ============================================

export type Role = z.infer<typeof RoleSchema>;
export type UserStatus = z.infer<typeof UserStatusSchema>;
export type CustomerType = z.infer<typeof CustomerTypeSchema>;
export type SalesType = z.infer<typeof SalesTypeSchema>;
export type VehicleType = z.infer<typeof VehicleTypeSchema>;
export type StockStatus = z.infer<typeof StockStatusSchema>;
export type CreateStockStatus = z.infer<typeof CreateStockStatusSchema>;
export type InterestBase = z.infer<typeof InterestBaseSchema>;
export type DebtStatus = z.infer<typeof DebtStatusSchema>;
export type SaleType = z.infer<typeof SaleTypeSchema>;
export type SaleStatus = z.infer<typeof SaleStatusSchema>;
export type PaymentMode = z.infer<typeof PaymentModeSchema>;
export type RefundPolicy = z.infer<typeof RefundPolicySchema>;
export type PaymentType = z.infer<typeof PaymentTypeSchema>;
export type PaymentMethod = z.infer<typeof PaymentMethodSchema>;
export type PaymentStatus = z.infer<typeof PaymentStatusSchema>;
export type QuotationStatus = z.infer<typeof QuotationStatusSchema>;
export type CampaignStatus = z.infer<typeof CampaignStatusSchema>;
export type DocumentType = z.infer<typeof DocumentTypeSchema>;

// ============================================
// Entity Types
// ============================================

export type User = z.infer<typeof UserSchema>;
export type Customer = z.infer<typeof CustomerSchema>;
export type VehicleModel = z.infer<typeof VehicleModelSchema>;
export type Stock = z.infer<typeof StockSchema>;
export type Sale = z.infer<typeof SaleSchema>;
export type Payment = z.infer<typeof PaymentSchema>;
export type Campaign = z.infer<typeof CampaignSchema>;
export type Quotation = z.infer<typeof QuotationSchema>;

// ============================================
// Input Types
// ============================================

export type LoginInput = z.infer<typeof LoginSchema>;
export type CreateUserInput = z.infer<typeof CreateUserSchema>;
export type UpdateUserInput = z.infer<typeof UpdateUserSchema>;
export type CreateCustomerInput = z.infer<typeof CreateCustomerSchema>;
export type UpdateCustomerInput = z.infer<typeof UpdateCustomerSchema>;
export type CreateVehicleModelInput = z.infer<typeof CreateVehicleModelSchema>;
export type UpdateVehicleModelInput = z.infer<typeof UpdateVehicleModelSchema>;
export type CreateVehicleTypeInput = z.input<typeof CreateVehicleTypeSchema>;
export type UpdateVehicleTypeInput = z.input<typeof UpdateVehicleTypeSchema>;

/** A row of the vehicle_types table (ประเภทรถ). */
export interface VehicleTypeItem {
  code: string;
  nameTh: string;
  sortOrder: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}
export type CreateStockInput = z.infer<typeof CreateStockSchema>;
export type UpdateStockInput = z.infer<typeof UpdateStockSchema>;
export type CreateSaleInput = z.infer<typeof CreateSaleSchema>;
export type UpdateSaleInput = z.infer<typeof UpdateSaleSchema>;
export type FinanceCustomLine = z.infer<typeof FinanceCustomLineSchema>;
export type CreatePaymentInput = z.infer<typeof CreatePaymentSchema>;
export type CreateReservationDepositInput = z.infer<typeof CreateReservationDepositSchema>;
export type VoidPaymentInput = z.infer<typeof VoidPaymentSchema>;
export type CreateCampaignInput = z.infer<typeof CreateCampaignSchema>;
export type UpdateCampaignInput = z.infer<typeof UpdateCampaignSchema>;
export type CreateQuotationInput = z.infer<typeof CreateQuotationSchema>;

// ============================================
// Pagination Types
// ============================================

export type PaginationInput = z.infer<typeof PaginationSchema>;

export interface PaginatedResponse<T> {
  data: T[];
  meta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPrevPage: boolean;
  };
}

// ============================================
// API Response Types
// ============================================

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  message?: string;
  error?: string;
}

export interface AuthResponse {
  user: Omit<User, 'password'>;
  token: string;
}

// ============================================
// Extended Types with Relations
// ============================================

export interface UserWithoutPassword extends Omit<User, 'password'> {}

export interface StockWithModel extends Stock {
  vehicleModel: VehicleModel;
}

export interface SaleWithRelations extends Sale {
  customer: Customer;
  stock?: StockWithModel | null;
  vehicleModel?: VehicleModel | null;
  campaign?: Campaign | null;
  payments?: Payment[];
  quotations?: Quotation[];
  createdBy: UserWithoutPassword;
}

export interface PaymentWithRelations extends Payment {
  customer: Customer;
  sale: Sale;
  createdBy: UserWithoutPassword;
}

// ============================================
// Dashboard Types
// ============================================

export interface DashboardStats {
  stockOverview: {
    available: number;
    reserved: number;
    preparing: number;
    sold: number;
    total: number;
  };
  salesOverview: {
    inquiry: number;
    quoted: number;
    reserved: number;
    preparing: number;
    delivered: number;
    completed: number;
    cancelled: number;
  };
  monthlyRevenue: number;
  outstandingPayments: number;
  expiringReservations: number;
  agingStock: number;
}

export interface SalesMetrics {
  totalSales: number;
  totalRevenue: number;
  averageDealSize: number;
  conversionRate: number;
  salesByModel: Array<{ model: string; count: number; revenue: number }>;
  salesByPaymentMode: Array<{ mode: PaymentMode; count: number; percentage: number }>;
}

export interface StockMetrics {
  totalValue: number;
  averageDaysInStock: number;
  accumulatedInterest: number;
  agingDistribution: {
    '0-30': number;
    '31-60': number;
    '61-90': number;
    '90+': number;
  };
}

// ============================================
// Report Types Export
// ============================================

export * from './reports';

// ============================================
// Daily Stock Snapshot + Monthly Purchases (new reports)
// ============================================

import type {
  CampaignClaimReportResponseSchema,
  CampaignClaimRowSchema,
  CampaignSubsidySchema,
  DailyStockSnapshotModelSchema,
  DailyStockSnapshotResponseSchema,
  MonthlyPurchasesItemSchema,
  MonthlyPurchasesResponseSchema,
} from '../schemas';

export type DailyStockSnapshotModel = z.infer<typeof DailyStockSnapshotModelSchema>;
export type DailyStockSnapshotResponse = z.infer<typeof DailyStockSnapshotResponseSchema>;
export type MonthlyPurchasesItem = z.infer<typeof MonthlyPurchasesItemSchema>;
export type MonthlyPurchasesResponse = z.infer<typeof MonthlyPurchasesResponseSchema>;
export type CampaignClaimRow = z.infer<typeof CampaignClaimRowSchema>;
export type CampaignClaimReportResponse = z.infer<typeof CampaignClaimReportResponseSchema>;
export type CampaignSubsidy = z.infer<typeof CampaignSubsidySchema>;
