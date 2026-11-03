import type {
  CampaignClaimReportResponse,
  DailyPaymentReportResponse,
  DailyStockSnapshotResponse,
  MonthlyPurchasesResponse,
  ProfitLossReportResponse,
  PurchaseRequirementParams,
  PurchaseRequirementReportResponse,
  ReportQueryParams,
  SalesSummaryReportResponse,
  StockInterestReportResponse,
  StockReportResponse,
} from '@car-stock/shared/types';
import { api } from '../lib/api';

interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

// Bank Interest Report — locked API contract (GET /api/reports/bank-interest).
export interface BankInterestRow {
  stockId: string;
  stockNumber: string;
  vin: string;
  vehicleInfo: string;
  exteriorColor: string;
  principalAmount: number;
  rate: number;
  periodFrom: string;
  periodTo: string;
  days: number;
  interest: number;
}

export interface BankInterestSummary {
  vehicleCount: number;
  rowCount: number;
  totalInterest: number;
}

export interface BankInterestReportResponse {
  rows: BankInterestRow[];
  summary: BankInterestSummary;
}

class ReportService {
  // ============================================
  // Daily Payment Report
  // ============================================
  async getDailyPaymentReport(params?: ReportQueryParams): Promise<DailyPaymentReportResponse> {
    const queryParams = new URLSearchParams();
    if (params?.startDate) queryParams.append('startDate', params.startDate);
    if (params?.endDate) queryParams.append('endDate', params.endDate);

    const url = `/api/reports/daily-payments${queryParams.toString() ? `?${queryParams}` : ''}`;
    const response = await api.get<ApiResponse<DailyPaymentReportResponse>>(url);

    if (!response.success || !response.data) {
      throw new Error(response.message || 'Failed to fetch daily payment report');
    }

    return response.data;
  }

  async getDailyPaymentReportPdf(params?: ReportQueryParams): Promise<Blob> {
    const queryParams = new URLSearchParams();
    if (params?.startDate) queryParams.append('startDate', params.startDate);
    if (params?.endDate) queryParams.append('endDate', params.endDate);

    const url = `/api/reports/daily-payments/pdf${queryParams.toString() ? `?${queryParams}` : ''}`;
    return api.getBlob(url);
  }

  // ============================================
  // Stock Report
  // ============================================
  async getStockReport(params?: ReportQueryParams): Promise<StockReportResponse> {
    const queryParams = new URLSearchParams();
    if (params?.startDate) queryParams.append('startDate', params.startDate);
    if (params?.endDate) queryParams.append('endDate', params.endDate);
    if (params?.status) queryParams.append('status', params.status);
    if (params?.vehicleType) queryParams.append('vehicleType', params.vehicleType);
    if (params?.brand) queryParams.append('brand', params.brand);
    if (params?.model) queryParams.append('model', params.model);
    if (params?.exteriorColor) queryParams.append('exteriorColor', params.exteriorColor);
    if (params?.interiorColor) queryParams.append('interiorColor', params.interiorColor);

    const url = `/api/reports/stock${queryParams.toString() ? `?${queryParams}` : ''}`;
    const response = await api.get<ApiResponse<StockReportResponse>>(url);

    if (!response.success || !response.data) {
      throw new Error(response.message || 'Failed to fetch stock report');
    }

    return response.data;
  }

  async getStockReportPdf(params?: ReportQueryParams): Promise<Blob> {
    const queryParams = new URLSearchParams();
    if (params?.startDate) queryParams.append('startDate', params.startDate);
    if (params?.endDate) queryParams.append('endDate', params.endDate);
    if (params?.vehicleType) queryParams.append('vehicleType', params.vehicleType);
    if (params?.brand) queryParams.append('brand', params.brand);
    if (params?.model) queryParams.append('model', params.model);
    if (params?.exteriorColor) queryParams.append('exteriorColor', params.exteriorColor);
    if (params?.interiorColor) queryParams.append('interiorColor', params.interiorColor);

    const url = `/api/reports/stock/pdf${queryParams.toString() ? `?${queryParams}` : ''}`;
    return api.getBlob(url);
  }

  // ============================================
  // Profit & Loss Report
  // ============================================
  async getProfitLossReport(params?: ReportQueryParams): Promise<ProfitLossReportResponse> {
    const queryParams = new URLSearchParams();
    if (params?.startDate) queryParams.append('startDate', params.startDate);
    if (params?.endDate) queryParams.append('endDate', params.endDate);

    const url = `/api/reports/profit-loss${queryParams.toString() ? `?${queryParams}` : ''}`;
    const response = await api.get<ApiResponse<ProfitLossReportResponse>>(url);

    if (!response.success || !response.data) {
      throw new Error(response.message || 'Failed to fetch profit/loss report');
    }

    return response.data;
  }

