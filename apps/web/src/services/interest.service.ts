import { api } from '../lib/api';

// Types
export interface InterestSummary {
  stockId: string;
  vin: string;
  vehicleModel: {
    brand: string;
    model: string;
    variant: string | null;
    year: number;
  };
  exteriorColor: string;
  status: 'AVAILABLE' | 'RESERVED' | 'PREPARING' | 'SOLD';
  orderDate: string | null;
  arrivalDate: string;
  interestStartDate: string; // current/last period start, else orderDate/arrivalDate
  interestActionDate?: string; // start while accruing; stop date when stopped
  daysCount: number; // days of that period
  currentRate: number;
  totalAccumulatedInterest: number;
  isCalculating: boolean;
  principalBase: 'BASE_COST_ONLY' | 'TOTAL_COST';
  principalAmount: number;
}

export type InterestPeriodStartAction = 'INITIAL' | 'RATE_CHANGE' | 'RESUME' | 'DEBT_ADJUST';
export type InterestPeriodEndAction =
  | 'OPEN'
  | 'RATE_CHANGE'
  | 'STOPPED'
  | 'DEBT_ADJUST'
  | 'PAID_OFF';

export interface InterestPeriod {
  id: string;
  startDate: string;
  endDate: string | null;
  annualRate: number;
  principalBase: 'BASE_COST_ONLY' | 'TOTAL_COST';
  principalAmount: number;
  calculatedInterest: number;
  daysCount: number;
  notes: string | null;
  createdAt: string;
  createdById: string | null;
  startAction?: InterestPeriodStartAction;
  endAction?: InterestPeriodEndAction;
  previousRate?: number | null;
}

export interface InterestDetail {
  stock: {
    id: string;
    vin: string;
    vehicleModel: {
      id: string;
      brand: string;
      model: string;
      variant: string | null;
      year: number;
      type: string;
    };
    exteriorColor: string;
    interiorColor: string | null;
    orderDate: string | null;
    arrivalDate: string;
    interestStartDate: string; // orderDate or arrivalDate (vehicle start, not current period)
    status: 'AVAILABLE' | 'RESERVED' | 'PREPARING' | 'SOLD';
    baseCost: number;
    transportCost: number;
    accessoryCost: number;
    otherCosts: number;
    totalCost: number;
    interestPrincipalBase: 'BASE_COST_ONLY' | 'TOTAL_COST';
    financeProvider: string | null;
    stopInterestCalc: boolean;
    interestStoppedAt: string | null;
  };
  summary: {
    totalAccumulatedInterest: number;
    totalDays: number;
    periodCount: number;
    currentRate: number;
    isCalculating: boolean;
  };
  periods: InterestPeriod[];
}

export interface InterestStats {
  totalStocksWithInterest: number;
  activeCalculations: number;
  stoppedCalculations: number;
  totalAccumulatedInterest: number;
  averageRate: number;
}

export interface InterestFilters {
  page?: number;
  limit?: number;
  search?: string;
  status?: 'AVAILABLE' | 'RESERVED' | 'PREPARING' | 'SOLD' | 'DEMO';
  isCalculating?: boolean;
}

export interface InterestMatchFilters {
  search?: string;
  status?: InterestFilters['status'];
  isCalculating?: boolean;
}

export interface BulkInterestItemResult {
  stockId: string;
  vin?: string;
  status: 'applied' | 'skipped' | 'error';
  reason?: string;
}

export interface BulkInterestResult {
  applied: BulkInterestItemResult[];
  skipped: BulkInterestItemResult[];
  errors: BulkInterestItemResult[];
}

export interface UpdateInterestRateData {
  annualRate: number;
  principalBase?: 'BASE_COST_ONLY' | 'TOTAL_COST';
  effectiveDate?: string;
  notes?: string;
}

export interface InitializeInterestData {
  annualRate: number;
  principalBase?: 'BASE_COST_ONLY' | 'TOTAL_COST';
  startDate?: string;
  notes?: string;
}

export interface ResumeInterestData {
  annualRate: number;
  principalBase?: 'BASE_COST_ONLY' | 'TOTAL_COST';
  notes?: string;
  startDate?: string;
}

// Debt Management Types
export type DebtStatus = 'NO_DEBT' | 'ACTIVE' | 'PAID_OFF';
export type PaymentMethod = 'CASH' | 'BANK_TRANSFER' | 'CHEQUE' | 'CREDIT_CARD';
export type PaymentType = 'AUTO' | 'PRINCIPAL_ONLY' | 'INTEREST_ONLY';

