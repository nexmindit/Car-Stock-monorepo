/**
 * PDF Document Types
 * TypeScript interfaces for PDF generation data
 */

// Company header info (shared across all documents)
export interface CompanyHeader {
  logoBase64: string;
  companyName: string;
  address1: string;
  address2: string;
  phone: string;
}

// Customer information (shared)
export interface CustomerInfo {
  name: string;
  address: string;
  street: string;
  subdistrict: string;
  district: string;
  province: string;
  postalCode: string;
  phone: string;
  taxId?: string;
}

// Car/Vehicle information (shared)
export interface CarInfo {
  brand: string;
  model?: string;
  engineNo: string;
  chassisNo: string;
  color: string;
  type?: string; // รถยนต์ไฟฟ้า, etc.
}

// Pricing table row
export interface PricingRow {
  label: string;
  amount: string;
  note?: string;
}

// Gift/Promotion item
export interface GiftItem {
  name: string;
}

/**
 * ใบปล่อยรถ/ใบรับรถ (Delivery Receipt)
 */
export interface DeliveryReceiptData {
  header: CompanyHeader;
  customer: CustomerInfo;
  car: CarInfo;
  deliveryDate?: string;
  items?: { description: string; amount: string }[];
}

/**
 * หนังสือขอบคุณ (Thank You Letter)
 */
export interface ThankYouLetterData {
  header: CompanyHeader;
  thaiDate: string;
  customerName: string; // ชื่อลูกค้า
  carBrand: string;
  detailsTable: {
    sellingPrice: string;
    discount: string;
    remaining: string;
    bookingDeposit: string; // เงินจอง (= เงินมัดจำ / sale.depositAmount)
    downPayment: string;
    downPaymentDiscount: string;
    insurance: string;
    actInsurance: string; // พรบ.
    registrationFee: string;
    totalDelivery: string;
    financeAmount: string;
    interestRate: string;
    installmentMonths: string;
    monthlyPayment: string;
    gifts: GiftItem[];
  };
  contactPerson: {
    name: string;
    phone: string;
    position: string;
  };
}

/**
 * หนังสือยืนยันการซื้อ-ขาย (Sales Confirmation)
 */
export interface SalesConfirmationData {
  header: CompanyHeader;
  createdDate: string;
  car: CarInfo;
  customer: CustomerInfo;
  paymentMethod: string; // เงินสด / บริษัทไฟแนนซ์ / ประกันภัย
  signature?: string; // Base64 signature image
}

/**
 * ใบบันทึกการขาย (Sales Record)
 */
export interface SalesRecordData {
  header: CompanyHeader;
  customer: CustomerInfo;
  car: CarInfo;
  pricing: {
    sellingPrice: string;
    remaining: string;
    downPayment: string;
    downPaymentDiscount: string;
    insurance: string;
    actInsurance: string;
    registrationFee: string;
    totalDelivery: string;
    financeAmount: string;
    // Right column
    deductDeposit: string;
    deliveryAmount: string;
    outstandingBalance: string;
    paymentDueDate: string;
    financeCompany: string;
    interestRate: string;
    installmentMonths: string;
    monthlyPayment: string;
  };
  gifts: GiftItem[];
  staff: {
    salesConsultant: string;
    salesManager: string;
    auditor: string;
  };
}

/**
 * ใบยืนยันรายละเอียดการขาย (Sales Confirmation Form)
 * Customer-facing price/discount summary + freebies list, matching the dealership Excel layout.
 */
export interface SalesConfirmationFormData {
  header: CompanyHeader;
  vehicleName: string; // brand + model + variant, e.g. "CHERY V23 4WD PEAK"
  plate: string; // ทะเบียนรถ, "—" when not yet registered
  pricing: {
    sellingPrice: string;
    carDiscount: string; // ส่วนลด (รถยนต์)
    remaining: string; // คงเหลือ = ราคาขาย − ส่วนลดรถยนต์
    deposit: string; // จอง
    downPayment: string;
    downPaymentDiscount: string;
    insurance: string; // ประกันชั้น 1
    actInsurance: string; // พรบ.
    registrationFee: string;
    totalDelivery: string; // รวมเงินออกรถ
    financeAmount: string; // ยอดจัดไฟแนนซ์
    interestRate: string;
    installmentMonths: string;
    monthlyPayment: string; // งวดละ
  };
  gifts: GiftItem[];
}

