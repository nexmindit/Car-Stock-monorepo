import { api } from '../lib/api';

export interface VehicleModelSummary {
  id: string;
  brand: string;
  model: string;
  variant?: string;
  year: number;
  price?: string | number;
  standardCost?: string | number;
  type?: string;
}

export interface Campaign {
  id: string;
  name: string;
  description?: string;
  status: 'DRAFT' | 'ACTIVE' | 'ENDED';
  startDate: string;
  endDate: string;
  notes?: string;
  branch?: string;
  createdBy: {
    id: string;
    firstName: string;
    lastName: string;
  };
  vehicleModels: VehicleModelSummary[];
  salesCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface CreateCampaignData {
  name: string;
  description?: string;
  startDate: string;
  endDate: string;
  notes?: string;
  branch?: string;
  vehicleModelIds?: string[];
  status?: 'DRAFT' | 'ACTIVE';
}

export interface UpdateCampaignData {
  name?: string;
  description?: string;
  status?: 'DRAFT' | 'ACTIVE' | 'ENDED';
  startDate?: string;
  endDate?: string;
  notes?: string;
  branch?: string;
  vehicleModelIds?: string[];
}

export interface CampaignAnalyticsItem {
  vehicleModelId: string;
  vehicleModel: {
    id: string;
    brand: string;
    model: string;
    variant?: string;
    year: number;
  };
  totalSales: number;
  totalAmount: number;
  directSales: number;
  reservationSales: number;
}

export interface CampaignAnalyticsSummary {
  totalVehicleModels: number;
  totalSales: number;
  totalAmount: number;
  directSales: number;
  reservationSales: number;
  periodStart: string;
  periodEnd: string;
}

export interface CampaignAnalytics {
  analytics: CampaignAnalyticsItem[];
  summary: CampaignAnalyticsSummary;
}

export type FormulaOperator = 'ADD' | 'SUBTRACT' | 'MULTIPLY' | 'PERCENT' | 'PERCENT_SUBTRACT' | 'FIXED';
export type FormulaPriceTarget = 'COST_PRICE' | 'SELLING_PRICE';

export interface CampaignFormula {
  id: string;
  campaignId: string;
  vehicleModelId: string;
  name: string;
  operator: FormulaOperator;
  value: number;
  priceTarget: FormulaPriceTarget;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface CreateFormulaData {
  name: string;
  operator: FormulaOperator;
  value: number;
  priceTarget: FormulaPriceTarget;
  sortOrder?: number;
}

export interface UpdateFormulaData {
  name?: string;
  operator?: FormulaOperator;
  value?: number;
  priceTarget?: FormulaPriceTarget;
  sortOrder?: number;
}

export interface ReorderItem {
  formulaId: string;
  sortOrder: number;
}

export interface CampaignReportSaleItem {
  saleId: string;
  saleNumber: string;
  saleType: string;
  saleStatus: string;
  customerName: string;
  salesperson: string;
  vin: string;
  engineNumber: string;
  exteriorColor: string;
  saleDate: string;
  soldDate: string | null;
  totalAmount: number;
  paymentMode: string;
  financeProvider: string;
  originalCostPrice: number;
  originalSellingPrice: number;
  adjustedCostPrice: number;
  adjustedSellingPrice: number;
  costPriceDiff: number;
  sellingPriceDiff: number;
  /** Rebate the dealership claims from supplier for this sale (positive = supplier owes). */
  rebatePerCar: number;
  /** Finance commission (ค่าคอมไฟแนนซ์) earned from the finance company for this sale. */
  financeCommission: number;
  formulaResults: {
    formulaId: string;
    name: string;
    operator: FormulaOperator;
    value: number;
    priceTarget: FormulaPriceTarget;
    sortOrder: number;
    resultValue: number;
  }[];
}

export interface CampaignReportGroup {
  vehicleModelId: string;
  vehicleModel: VehicleModelSummary;
  formulas: {
    id: string;
    name: string;
    operator: FormulaOperator;
    value: number;
    priceTarget: FormulaPriceTarget;
    sortOrder: number;
  }[];
  sales: CampaignReportSaleItem[];
  totalSales: number;
  totalAmount: number;
  /** Sum of rebatePerCar across this group's sales. */
  totalRebate: number;
  /** Sum of financeCommission across this group's sales. */
  totalFinanceCommission: number;
}

export interface CampaignReport {
  campaign: {
    id: string;
    name: string;
    description?: string;
    status: string;
    startDate: string;
    endDate: string;
    notes?: string;
    createdBy: { id: string; firstName: string; lastName: string };
  };
  vehicleModels: (VehicleModelSummary & { formulaCount: number })[];
  groups: CampaignReportGroup[];
  summary: {
    totalVehicleModels: number;
    totalSales: number;
    totalAmount: number;
    /** Grand total rebate amount to claim from the supplier. */
    totalRebate: number;
    /** Grand total finance commission across all sales in the campaign. */
    totalFinanceCommission: number;
  };
}

export interface CampaignFilters {
  page?: number;
  limit?: number;
  search?: string;
  branch?: string;
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
  meta?: PaginatedResponse<Campaign>['meta'];
  message?: string;
}

class CampaignService {
  async getAll(filters: CampaignFilters = {}): Promise<PaginatedResponse<Campaign>> {
    const params = new URLSearchParams();
    if (filters.page) params.append('page', filters.page.toString());
    if (filters.limit) params.append('limit', filters.limit.toString());
    if (filters.search) params.append('search', filters.search);
    if (filters.branch) params.append('branch', filters.branch);

    const response = await api.get<ApiResponse<Campaign[]>>(`/api/campaigns?${params.toString()}`);
    return {
      data: response.data,
      meta: response.meta!,
    };
  }