export interface DebtPaymentData {
  amount: number;
  paymentMethod: PaymentMethod;
  paymentType?: PaymentType;
  paymentDate?: string;
  referenceNumber?: string;
  notes?: string;
}

export interface DebtPayment {
  id: string;
  paymentDate: string;
  amount: number;
  paymentMethod: PaymentMethod;
  referenceNumber: string | null;
  principalBefore: number;
  principalAfter: number;
  accruedInterestAtPayment: number;
  interestPaid: number;
  principalPaid: number;
  notes: string | null;
  createdById: string;
  createdAt: string;
}

export interface DebtPaymentResult {
  payment: DebtPayment;
  stock: {
    id: string;
    vin: string;
    debtAmount: number;
    paidDebtAmount: number;
    paidInterestAmount: number;
    remainingDebt: number;
    debtStatus: DebtStatus;
  };
  interestAdjusted: boolean;
  debtPaidOff: boolean;
  allocation: {
    interestPaid: number;
    principalPaid: number;
    accruedInterestAtPayment: number;
  };
}

export interface DebtSummary {
  debtAmount: number;
  paidDebtAmount: number;
  paidInterestAmount: number;
  remainingDebt: number;
  totalAccruedInterest: number;  // ดอกเบี้ยสะสมรวมทั้งหมด
  accruedInterest: number;       // ดอกเบี้ยค้างชำระ
  totalPayoffAmount: number;
  debtStatus: DebtStatus;
  debtPaidOffDate: string | null;
  paymentCount: number;
  lastPaymentDate: string | null;
  hasFinanceProvider: boolean;
  baseCost: number;
  totalCost: number;
  currentInterestRate: number;
  interestPrincipalBase: string;
}

export interface OutstandingDebt {
  stockId: string;
  vin: string;
  vehicleModel: {
    brand: string;
    model: string;
    variant: string | null;
    year: number;
  };
  exteriorColor: string;
  status: 'AVAILABLE' | 'RESERVED' | 'PREPARING' | 'SOLD';
  debtAmount: number;
  paidDebtAmount: number;
  remainingDebt: number;
  debtStatus: DebtStatus;
  financeProvider: string | null;
  lastPaymentDate: string | null;
}

export interface DebtStats {
  totalStocksWithDebt: number;
  totalDebtAmount: number;
  totalPaidAmount: number;
  totalRemainingDebt: number;
  paidOffCount: number;
}

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

interface ApiResponse<T> {
  success: boolean;
  data: T;
  meta?: PaginatedResponse<InterestSummary>['meta'];
  message?: string;
}

class InterestService {
  /**
   * Get all stock with interest summary
   */
  async getAll(filters: InterestFilters = {}): Promise<PaginatedResponse<InterestSummary>> {
    const params = new URLSearchParams();
    if (filters.page) params.append('page', filters.page.toString());
    if (filters.limit) params.append('limit', filters.limit.toString());
    if (filters.search) params.append('search', filters.search);
    if (filters.status) params.append('status', filters.status);
    if (filters.isCalculating !== undefined) {
      params.append('isCalculating', filters.isCalculating.toString());
    }

    const response = await api.get<ApiResponse<InterestSummary[]>>(`/api/interest?${params.toString()}`);
    return {
      data: response.data,
      meta: response.meta!,
    };
  }

  /**
   * Get interest statistics
   */
  async getStats(): Promise<InterestStats> {
    const response = await api.get<ApiResponse<InterestStats>>('/api/interest/stats');
    return response.data;
  }

  /**
   * Get interest detail for a specific stock
   */
  async getById(stockId: string): Promise<InterestDetail> {
    const response = await api.get<ApiResponse<InterestDetail>>(`/api/interest/${stockId}`);
    return response.data;
  }

  /**
   * Initialize interest period for a stock
   */
  async initialize(stockId: string, data: InitializeInterestData): Promise<InterestPeriod> {
    const response = await api.post<ApiResponse<InterestPeriod>>(`/api/interest/${stockId}/initialize`, data);
    return response.data;
  }

  /**
   * Update interest rate for a stock
   */
  async updateRate(stockId: string, data: UpdateInterestRateData): Promise<InterestPeriod> {
    const response = await api.put<ApiResponse<InterestPeriod>>(`/api/interest/${stockId}`, data);
    return response.data;
  }