  async getProfitLossReportPdf(params?: ReportQueryParams): Promise<Blob> {
    const queryParams = new URLSearchParams();
    if (params?.startDate) queryParams.append('startDate', params.startDate);
    if (params?.endDate) queryParams.append('endDate', params.endDate);

    const url = `/api/reports/profit-loss/pdf${queryParams.toString() ? `?${queryParams}` : ''}`;
    return api.getBlob(url);
  }

  // ============================================
  // Sales Summary Report
  // ============================================
  async getSalesSummaryReport(params?: ReportQueryParams): Promise<SalesSummaryReportResponse> {
    const queryParams = new URLSearchParams();
    if (params?.startDate) queryParams.append('startDate', params.startDate);
    if (params?.endDate) queryParams.append('endDate', params.endDate);
    if (params?.status) queryParams.append('status', params.status);
    if (params?.salespersonId) queryParams.append('salespersonId', params.salespersonId);
    if (params?.vehicleType) queryParams.append('vehicleType', params.vehicleType);

    const url = `/api/reports/sales-summary${queryParams.toString() ? `?${queryParams}` : ''}`;
    const response = await api.get<ApiResponse<SalesSummaryReportResponse>>(url);

    if (!response.success || !response.data) {
      throw new Error(response.message || 'Failed to fetch sales summary report');
    }

    return response.data;
  }

  async getSalesSummaryReportPdf(params?: ReportQueryParams): Promise<Blob> {
    const queryParams = new URLSearchParams();
    if (params?.startDate) queryParams.append('startDate', params.startDate);
    if (params?.endDate) queryParams.append('endDate', params.endDate);
    if (params?.status) queryParams.append('status', params.status);
    if (params?.salespersonId) queryParams.append('salespersonId', params.salespersonId);
    if (params?.vehicleType) queryParams.append('vehicleType', params.vehicleType);

    const url = `/api/reports/sales-summary/pdf${queryParams.toString() ? `?${queryParams}` : ''}`;
    return api.getBlob(url);
  }

  // ============================================
  // Stock Interest Report
  // ============================================
  async getStockInterestReport(params?: ReportQueryParams): Promise<StockInterestReportResponse> {
    const queryParams = new URLSearchParams();
    if (params?.startDate) queryParams.append('startDate', params.startDate);
    if (params?.endDate) queryParams.append('endDate', params.endDate);
    if (params?.status) queryParams.append('status', params.status);
    if (params?.brand) queryParams.append('brand', params.brand);
    if (params?.isCalculating !== undefined) {
      queryParams.append('isCalculating', String(params.isCalculating));
    }

    const url = `/api/reports/stock-interest${queryParams.toString() ? `?${queryParams}` : ''}`;
    const response = await api.get<ApiResponse<StockInterestReportResponse>>(url);

    if (!response.success || !response.data) {
      throw new Error(response.message || 'Failed to fetch stock interest report');
    }

    return response.data;
  }

  async getStockInterestReportPdf(params?: ReportQueryParams): Promise<Blob> {
    const queryParams = new URLSearchParams();
    if (params?.startDate) queryParams.append('startDate', params.startDate);
    if (params?.endDate) queryParams.append('endDate', params.endDate);
    if (params?.status) queryParams.append('status', params.status);
    if (params?.brand) queryParams.append('brand', params.brand);
    if (params?.isCalculating !== undefined) {
      queryParams.append('isCalculating', String(params.isCalculating));
    }

    const url = `/api/reports/stock-interest/pdf${queryParams.toString() ? `?${queryParams}` : ''}`;
    return api.getBlob(url);
  }

  // ============================================
  // Purchase Requirement Report
  // ============================================
  async getPurchaseRequirementReport(
    params?: PurchaseRequirementParams
  ): Promise<PurchaseRequirementReportResponse> {
    const queryParams = new URLSearchParams();
    if (params?.brand) queryParams.append('brand', params.brand);

    const url = `/api/reports/purchase-requirement${queryParams.toString() ? `?${queryParams}` : ''}`;
    const response = await api.get<ApiResponse<PurchaseRequirementReportResponse>>(url);

    if (!response.success || !response.data) {
      throw new Error(response.message || 'Failed to fetch purchase requirement report');
    }

    return response.data;
  }

