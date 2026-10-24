// ============================================
// Report Types
// ============================================

// Date Range for filtering
export interface DateRange {
  startDate: string;
  endDate: string;
}

// ============================================
// Daily Payment Report Types
// ============================================

export interface DailyPaymentItem {
  id: string;
  receiptNumber: string;
  paymentDate: string;
  customerName: string;
  customerCode: string;
  description?: string;
  paymentType: string;
  paymentTypeLabel: string;
  paymentMethod: string;
  paymentMethodLabel: string;
  amount: number;
  saleNumber?: string;
  issuedBy?: string;
  notes?: string;
}

export interface PaymentMethodSummary {
  method: string;
  label: string;
  count: number;
  amount: number;
}

export interface DailyPaymentSummary {
  totalAmount: number;
  totalCount: number;
  byMethod: PaymentMethodSummary[];
  byType: {
    type: string;
    label: string;
    count: number;
    amount: number;
  }[];
}

export interface DailyPaymentChartData {
  date: string;
  amount: number;
  count: number;
}

export interface DailyPaymentReportResponse {
  payments: DailyPaymentItem[];
  summary: DailyPaymentSummary;
  chartData: DailyPaymentChartData[];
}

// ============================================
// Stock Report Types
// ============================================

export interface StockReportItem {
  id: string;
  vin: string;
  engineNumber?: string;
  brand: string;
  model: string;
  variant?: string;
  year: number;
  vehicleModelName?: string;
  /** vehicle_types.code */
  vehicleType?: string;
  exteriorColor: string;
  interiorColor?: string;
  status: string;
  statusLabel: string;
  arrivalDate: string;
  orderDate?: string;
  daysInStock: number;
  parkingSlot?: string;
  receivedFrom?: string;
  priceNet?: number;
  priceVat?: number;
  priceGross?: number;
  baseCost: number;
  totalCost: number;
  notes?: string | null;
}

export interface StockStatusSummary {
  status: string;
  label: string;
  count: number;
  percentage: number;
}

export interface StockBrandSummary {
  brand: string;
  count: number;
  percentage: number;
}

export interface StockReportSummary {
  totalCount: number;
  availableCount: number;
  demoCount: number;
  reservedCount: number;
  preparingCount: number;
  soldCount: number;
  totalValue: number;
  byStatus: StockStatusSummary[];
  byBrand: StockBrandSummary[];
}

export interface StockChartData {
  byStatus: { status: string; label: string; count: number }[];
  byBrand: { brand: string; count: number }[];
  byMonth: { month: string; incoming: number; sold: number }[];
}

export interface StockReportResponse {
  stocks: StockReportItem[];
  summary: StockReportSummary;
  chartData: StockChartData;
}

// ============================================
// Profit & Loss Report Types
// ============================================

export interface ProfitLossItem {
  id: string;
  saleNumber: string;
  saleDate: string;
  completedDate?: string;
  customerName: string;
  vehicleInfo: string;
  vin: string;
  sellingPrice: number;
  baseCost: number;
  transportCost: number;
  accessoryCost: number;
  otherCosts: number;
  totalCost: number;
  interestCost: number;
  accumulatedInterest: number;
  totalCostWithInterest: number;
  grossProfit: number;
  netProfit: number;
  profitMargin: number;
  salesperson: string;
}

export interface ProfitLossSummary {
  totalRevenue: number;
  totalCost: number;
  totalInterestCost: number;
  totalInterest: number;
  totalCostWithInterest: number;
  grossProfit: number;
  netProfit: number;
  avgProfitMargin: number;
  profitMargin: number;
  averageProfitPerVehicle: number;
  totalSales: number;
  saleCount: number;
  profitableSales: number;
  lossSales: number;
}

export interface MonthlyProfit {
  month: string;
  revenue: number;
  cost: number;
  netProfit: number;
}

export interface ProfitLossChartData {
  monthlyProfit: MonthlyProfit[];
  monthly: { month: string; revenue: number; cost: number; profit: number }[];
  bySalesperson: { name: string; profit: number; count: number }[];
}

export interface ProfitLossReportResponse {
  items: ProfitLossItem[];
  sales: ProfitLossItem[];
  summary: ProfitLossSummary;
  chartData: ProfitLossChartData;
}

// ============================================
// Sales Summary Report Types
// ============================================

export interface SalesSummaryItem {
  id: string;
  saleNumber: string;
  saleDate: string;
  customerName: string;
  customerType: string;
  vehicleInfo: string;
  vehicleModelName?: string;
  /** vehicle_types.code */
  vehicleType?: string | null;
  vin?: string;
  chassisNumber?: string;
  engineNumber?: string;
  saleType: string;
  paymentMode: string;
  totalAmount: number;
  paidAmount: number;
  remainingAmount: number;
  status: string;
  statusLabel: string;
  salesperson: string;
  receivedFrom?: string;
  priceNet?: number;
  priceVat?: number;
  priceGross?: number;
  // Money breakdown — always returned by getSalesSummaryReport (reports.service.ts),
  // previously untyped on the web. Mirrors the server PDF columns (sales-summary-report.hbs).
  discountAmount?: number; // ส่วนลดตัวรถ
  campaignSubsidy?: number; // ยอดเบิกสดจากสูตรแคมเปญ — PDF column "แคมเปญขาย"
  netCarDiscount?: number; // ส่วนลดตัวรถ สุทธิ (discount − subsidy)
  downPayment?: number; // เงินดาวน์
  downPaymentDiscount?: number; // ส่วนลดดาวน์
  financeAmount?: number; // ยอดจัด
  financeReturn?: number; // ค่าคอมไฟแนนซ์ (= sale.financeCommission)
  interestCost?: number; // ดอกเบี้ย
  transportFee?: number; // ทะเบียน/พรบ/ขนส่ง (registrationFee + compulsoryInsuranceFee)
  totalCost?: number; // ต้นทุน
  campaignName?: string; // ชื่อแคมเปญ
  stockNotes?: string; // หมายเหตุสต็อก — PDF/Excel column "หมายเหตุ"
  salesCommission?: number; // คอมฯ พนักงานขาย
  salesExpense?: number; // ค่าใช้จ่ายในการขาย
  insurancePremium?: number; // ค่าเบี้ยประกัน (= sale.insuranceFee)
  netProfit?: number; // กำไรสุทธิ
}

