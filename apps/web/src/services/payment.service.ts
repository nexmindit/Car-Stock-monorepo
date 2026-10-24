import { printHtmlViaPopup } from '../components/reports/PrintButton';
import { api } from '../lib/api';

// Types
export type PaymentType =
  | 'DEPOSIT'
  | 'DOWN_PAYMENT'
  | 'FINANCE_PAYMENT'
  | 'OTHER_EXPENSE'
  | 'MISCELLANEOUS';
export type PaymentMethod = 'CASH' | 'BANK_TRANSFER' | 'CHEQUE' | 'CREDIT_CARD';
export type PaymentStatus = 'ACTIVE' | 'VOIDED';

export interface SaleVehicleModel {
  id?: string;
  brand: string;
  model: string;
  variant?: string | null;
}

export interface Payment {
  id: string;
  receiptNumber: string;
  amount: number;
  paymentDate: string;
  paymentType: PaymentType;
  paymentMethod: PaymentMethod;
  status: PaymentStatus;
  referenceNumber?: string;
  description?: string;
  voidReason?: string;
  voidedAt?: string;
  issuedBy?: string;
  notes?: string | null;
  receivingBank?: string | null;
  receivingBankName?: string | null;
  receivingAccountNumber?: string | null;
  receivingBranch?: string | null;
  customer: {
    id: string;
    code: string;
    name: string;
  };
  sale?: {
    id: string;
    saleNumber: string;
    totalAmount?: number;
    remainingAmount?: number;
    preferredExtColor?: string | null;
    preferredIntColor?: string | null;
    /** Linked unit (null while a booking has no VIN yet). */
    stock?: {
      id: string;
      vin: string;
      exteriorColor?: string | null;
      interiorColor?: string | null;
      vehicleModel?: SaleVehicleModel | null;
    } | null;
    /** Booked model — the car while no VIN is linked. */
    vehicleModel?: SaleVehicleModel | null;
  } | null;
  createdBy?: {
    id: string;
    username: string;
    firstName: string;
    lastName: string;
  };
  createdAt: string;
}

export interface PaymentListItem {
  id: string;
  receiptNumber: string;
  amount: number;
  paymentDate: string;
  paymentType: PaymentType;
  paymentMethod: PaymentMethod;
  status: PaymentStatus;
  referenceNumber?: string;
  description?: string;
  notes?: string | null;
  customer: {
    id: string;
    code: string;
    name: string;
  };
  sale?: {
    id: string;
    saleNumber: string;
  } | null;
  createdAt: string;
}

export interface CreatePaymentData {
  saleId?: string;
  customerId: string;
  amount: number;
  paymentDate: string;
  paymentType: PaymentType;
  paymentMethod: PaymentMethod;
  referenceNumber?: string;
  description?: string;
  notes?: string;
  receivingBank?: string;
  receivingBankName?: string;
  receivingAccountNumber?: string;
  receivingBranch?: string;
  actualReceivedDate?: string;
  netReceivedAmount?: number;
}

/** จองรถจากหน้าชำระเงิน — POST /api/payments/reservation-deposit. */
export interface CreateReservationDepositData {
  customerId: string;
  vehicleModelId: string;
  preferredExtColor: string;
  preferredIntColor?: string;
  /** Car price; the API defaults it to the model price when omitted. */
  totalAmount?: number;
  depositAmount: number;
  paymentDate: string;
  paymentMethod: PaymentMethod;
  referenceNumber?: string;
  receivingBank?: string;
  receivingBankName?: string;
  receivingAccountNumber?: string;
  receivingBranch?: string;
  /** Extra receipt item line (the form's หมายเหตุ), same as sale mode. */
  description?: string;
  notes?: string;
}

/** Fields allowed when editing an existing receipt (PATCH /api/payments/:id). */
export interface UpdatePaymentData {
  description?: string;
  paymentDate?: string;
  paymentType?: PaymentType;
  amount?: number;
  paymentMethod?: PaymentMethod;
  referenceNumber?: string;
  notes?: string;
  issuedBy?: string;
  receivingBank?: string;
  receivingBankName?: string;
  receivingAccountNumber?: string;
  receivingBranch?: string;
}

export interface VoidPaymentData {
  voidReason: string;
}