/**
 * สัญญาจองรถยนต์ (Car Reservation Contract) - Official Form
 */
export interface CarReservationContractData {
  header: CompanyHeader;

  // Copy type labels for 3-page contract
  copyTypes?: Array<{
    thai: string; // ต้นฉบับ, คู่ฉบับ, สำเนาคู่ฉบับ
    english: string; // ORIGINAL, DUPLICATE, COPY
  }>;

  // Document identification
  documentInfo: {
    volumeNumber?: string; // เล่มที่
    documentNumber?: string; // เลขที่
    contractLocation?: string; // ที่ทำสัญญา ณ
    contractDay?: string; // วันที่
    contractMonth?: string; // เดือน
    contractYear?: string; // พ.ศ.
    salesManagerName?: string; // ผู้จัดการฝ่ายขาย
    salesManagerPhone?: string; // เบอร์
    salesStaffName?: string; // พนักงานขาย
    salesStaffPhone?: string; // เบอร์
  };

  // Party information (between)
  parties: {
    companyName?: string; // ระหว่าง (บริษัท)
    dealerName?: string; // จำกัด ผู้จำหน่าย(Dealer)
    isHeadOffice?: boolean; // สำนักงานใหญ่
    isBranchOffice?: boolean; // สำนักงานสาขา
    branchLocation?: string; // ตั้งอยู่
    companyPhone?: string; // เบอร์โทรศัพท์
    companyEmail?: string; // อีเมล
    authorizedPerson?: string; // ผู้มีอำนาจกระทำการแทน
    authorizedDate?: string; // วันที่มอบอำนาจ
    authorizedMonth?: string; // เดือนมอบอำนาจ
    authorizedYear?: string; // พ.ศ. มอบอำนาจ
    customerName?: string; // ชื่อลูกค้า
    customerIdCard?: string; // เลขบัตรประจำตัวประชาชน
    customerAddress?: string; // ที่อยู่ติดต่อลูกค้า
    customerOfficePhone?: string; // โทรศัพท์ที่ทำงาน
    customerHomePhone?: string; // โทรศัพท์บ้าน
    customerMobile?: string; // โทรศัพท์มือถือ
    customerEmail?: string; // อีเมล
  };

  // Section 1.1 - Vehicle Details
  vehicleDetails: {
    type?: string; // ประเภท/Type
    brand?: string; // ยี่ห้อ/Brand
    model?: string; // รุ่น/Model
    color?: string; // สี/Color
    mfy?: string; // ปีที่ผลิต/MFY
    engineCCOrKW?: string; // ขนาดเครื่องยนต์หรือกำลังของมอเตอร์ไฟฟ้า/CC or kW
    batteryType?: string; // ประเภทของแบตเตอรี่/Battery type
    batteryCapacity?: string; // ความจุแบตเตอรี่/Battery capacity (kWh)
    nedcRange?: string; // ระยะทางวิ่งสูงสุด/NEDC Mode (KM)
    bookingDepositDate?: string; // วันที่ชำระเงินจอง/Booking deposit date
  };

  // Section 1.2 - New Car Price
  pricing: {
    priceExcludeVAT?: string; // ไม่รวมภาษีมูลค่าเพิ่ม/Exclude VAT
    priceIncludeVAT?: string; // รวมภาษีมูลค่าเพิ่ม/Include VAT
  };

  // Section 1.3 - FOC/Accessories
  freeAccessories?: string[]; // รายการของแถม/FOC

  // Section 1.4 - Reservation Fee
  reservationFee: {
    isCash?: boolean; // เงินสด/cash
    isBankTransfer?: boolean; // โอนเข้าบัญชีชื่อผู้ประกอบธุรกิจ/Bank Transfer
    amount?: string; // เป็นเงิน/amount
    accountNo?: string; // เลขที่บัญชี/Account no.
    bank?: string; // ธนาคาร/Bank
    isCreditCard?: boolean; // บัตรเครดิตธนาคาร/Credit card
    isDebitCard?: boolean; // บัตรเดบิตธนาคาร/Debit card
    cardBank?: string; // ธนาคาร
    cashAmount?: string; // เป็นเงิน/amount
    isCheque?: boolean; // เช็คธนาคาร/Bank Cheque
    chequeBranch?: string; // สาขา/Branch
    chequeNo?: string; // เลขที่เช็ค/Cheque No
    chequeDate?: string; // ลงวันที่/Date
  };