  async getPurchaseRequirementReportPdf(params?: PurchaseRequirementParams): Promise<Blob> {
    const queryParams = new URLSearchParams();
    if (params?.brand) queryParams.append('brand', params.brand);

    const url = `/api/reports/purchase-requirement/pdf${queryParams.toString() ? `?${queryParams}` : ''}`;
    return api.getBlob(url);
  }

  // ============================================
  // Daily Stock Snapshot (new)
  // ============================================
  async getDailyStockSnapshot(params: { date: string }): Promise<DailyStockSnapshotResponse> {
    const url = `/api/reports/daily-stock-snapshot?date=${encodeURIComponent(params.date)}`;
    const response = await api.get<ApiResponse<DailyStockSnapshotResponse>>(url);
    if (!response.success || !response.data) {
      throw new Error(response.message || 'Failed to fetch daily stock snapshot');
    }
    return response.data;
  }

  async getDailyStockSnapshotPdf(params: { date: string }): Promise<Blob> {
    const url = `/api/pdf/daily-stock-snapshot?date=${encodeURIComponent(params.date)}`;
    return api.getBlob(url);
  }

  // ============================================
  // Monthly Purchases Report (new)
  // ============================================
  async getMonthlyPurchasesReport(params: {
    year: number;
    month: number;
    vehicleType?: string;
  }): Promise<MonthlyPurchasesResponse> {
    const qs = new URLSearchParams({
      year: String(params.year),
      month: String(params.month),
    });
    if (params.vehicleType) qs.append('vehicleType', params.vehicleType);
    const url = `/api/reports/monthly-purchases?${qs.toString()}`;
    const response = await api.get<ApiResponse<MonthlyPurchasesResponse>>(url);
    if (!response.success || !response.data) {
      throw new Error(response.message || 'Failed to fetch monthly purchases report');
    }
    return response.data;
  }

  async getMonthlyPurchasesReportPdf(params: {
    year: number;
    month: number;
    vehicleType?: string;
  }): Promise<Blob> {
    const qs = new URLSearchParams({
      year: String(params.year),
      month: String(params.month),
    });
    if (params.vehicleType) qs.append('vehicleType', params.vehicleType);
    const url = `/api/pdf/monthly-purchases?${qs.toString()}`;
    return api.getBlob(url);
  }

  // ============================================
  // Campaign Claim Report
  // ============================================
  async getCampaignClaimReport(params: {
    startDate: string;
    endDate: string;
    brand: string;
    campaignId?: string;
  }): Promise<CampaignClaimReportResponse> {
    const qs = new URLSearchParams({
      startDate: params.startDate,
      endDate: params.endDate,
      brand: params.brand,
    });
    if (params.campaignId) qs.set('campaignId', params.campaignId);
    const url = `/api/reports/campaign-claims?${qs.toString()}`;
    const response = await api.get<ApiResponse<CampaignClaimReportResponse>>(url);
    if (!response.success || !response.data) {
      throw new Error(response.message || 'Failed to fetch campaign claim report');
    }
    return response.data;
  }

  async getCampaignClaimReportPdf(params: {
    startDate: string;
    endDate: string;
    brand: string;
    campaignId?: string;
  }): Promise<Blob> {
    const qs = new URLSearchParams({
      startDate: params.startDate,
      endDate: params.endDate,
      brand: params.brand,
    });
    if (params.campaignId) qs.set('campaignId', params.campaignId);
    const url = `/api/pdf/campaign-claims?${qs.toString()}`;
    return api.getBlob(url);
  }

  // ============================================
  // Bank Interest Report
  // ============================================
  async getBankInterestReport(params: {
    startDate: string;
    endDate: string;
  }): Promise<BankInterestReportResponse> {
    const qs = new URLSearchParams({
      startDate: params.startDate,
      endDate: params.endDate,
    });
    const url = `/api/reports/bank-interest?${qs.toString()}`;
    const response = await api.get<ApiResponse<BankInterestReportResponse>>(url);
    if (!response.success || !response.data) {
      throw new Error(response.message || 'Failed to fetch bank interest report');
    }
    return response.data;
  }

  async downloadBankInterestReportPdf(params: {
    startDate: string;
    endDate: string;
    dueDate?: string;
  }): Promise<Blob> {
    const qs = new URLSearchParams({
      startDate: params.startDate,
      endDate: params.endDate,
    });
    if (params.dueDate) qs.append('dueDate', params.dueDate);
    const url = `/api/reports/bank-interest/pdf?${qs.toString()}`;
    return api.getBlob(url);
  }
}

export const reportService = new ReportService();