  /**
   * Stop interest calculation for a stock.
   * Returns the API envelope so callers can distinguish success from a void result.
   */
  async stopCalculation(
    stockId: string,
    notes?: string,
    stopDate?: string,
  ): Promise<{ success: boolean }> {
    const payload: { notes?: string; stopDate?: string } = {};
    if (notes) payload.notes = notes;
    if (stopDate) payload.stopDate = stopDate;
    return api.post<{ success: boolean }>(
      `/api/interest/${stockId}/stop`,
      Object.keys(payload).length ? payload : undefined,
    );
  }

  /** Recompute days + interest of every closed period. */
  async recalculatePeriods(stockId: string): Promise<{ success: boolean }> {
    return api.post<{ success: boolean }>(`/api/interest/${stockId}/recalculate`);
  }

  async deletePeriod(stockId: string, periodId: string): Promise<{ success: boolean }> {
    return api.delete<{ success: boolean }>(`/api/interest/${stockId}/periods/${periodId}`);
  }

  /**
   * Resume interest calculation for a stock
   */
  async resumeCalculation(stockId: string, data: ResumeInterestData): Promise<InterestPeriod> {
    const response = await api.post<ApiResponse<InterestPeriod>>(`/api/interest/${stockId}/resume`, data);
    return response.data;
  }

  async bulkStop(data: {
    stockIds?: string[];
    matchFilters?: InterestMatchFilters;
    excludeStockIds?: string[];
    notes?: string;
    stopDate?: string;
  }): Promise<BulkInterestResult> {
    const response = await api.post<ApiResponse<BulkInterestResult>>('/api/interest/bulk/stop', data);
    return response.data;
  }

  async bulkApplyRate(data: {
    stockIds?: string[];
    matchFilters?: InterestMatchFilters;
    excludeStockIds?: string[];
    annualRate?: number;
    principalBase?: 'KEEP' | 'BASE_COST_ONLY' | 'TOTAL_COST';
    items?: {
      stockId: string;
      annualRate: number;
      principalBase?: 'KEEP' | 'BASE_COST_ONLY' | 'TOTAL_COST';
    }[];
    notes?: string;
    effectiveDate?: string;
  }): Promise<BulkInterestResult> {
    const response = await api.post<ApiResponse<BulkInterestResult>>(
      '/api/interest/bulk/apply-rate',
      data
    );
    return response.data;
  }

  // ============================================
  // Debt Management
  // ============================================

  /**
   * Initialize debt for a stock
   */
  async initializeDebt(stockId: string, debtAmount: number): Promise<void> {
    await api.post(`/api/interest/${stockId}/debt/initialize`, { debtAmount });
  }

  /**
   * Record a debt payment
   */
  async recordDebtPayment(stockId: string, data: DebtPaymentData): Promise<DebtPaymentResult> {
    const response = await api.post<ApiResponse<DebtPaymentResult>>(`/api/interest/${stockId}/debt/payment`, data);
    return response.data;
  }

  /**
   * Get debt payment history for a stock
   */
  async getDebtPayments(stockId: string): Promise<DebtPayment[]> {
    const response = await api.get<ApiResponse<DebtPayment[]>>(`/api/interest/${stockId}/debt/payments`);
    return response.data;
  }

  /**
   * Get debt summary for a stock
   */
  async getDebtSummary(stockId: string): Promise<DebtSummary> {
    const response = await api.get<ApiResponse<DebtSummary>>(`/api/interest/${stockId}/debt/summary`);
    return response.data;
  }

  /**
   * Get all stocks with outstanding debt
   */
  async getOutstandingDebts(filters: { page?: number; limit?: number; search?: string } = {}): Promise<PaginatedResponse<OutstandingDebt>> {
    const params = new URLSearchParams();
    if (filters.page) params.append('page', filters.page.toString());
    if (filters.limit) params.append('limit', filters.limit.toString());
    if (filters.search) params.append('search', filters.search);

    const response = await api.get<ApiResponse<OutstandingDebt[]>>(`/api/interest/debts/outstanding?${params.toString()}`);
    return {
      data: response.data,
      meta: response.meta!,
    };
  }

  /**
   * Get debt statistics
   */
  async getDebtStats(): Promise<DebtStats> {
    const response = await api.get<ApiResponse<DebtStats>>('/api/interest/debts/stats');
    return response.data;
  }
}

export const interestService = new InterestService();