  // Section 1.5 - Additional Accessories
  additionalAccessories?: string[];

  // Section 2 - Primary Expenses
  primaryExpenses: {
    carPrice?: string; // ราคารถยนต์/Car price
    downPayment?: string; // เงินดาวน์/Down payment
    registrationFee?: string; // ค่าจดทะเบียน/Registration Fee
    redPlateFee?: string; // ค่ามัดจำป้ายแดง/Deposit red plate
    insurancePremium?: string; // ค่าเบี้ยประกันภัย/Insurance Premium
    accessoryFee?: string; // ค่าอุปกรณ์ตกแต่ง/Accessory
    otherFee?: string; // อื่นๆ/Other
    totalExpense?: string; // รวมค่าใช้จ่าย/Total Expense
    reservationFee?: string; // หัก เงินจอง/Reservation Fee
    usedCarTradeIn?: string; // หัก เงินค่ารถเก่า/Used car trade-in
    otherDiscount?: string; // อื่นๆ/Other (ส่วนลดเงินสด)
    netTotalExpense?: string; // รวมค่าใช้จ่ายทั้งสิ้น/Net total expense
  };

  // Section 3 - Purchase Conditions
  purchaseConditions: {
    isCash?: boolean; // เงินสด/Cash
    isHirePurchase?: boolean; // ทรัพย์สินเช่าซื้อ/Hire Purchase
    financeCompany?: string; // บริษัทไฟแนนซ์/Finance company
    downPaymentPercent?: string; // เงินดาวน์/Down payment %
    downPaymentAmount?: string; // บาท/Baht
    interestPercent?: string; // ดอกเบี้ย/Interest %
    isBeginning?: boolean; // ต้นงวด/Beginning
    isEnding?: boolean; // ปลายงวด/Ending
    financeAmount?: string; // ยอดจัด/Finance Amount
    installmentMonths?: string; // ผ่อนชำระ/Installment (months)
    monthlyPayment?: string; // เดือนละ/Monthly (baht)
  };

  // Section 4 - Insurance
  insurance: {
    companyName?: string; // บริษัท/Company Name
    partNumber?: string; // ประเภท/Part
    sumInsured?: string; // ทุนประกัน/Sum Insure
    specifyPremium?: boolean; // ระบุค่าเบี้ยประกันภัย checkbox
    premiumAmount?: string; // ระบุค่าเบี้ยประกันภัย/Premium บาท
    notSpecifyPremium?: boolean; // ไม่ระบุค่าเบี้ยประกันภัย checkbox
    notSpecifyPremiumAmount?: string; // ไม่ระบุค่าเบี้ยประกันภัย/Premium บาท
  };

  // Section 5 - Delivery
  delivery: {
    deliveryDate?: string; // กำหนดวันส่งมอบ/Delivery Date
    deliveryLocation?: string; // สถานที่ส่งมอบ/Location
  };

  // Footer note checkbox
  termsAcknowledged?: boolean;
}

/**
 * สัญญาจองรถยนต์ (Contract/Reservation) - Simple version (legacy)
 */
export interface ContractData {
  header: CompanyHeader;
  reservationNumber: string;
  date: string;
  customer: CustomerInfo;
  vehicle: {
    model: string;
    color: string;
  };
  financial: {
    totalPrice: string;
    depositAmount: string;
    refundPolicy: string;
  };
}

/**
 * ใบรับเงินมัดจำ (Deposit Receipt)
 */
export interface DepositReceiptData {
  header: CompanyHeader;
  receiptNumber: string;
  date: string;
  customer: CustomerInfo;
  car: CarInfo;
  depositAmount: string;
  depositAmountText: string; // Thai text representation
  paymentMethod: string;
  note?: string;
}

/**
 * PDF generation options
 */
export interface PdfOptions {
  format?: 'A4' | 'Letter';
  width?: string; // Custom width (e.g., '9in', '228.6mm')
  height?: string; // Custom height (e.g., '5.5in', '139.7mm')
  padding?: string; // Custom padding for content container
  margin?: {
    top: string;
    right: string;
    bottom: string;
    left: string;
  };
  landscape?: boolean;
  printBackground?: boolean;
  scale?: number; // Scale of the page rendering (0.1 - 2.0, default 1.0)
  /**
   * When set, render an HTML page for browser printing: emits an @page rule
   * (size = physical paper) and neutralizes template .page print padding so
   * the @page margin is the only edge gap.
   */
  htmlPage?: {
    size: string; // CSS @page size, e.g. '27.94cm 21.59cm' (Letter landscape)
    margin: string; // CSS @page margin shorthand, e.g. '1.7mm 5mm 5mm 1mm'
  };
}