export interface PaymentFilters {
  page?: number;
  limit?: number;
  search?: string;
  saleId?: string;
  customerId?: string;
  status?: PaymentStatus;
  paymentType?: PaymentType;
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

export interface PaymentStats {
  totalPayments: number;
  activePayments: number;
  voidedPayments: number;
  totalAmount: number;
  depositAmount: number;
  downPaymentAmount: number;
  financePaymentAmount: number;
  otherExpenseAmount: number;
}

export interface OutstandingPayment {
  sale: {
    id: string;
    saleNumber: string;
    totalAmount: number;
    paidAmount: number;
    remainingAmount: number;
    status: string;
    customer: {
      id: string;
      code: string;
      name: string;
    };
  };
  daysSinceReservation: number;
}

// API Response types
interface ApiResponse<T> {
  success: boolean;
  data: T;
  meta?: PaginatedResponse<T>['meta'];
}

interface ApiListResponse<T> {
  success: boolean;
  data: T[];
  meta: PaginatedResponse<T>['meta'];
}

class PaymentService {
  private baseUrl = '/api/payments';

  /**
   * Get all payments with filters
   */
  async getAll(filters: PaymentFilters = {}): Promise<PaginatedResponse<PaymentListItem>> {
    const params = new URLSearchParams();

    if (filters.page) params.append('page', filters.page.toString());
    if (filters.limit) params.append('limit', filters.limit.toString());
    if (filters.search) params.append('search', filters.search);
    if (filters.saleId) params.append('saleId', filters.saleId);
    if (filters.customerId) params.append('customerId', filters.customerId);
    if (filters.status) params.append('status', filters.status);
    if (filters.paymentType) params.append('paymentType', filters.paymentType);

    const queryString = params.toString();
    const url = queryString ? `${this.baseUrl}?${queryString}` : this.baseUrl;

    const response = await api.get<ApiListResponse<PaymentListItem>>(url);
    return {
      data: response.data,
      meta: response.meta,
    };
  }

  /**
   * Get payment by ID
   */
  async getById(id: string): Promise<Payment> {
    const response = await api.get<ApiResponse<Payment>>(`${this.baseUrl}/${id}`);
    return response.data;
  }

  /**
   * Get payment statistics
   */
  async getStats(): Promise<PaymentStats> {
    const response = await api.get<ApiResponse<PaymentStats>>(`${this.baseUrl}/stats`);
    return response.data;
  }

  /**
   * Get outstanding payments (sales with remaining balance)
   */
  async getOutstanding(): Promise<OutstandingPayment[]> {
    const response = await api.get<ApiResponse<OutstandingPayment[]>>(
      `${this.baseUrl}/outstanding`
    );
    return response.data;
  }

  /**
   * Create new payment
   */
  async create(data: CreatePaymentData): Promise<Payment> {
    const response = await api.post<ApiResponse<Payment>>(this.baseUrl, data);
    return response.data;
  }

  /**
   * Book a car by model + color (no VIN yet) and record its deposit in one step.
   * Returns the deposit payment (with its new sale).
   */
  async createReservationDeposit(data: CreateReservationDepositData): Promise<Payment> {
    const response = await api.post<ApiResponse<Payment>>(
      `${this.baseUrl}/reservation-deposit`,
      data
    );
    return response.data;
  }

  /**
   * Update payment
   */
  async update(id: string, data: UpdatePaymentData): Promise<Payment> {
    const response = await api.patch<ApiResponse<Payment>>(`${this.baseUrl}/${id}`, data);
    return response.data;
  }

  /**
   * Void a payment
   */
  async void(id: string, data: VoidPaymentData): Promise<Payment> {
    const response = await api.patch<ApiResponse<Payment>>(`${this.baseUrl}/${id}/void`, data);
    return response.data;
  }

  /**
   * Print temporary receipt directly via browser window.print().
   * Browser passes the HTML @page size to the printer driver.
   *
   * withForm=true renders the full CSS-drawn form (blank continuous 9.5×5.5 in);
   * paper='a4' (only with withForm) uses A4 landscape instead of tractor-feed.
   * Default is the data-only overlay for pre-printed 9×5.5 in forms.
   *
   * Popup is opened synchronously inside the user-gesture (button onClick) so
   * it isn't blocked. The fetched HTML is wrapped in a Blob URL and assigned
   * to popup.location — the popup loads it as a real document, executing the
   * embedded auto-print script naturally without document.write.
   */
  async printReceiptDirect(
    id: string,
    lateFee?: number,
    withForm?: boolean,
    paper?: 'a4'
  ): Promise<void> {
    const params = new URLSearchParams();
    if (lateFee) params.set('lateFee', String(lateFee));
    if (withForm) params.set('withForm', 'true');
    if (paper === 'a4') params.set('paper', 'a4');
    const qsStr = params.toString();
    const qs = qsStr ? `?${qsStr}` : '';
    return printHtmlViaPopup(() => api.getBlob(`/api/pdf/temporary-receipt/${id}/html${qs}`));
  }
}

export const paymentService = new PaymentService();