  async getBranches(): Promise<string[]> {
    const res = await api.get<ApiResponse<string[]>>('/api/campaigns/branches');
    return res.data;
  }

  async getById(id: string): Promise<Campaign> {
    const response = await api.get<ApiResponse<Campaign>>(`/api/campaigns/${id}`);
    return response.data;
  }

  async getActiveCampaigns(): Promise<Campaign[]> {
    const response = await api.get<ApiResponse<Campaign[]>>('/api/campaigns/active');
    return response.data;
  }

  async create(data: CreateCampaignData): Promise<Campaign> {
    const response = await api.post<ApiResponse<Campaign>>('/api/campaigns', data);
    return response.data;
  }

  async duplicate(id: string): Promise<Campaign> {
    const res = await api.post<ApiResponse<Campaign>>(`/api/campaigns/${id}/duplicate`, {});
    return res.data;
  }

  async update(id: string, data: UpdateCampaignData): Promise<Campaign> {
    const response = await api.put<ApiResponse<Campaign>>(`/api/campaigns/${id}`, data);
    return response.data;
  }

  async delete(id: string): Promise<void> {
    await api.delete(`/api/campaigns/${id}`);
  }

  async getVehicleModels(campaignId: string): Promise<VehicleModelSummary[]> {
    const response = await api.get<ApiResponse<VehicleModelSummary[]>>(
      `/api/campaigns/${campaignId}/vehicle-models`
    );
    return response.data;
  }

  async addVehicleModel(campaignId: string, vehicleModelId: string): Promise<void> {
    await api.post(`/api/campaigns/${campaignId}/vehicle-models`, { vehicleModelId });
  }

  async removeVehicleModel(campaignId: string, vehicleModelId: string): Promise<void> {
    await api.delete(`/api/campaigns/${campaignId}/vehicle-models/${vehicleModelId}`);
  }

  async getAnalytics(
    campaignId: string,
    startDate?: string,
    endDate?: string
  ): Promise<CampaignAnalytics> {
    const params = new URLSearchParams();
    if (startDate) params.append('startDate', startDate);
    if (endDate) params.append('endDate', endDate);

    const response = await api.get<ApiResponse<CampaignAnalytics>>(
      `/api/campaigns/${campaignId}/analytics?${params.toString()}`
    );
    return response.data;
  }

  // ============================================
  // Formula Methods
  // ============================================

  async getFormulas(campaignId: string, vehicleModelId: string): Promise<CampaignFormula[]> {
    const response = await api.get<ApiResponse<CampaignFormula[]>>(
      `/api/campaigns/${campaignId}/vehicle-models/${vehicleModelId}/formulas`
    );
    return response.data;
  }

  async createFormula(
    campaignId: string,
    vehicleModelId: string,
    data: CreateFormulaData
  ): Promise<CampaignFormula> {
    const response = await api.post<ApiResponse<CampaignFormula>>(
      `/api/campaigns/${campaignId}/vehicle-models/${vehicleModelId}/formulas`,
      data
    );
    return response.data;
  }

  async updateFormula(
    campaignId: string,
    vehicleModelId: string,
    formulaId: string,
    data: UpdateFormulaData
  ): Promise<CampaignFormula> {
    const response = await api.put<ApiResponse<CampaignFormula>>(
      `/api/campaigns/${campaignId}/vehicle-models/${vehicleModelId}/formulas/${formulaId}`,
      data
    );
    return response.data;
  }

  async deleteFormula(
    campaignId: string,
    vehicleModelId: string,
    formulaId: string
  ): Promise<void> {
    await api.delete(
      `/api/campaigns/${campaignId}/vehicle-models/${vehicleModelId}/formulas/${formulaId}`
    );
  }

  async reorderFormulas(
    campaignId: string,
    vehicleModelId: string,
    items: ReorderItem[]
  ): Promise<CampaignFormula[]> {
    const response = await api.put<ApiResponse<CampaignFormula[]>>(
      `/api/campaigns/${campaignId}/vehicle-models/${vehicleModelId}/formulas-reorder`,
      { items }
    );
    return response.data;
  }

  // ============================================
  // Report Methods
  // ============================================

  async getReport(campaignId: string): Promise<CampaignReport> {
    const response = await api.get<ApiResponse<CampaignReport>>(
      `/api/campaigns/${campaignId}/report`
    );
    return response.data;
  }

  async getReportPdf(campaignId: string): Promise<Blob> {
    return api.getBlob(`/api/campaigns/${campaignId}/report/pdf`);
  }
}

export const campaignService = new CampaignService();