/**
 * Template types enum
 */
export enum PdfTemplateType {
  DELIVERY_RECEIPT = 'delivery-receipt',
  THANK_YOU_LETTER = 'thank-you-letter',
  SALES_CONFIRMATION = 'sales-confirmation',
  SALES_CONFIRMATION_FORM = 'sales-confirmation-form',
  SALES_RECORD = 'sales-record',
  CONTRACT = 'contract',
  DEPOSIT_RECEIPT = 'deposit-receipt',
  PAYMENT_RECEIPT = 'payment-receipt',
  VEHICLE_CARD = 'vehicle-card',
  TEMPORARY_RECEIPT = 'temporary-receipt',
  TEMPORARY_RECEIPT_BG = 'temporary-receipt-bg',
  DAILY_PAYMENT_REPORT = 'daily-payment-report',
  STOCK_REPORT = 'stock-report',
  PROFIT_LOSS_REPORT = 'profit-loss-report',
  SALES_SUMMARY_REPORT = 'sales-summary-report',
  STOCK_INTEREST_REPORT = 'stock-interest-report',
  BANK_INTEREST_REPORT = 'bank-interest-report',
  PURCHASE_REQUIREMENT_REPORT = 'purchase-requirement-report',
  DAILY_STOCK_SNAPSHOT = 'daily-stock-snapshot',
  MONTHLY_PURCHASES_REPORT = 'monthly-purchases-report',
  CAMPAIGN_REPORT = 'campaign-report',
  CAMPAIGN_CLAIM_MONTHLY = 'campaign-claim-monthly',
}

/**
 * Campaign Report Data — mirrors the shape returned by campaignsService.getCampaignReport(id)
 * with PDF-specific helper fields pre-computed in the controller (e.g. row indices).
 */
export interface CampaignReportData {
  header: CompanyHeader;
  campaign: {
    id: string;
    name: string;
    description: string | null;
    startDate: string | Date;
    endDate: string | Date;
    notes?: string | null;
    createdByName: string;
  };
  groups: any[]; // report groups; shape mirrors web consumer
  allGroupModelNames: string[]; // for the cross-model "STANDARD" columns
  summary: {
    totalSales: number;
    totalVehicleModels: number;
    totalAmount: number;
  };
  printedAt: string;
}

/**
 * ใบเสร็จรับเงิน (Payment Receipt)
 */
export interface PaymentReceiptData {
  header: CompanyHeader;
  receiptNumber: string;
  date: string;
  customer: CustomerInfo;
  car: CarInfo;
  items?: { description: string; amount: string }[];
  amount: string;
  amountText: string;
  paymentMethod: string;
  note?: string;
}

/**
 * การ์ดรายละเอียดรถยนต์ (Vehicle Card)
 */
export interface VehicleCardData {
  header: CompanyHeader;
  stockNumber: string; // VIN or Stock No
  date: string;
  orderDate?: string; // วันที่สั่งซื้อ (Stock.orderDate, Thai-formatted; '' when unset)
  car: {
    brand: string;
    model: string;
    variant?: string;
    year: string;
    color: string; // exterior
    interiorColor?: string;
    engineNo: string;
    chassisNo: string;
    motorNumbers?: string; // EV/Hybrid motor number(s), joined by ' / '
    ccOrKw?: string;
  };
  costs: {
    baseCost: string;
    beforeVat: string;
    beforeVatInt: string;
    beforeVatDec: string;
    vatAmount: string;
    vatAmountInt: string;
    vatAmountDec: string;
    totalWithVat: string;
    totalWithVatInt: string;
    totalWithVatDec: string;
    transportCost: string;
    accessoryCost: string;
    otherCosts: string;
    totalCost: string;
  };
  location?: string; // Parking slot
}

/**
 * Item in temporary receipt
 */
export interface TemporaryReceiptItem {
  no?: number;
  description: string;
  amount: string;
}

/**
 * ใบรับเงินชั่วคราว (Temporary Receipt) - Small Format 9x5.5 inch
 */