export interface SalespersonSummary {
  id: string;
  name: string;
  saleCount: number;
  totalAmount: number;
  percentage: number;
}

export interface SalesBySalesperson {
  id: string;
  salesperson: string;
  totalSales: number;
  pendingCount: number;
  completedCount: number;
  canceledCount: number;
  totalAmount: number;
  commission: number;
  commissionVat: number;
  commissionWithVat: number;
}

export interface SalesSummaryReportSummary {
  totalSales: number;
  totalCount: number;
  totalAmount: number;
  totalPaid: number;
  totalRemaining: number;
  avgSaleAmount: number;
  averageAmount: number;
  completedCount: number;
  topSalesperson: string;
  bySalesperson: SalespersonSummary[];
  byStatus: { status: string; label: string; count: number; amount: number }[];
  byPaymentMode: { mode: string; label: string; count: number; amount: number }[];
  totalCampaignSubsidy?: number;
  totalNetCarDiscount?: number;
  totalNetProfit?: number;
}

export interface SalesSummaryChartData {
  monthly: { month: string; count: number; amount: number }[];
  bySalesperson: { name: string; count: number; amount: number }[];
  byStatus: { status: string; label: string; count: number; amount: number }[];
}

export interface SalesSummaryReportResponse {
  sales: SalesSummaryItem[];
  bySalesperson: SalesBySalesperson[];
  summary: SalesSummaryReportSummary;
  chartData: SalesSummaryChartData;
}

// ============================================
// Stock Interest Report Types
// ============================================

export interface StockInterestItem {
  stockId: string;
  vin: string;
  brand: string;
  model: string;
  variant?: string;
  vehicleInfo: string;
  year: number;
  exteriorColor: string;
  status: string;
  statusLabel: string;
  arrivalDate: string;
  orderDate?: string;
  interestStartDate: string;
  interestStoppedAt?: string;
  /** Start date while accruing; stop date when stopped. */
  interestActionDate: string;
  interestStatusLabel: string;
  daysInStock: number;
  daysCount: number;
  currentRate: number;
  interestRate: number;
  principalBase: string;
  principalAmount: number;
  baseCost: number;
  totalInterest: number;
  paidInterest: number;
  pendingInterest: number;
  totalCostWithInterest: number;
  accumulatedInterest: number;
  isCalculating: boolean;
}

export interface StockInterestSummary {
  totalInterest: number;
  paidInterest: number;
  pendingInterest: number;
  totalVehicles: number;
  totalBaseCost: number;
  averageInterestPerDay: number;
  overdueVehicles: number;
  overdueInterest: number;
  calculatingCount: number;
  calculatingInterest: number;
  stoppedCount: number;
  stoppedInterest: number;
  totalStockCount: number;
  avgRate: number;
  avgDaysInStock: number;
}

export interface MonthlyInterest {
  month: string;
  interest: number;
  paidInterest: number;
}

export interface StockInterestChartData {
  monthlyInterest: MonthlyInterest[];
  monthly: { month: string; interest: number }[];
  byStatus: { status: string; label: string; interest: number }[];
  byBrand: { brand: string; interest: number; count: number }[];
}

export interface StockInterestReportResponse {
  items: StockInterestItem[];
  stocks: StockInterestItem[];
  summary: StockInterestSummary;
  chartData: StockInterestChartData;
}

// ============================================
// Purchase Requirement Report Types
// ============================================

export interface PurchaseRequirementItem {
  vehicleModelId: string;
  brand: string;
  model: string;
  variant: string;
  year: number;
  vehicleModelName: string;
  reservationCount: number;
  availableCount: number;
  requiredPurchase: number;
  status: 'NEED_TO_BUY' | 'SUFFICIENT';
}

export interface PurchaseRequirementSummary {
  totalReservations: number;
  totalAvailable: number;
  totalRequired: number;
  modelsNeedingPurchase: number;
  totalModels: number;
}

export interface PurchaseRequirementReportResponse {
  items: PurchaseRequirementItem[];
  summary: PurchaseRequirementSummary;
}

export interface PurchaseRequirementParams {
  brand?: string;
}

// ============================================
// Report Query Params
// ============================================

export interface ReportQueryParams {
  startDate?: string;
  endDate?: string;
  status?: string;
  brand?: string;
  model?: string;
  exteriorColor?: string;
  interiorColor?: string;
  salespersonId?: string;
  isCalculating?: boolean;
  vehicleType?: string;
}