export interface TemporaryReceiptData {
  header: CompanyHeader & {
    fax?: string;
  };
  customerCode?: string;
  receiptNumber: string;
  date: string;
  contractNumber?: string; // เลขที่สัญญา
  customer: CustomerInfo;
  items: TemporaryReceiptItem[];
  // Totals section
  paymentAmount?: string; // ยอดชำระ
  lateFee?: string; // เบี้ยปรับล่าช้า/ภาษน.
  discount?: string; // หัก ส่วนลด
  totalAmount: string; // จำนวนเงินที่ต้องชำระ
  totalAmountText?: string; // Thai text representation
  paymentMethod?: {
    isCash?: boolean;
    isCheque?: boolean;
    isTransfer?: boolean;
    bankName?: string;
    branchName?: string;
    accountNumber?: string;
    chequeNumber?: string;
    chequeDate?: string;
    chequeAmount?: string;
    transferDate?: string;
    transferAmount?: string;
  };
  paymentMethodLabel?: string;
  note?: string;
  // Bank account selected when the receipt was created — printed left of the
  // money summary so the customer knows where the payment went / pays into.
  bankAccount?: {
    bankName?: string;
    accountNumber?: string;
    accountName?: string;
  };
  /** When true, temporary-receipt.hbs uses A4 landscape instead of 9.5×5.5 in. */
  paperA4?: boolean;
}

/**
 * Daily Payment Report Data
 */
export interface DailyPaymentReportData {
  header: CompanyHeader;
  dateRange: string;
  payments: any[];
  summary: any;
}

/**
 * Stock Report Data
 */
export interface StockReportData {
  header: CompanyHeader;
  dateRange: string;
  stocks: any[];
  summary: any;
}

/**
 * Profit & Loss Report Data
 */
export interface ProfitLossReportData {
  header: CompanyHeader;
  dateRange: string;
  items: any[];
  summary: any;
}

/**
 * Sales Summary Report Data
 */
export interface SalesSummaryReportData {
  header: CompanyHeader;
  dateRange: string;
  /** Applied status / vehicle-type filters in Thai; empty when none. */
  filterLabel?: string;
  sales: any[];
  summary: any;
  bySalesperson: any[];
}

/**
 * Stock Interest Report Data
 */
export interface StockInterestReportData {
  header: CompanyHeader;
  dateRange: string;
  stocks: any[];
  summary: any;
}

/**
 * Bank Interest Report Data (รายงานคำนวณดอกเบี้ยธนาคาร ต่องวด)
 */
export interface BankInterestReportData {
  header: CompanyHeader;
  dateRange: string; // ช่วงรอบบิล (Thai numeric range)
  dueDate: string; // วันครบกำหนดชำระ (Thai numeric)
  rows: any[];
  summary: any;
}

/**
 * Purchase Requirement Report Data
 */
export interface PurchaseRequirementReportData {
  header: CompanyHeader;
  dateRange: string;
  items: {
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
  }[];
  summary: {
    totalReservations: number;
    totalAvailable: number;
    totalRequired: number;
    modelsNeedingPurchase: number;
    totalModels: number;
  };
}

/**
 * Monthly Campaign Claim Report Data — brand submission form
 * (รายงานเบิกแคมเปญเงินส่งเสริมการขายประจำเดือน)
 */
export interface CampaignSubsidyAmounts {
  stockLevel: number;
  afterSalesNoComplaint: number;
  afterSalesQr: number;
  marketing: number;
  retailTarget: number;
  total: number;
}

export interface CampaignClaimReportData {
  header: {
    logoBase64: string;
    companyName: string;
    address1: string;
    address2: string;
    phone: string;
  };
  periodLabel: string; // e.g. '1 กรกฎาคม 2569 - 31 กรกฎาคม 2569'
  brand: string;
  /** Expense-line names; the dynamic columns of the table. */
  expenseColumns: string[];
  rows: Array<{
    no: number;
    customerName: string;
    modelName: string;
    vin: string;
    notifyDate: string | null;
    salePrice: number;
    /** Aligned 1:1 to expenseColumns; null = model lacks that line. */
    cells: Array<number | null>;
    total: number;
  }>;
  summary: {
    totalCars: number;
    columnTotals: number[]; // aligned 1:1 to expenseColumns
    grandTotal: number;
  };
  printedAt: string;
}
