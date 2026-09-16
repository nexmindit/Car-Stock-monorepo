/**
 * PDF Generation Service
 * Uses Puppeteer (in-process Chromium) for HTML-to-PDF conversion with Handlebars templates
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import type { VehicleCardFieldKey } from '@car-stock/shared/constants';
import {
  VEHICLE_CARD_FONTS,
  type VehicleCardLayout,
  mergeVehicleCardLayout,
} from '@car-stock/shared/schemas';
import Handlebars from 'handlebars';
import puppeteer, { type Browser } from 'puppeteer-core';
import {
  formatCurrency,
  formatIdCard,
  formatInt,
  formatPercentage,
  formatPhoneNumber,
  formatThaiDate,
  formatThaiDateWithDay,
  getCurrentThaiDate,
  numberToThaiText,
  safeString,
} from './helpers';
import {
  type BankInterestReportData,
  type CampaignClaimReportData,
  type CarReservationContractData,
  type CompanyHeader,
  type ContractData,
  type DailyPaymentReportData,
  type DeliveryReceiptData,
  type DepositReceiptData,
  type PaymentReceiptData,
  type PdfOptions,
  PdfTemplateType,
  type ProfitLossReportData,
  type PurchaseRequirementReportData,
  type SalesConfirmationData,
  type SalesConfirmationFormData,
  type SalesRecordData,
  type SalesSummaryReportData,
  type StockInterestReportData,
  type StockReportData,
  type TemporaryReceiptData,
  type ThankYouLetterData,
  type VehicleCardData,
} from './types';

// Register Handlebars helpers
Handlebars.registerHelper('formatThaiDate', (date: string, format?: string) =>
  formatThaiDate(date, format as 'full' | 'short' | 'numeric')
);
Handlebars.registerHelper('formatThaiDateWithDay', (date: string) => formatThaiDateWithDay(date));
Handlebars.registerHelper('formatCurrency', (amount: number | string, showCurrency?: boolean) =>
  formatCurrency(amount, showCurrency !== false)
);
Handlebars.registerHelper('formatInt', (amount: number | string) => formatInt(amount));
Handlebars.registerHelper('numberToThaiText', (num: number | string) => numberToThaiText(num));
Handlebars.registerHelper('formatPhone', (phone: string) => formatPhoneNumber(phone));
Handlebars.registerHelper('formatIdCard', (idCard: string) => formatIdCard(idCard));
Handlebars.registerHelper('currentThaiDate', () => getCurrentThaiDate());
Handlebars.registerHelper('safe', (value: string | null | undefined, defaultValue?: string) =>
  safeString(value, defaultValue)
);
Handlebars.registerHelper('formatPercentage', (value: number | string) => formatPercentage(value));
Handlebars.registerHelper(
  'ifEquals',
  function (this: any, arg1: any, arg2: any, options: Handlebars.HelperOptions) {
    return arg1 === arg2 ? options.fn(this) : options.inverse(this);
  }
);
Handlebars.registerHelper('add', (a: number, b: number) => a + b);
Handlebars.registerHelper('subtract', (a: number, b: number) => a - b);
Handlebars.registerHelper('gt', (a: number, b: number) => a > b);
Handlebars.registerHelper('lt', (a: number, b: number) => a < b);
Handlebars.registerHelper('toLowerCase', (str: string) => {
  if (!str) return '';
  return str.toString().toLowerCase();
});
// Currency amount that renders '-' for zero/empty (used by the sales confirmation form)
Handlebars.registerHelper('amt', (value: number | string | null | undefined) => {
  const num = typeof value === 'string' ? Number.parseFloat(value) : value;
  if (value === null || value === undefined || value === '' || Number.isNaN(num) || num === 0) {
    return '-';
  }
  return (num as number).toLocaleString('th-TH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
});

// Default company header — used only as fallback when settings not configured
const DEFAULT_COMPANY_HEADER: CompanyHeader = {
  logoBase64: '',
  companyName: '(กรุณาตั้งค่าข้อมูลบริษัทใน Settings)',
  address1: '',
  address2: '',
  phone: '',
};

export class PdfService {
  private static instance: PdfService;
  private templateCache: Map<string, Handlebars.TemplateDelegate> = new Map();
  private templatesDir: string;
  private fontsDir: string;
  private logoBase64 = '';
  private receiptBgBase64 = '';

  // Puppeteer browser management
  private browser: Browser | null = null;
  private browserLaunchPromise: Promise<Browser> | null = null;

  private constructor() {
    const baseDir = process.env.PDF_ASSETS_DIR || path.join(process.cwd(), 'src', 'modules', 'pdf');
    this.templatesDir = path.join(baseDir, 'templates');
    this.fontsDir = path.join(baseDir, 'fonts');
    this.loadLogo();
    this.loadReceiptBg();
    this.registerPartials();
  }

  /**
   * Get singleton instance
   */
  public static getInstance(): PdfService {
    if (!PdfService.instance) {
      PdfService.instance = new PdfService();
    }
    return PdfService.instance;
  }

  /**
   * Load company logo as base64
   */
  private loadLogo(): void {
    try {
      // Try multiple locations for the logo
      const possiblePaths = [
        path.join(this.templatesDir, '..', 'images', 'Logo_150x150.png'),
        path.join(process.cwd(), 'public', 'images', 'Logo_150x150.png'),
      ];

      for (const logoPath of possiblePaths) {
        if (fs.existsSync(logoPath)) {
          const logoData = fs.readFileSync(logoPath);
          this.logoBase64 = `data:image/png;base64,${logoData.toString('base64')}`;
          console.log(`✅ Logo loaded from: ${logoPath}`);
          return;
        }
      }
      console.warn('⚠️ Logo not found in any location');
    } catch (error) {
      console.warn('⚠️ Error loading logo:', error);
    }
  }

  /**
   * Load receipt background image as base64
   */
  private loadReceiptBg(): void {
    try {
      const possiblePaths = [path.join(process.cwd(), 'public', 'receipt-bg.jpg')];

      for (const bgPath of possiblePaths) {
        if (fs.existsSync(bgPath)) {
          const bgData = fs.readFileSync(bgPath);
          this.receiptBgBase64 = `data:image/jpeg;base64,${bgData.toString('base64')}`;
          console.log(`✅ Receipt BG loaded from: ${bgPath}`);
          return;
        }
      }
      console.warn('⚠️ Receipt BG not found in any location');
    } catch (error) {
      console.warn('⚠️ Error loading receipt BG:', error);
    }
  }

  /**
   * Get the company logo as base64
   */
  public getLogoBase64(): string {
    return this.logoBase64;
  }

  /**
   * Register Handlebars partials (reusable template components)
   */
  private registerPartials(): void {
    const partialsDir = path.join(this.templatesDir, 'partials');

    if (fs.existsSync(partialsDir)) {
      const partialFiles = fs.readdirSync(partialsDir);

      for (const file of partialFiles) {
        if (file.endsWith('.hbs')) {
          const partialName = file.replace('.hbs', '');
          const partialContent = fs.readFileSync(path.join(partialsDir, file), 'utf-8');
          Handlebars.registerPartial(partialName, partialContent);
        }
      }
    }
  }

  /**
   * Load and compile template
   * Note: In development, templates are not cached to allow hot reloading
   */
  private getTemplate(templateType: PdfTemplateType): Handlebars.TemplateDelegate {
    const isDevelopment = process.env.NODE_ENV !== 'production';

    // In development, always reload templates and partials
    if (isDevelopment) {
      this.templateCache.clear();
      this.registerPartials(); // Reload partials
    }

    if (this.templateCache.has(templateType)) {
      return this.templateCache.get(templateType)!;
    }

    const templatePath = path.join(this.templatesDir, `${templateType}.hbs`);

    if (!fs.existsSync(templatePath)) {
      throw new Error(`Template not found: ${templateType}`);
    }

    const templateContent = fs.readFileSync(templatePath, 'utf-8');
    const compiled = Handlebars.compile(templateContent);
    this.templateCache.set(templateType, compiled);

    return compiled;
  }

  /**
   * Get font CSS for embedding Kanit font
   */
  private getFontCss(): string {
    const regularFontPath = path.join(this.fontsDir, 'Kanit-Regular.ttf');
    const boldFontPath = path.join(this.fontsDir, 'Kanit-Bold.ttf');

    let fontCss = '';

    // Check if local fonts exist, otherwise use Google Fonts
    if (fs.existsSync(regularFontPath) && fs.existsSync(boldFontPath)) {
      const regularBase64 = fs.readFileSync(regularFontPath).toString('base64');
      const boldBase64 = fs.readFileSync(boldFontPath).toString('base64');

      fontCss = `
        @font-face {
          font-family: 'Kanit';
          src: url(data:font/truetype;base64,${regularBase64}) format('truetype');
          font-weight: normal;
          font-style: normal;
        }
        @font-face {
          font-family: 'Kanit';
          src: url(data:font/truetype;base64,${boldBase64}) format('truetype');
          font-weight: bold;
          font-style: normal;
        }
      `;
    } else {
      // Use Google Fonts as fallback
      fontCss = `
        @import url('https://fonts.googleapis.com/css2?family=Kanit:wght@400;500;600;700&display=swap');
      `;
    }

    return fontCss;
  }

  /**
   * Generate base HTML structure with styles
   */
  private getBaseHtml(content: string, options: PdfOptions = {}): string {
    const fontCss = this.getFontCss();

    // Default to A4 if no custom dimensions provided
    let width = options.width;
    if (!width) {
      width = options.landscape ? '297mm' : '210mm';
    }

    // Padding (default 10mm)
    const padding = options.padding || '10mm';

    // For browser HTML printing: page size = physical paper, and a
    // higher-specificity !important override zeroes the template's own
    // .page print padding AND cancels its forced page-break, so the @page margin is the sole edge gap and a single-page card does not emit a trailing blank page.
    const htmlPageCss = options.htmlPage
      ? `
    @page { size: ${options.htmlPage.size}; margin: ${options.htmlPage.margin}; }
    @media print { html body .page { padding: 0 !important; page-break-after: auto !important; } }
    `
      : '';

    return `
<!DOCTYPE html>
<html lang="th">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    ${fontCss}
    
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    
    body {
      font-family: 'Kanit', sans-serif;
      font-size: 14px;
      line-height: 1.4;
      color: #000;
      background: #fff;
    }
    
    .page {
      width: ${width};
      /* min-height removed to prevent extra blank pages */
      padding: ${padding};
      margin: 0 auto;
      background: white;
    }
    
    /* Header styles */
    .header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 15px;
      padding-bottom: 10px;
    }
    
    .header-logo {
      flex-shrink: 0;
    }
    
    .header-logo img {
      max-width: 80px;
      max-height: 80px;
      height: auto;
    }
    
    .header-info {
      text-align: right;
      flex: 1;
      margin-left: 15px;
    }
    
    .company-name-wrapper {
      display: inline-block;
      text-align: left;
    }
    
    .company-name {
      font-size: 15px;
      font-weight: bold;
      margin-bottom: 2px;
    }
    
    .header-line {
      height: 2px;
      background: #FF0000;
      margin: 5px 0;
    }
    
    .header-address {
      font-size: 10px;
      line-height: 1.6;
    }
    
    /* Document title */
    .document-title {
      text-align: center;
      font-size: 20px;
      font-weight: bold;
      margin: 30px 0 20px;
    }
    
    /* Content sections */
    .section {
      margin-bottom: 15px;
    }
    
    .section-title {
      font-size: 14px;
      font-weight: bold;
      margin-bottom: 10px;
      padding-bottom: 5px;
      border-bottom: 1px solid #ccc;
    }
    
    /* Paragraph with indent */
    .indent {
      text-indent: 2em;
    }
    
    /* Table styles */
    table {
      width: 100%;
      border-collapse: collapse;
      margin: 10px 0;
    }
    
    th, td {
      border: 1px solid #888;
      padding: 8px;
      text-align: left;
      font-size: 13px;
    }
    
    th {
      background: #7f858a;
      color: white;
      font-weight: normal;
    }
    
    tr:nth-child(even) {
      background: #f5f5f5;
    }
    
    /* Signature section */
    .signatures {
      display: flex;
      justify-content: space-between;
      margin-top: 60px;
      padding-top: 20px;
    }
    
    .signature-box {
      text-align: center;
      width: 45%;
    }
    
    .signature-line {
      border-top: 1px dotted #000;
      margin: 30px auto 5px;
      width: 80%;
    }
    
    .signature-label {
      font-size: 13px;
    }
    
    /* Contact box */
    .contact-box {
      border: 1px solid #000;
      padding: 10px;
      display: inline-block;
      text-align: center;
      font-size: 13px;
      line-height: 1.5;
    }
    
    /* Right aligned text */
    .text-right {
      text-align: right;
    }
    
    .text-center {
      text-align: center;
    }
    
    /* Date display */
    .date-display {
      text-align: right;
      margin-bottom: 10px;
    }
    
    /* Form fields */
    .form-row {
      margin-bottom: 8px;
    }
    
    .form-label {
      font-weight: bold;
    }
    
    /* Two column layout */
    .two-columns {
      display: flex;
      gap: 20px;
    }
    
    .column {
      flex: 1;
    }
    
    /* Notes section */
    .notes {
      font-size: 12px;
      margin-top: 20px;
      padding: 10px;
      background: #f9f9f9;
      border-left: 3px solid #ccc;
    }
    
    .notes li {
      margin-bottom: 5px;
    }
    
    /* Staff signatures */
    .staff-signatures {
      text-align: right;
      margin-top: 30px;
      line-height: 1.8;
    }
    
    /* Print styles */
    @media print {
      .page {
        margin: 0;
        /* NOTE: when options.htmlPage is set, htmlPageCss below overrides this
           via a higher-specificity 'html body .page' padding:0 !important rule,
           so the injected page-rule margin is the sole edge gap — do NOT
           cargo-cult this 10mm into the htmlPage path. */
        padding: 10mm;
        page-break-after: always;
      }
    }
    ${htmlPageCss}
  </style>
</head>
<body>
  ${content}
</body>
</html>
`;
  }

  /**
   * Get Chromium executable path based on environment
   */
  private getChromiumPath(): string {
    if (process.env.CHROMIUM_PATH) {
      return process.env.CHROMIUM_PATH;
    }
    if (process.platform === 'darwin') {
      return '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
    }
    if (process.platform === 'win32') {
      // The portable Windows package ships no browser, and CHROMIUM_PATH is commented out
      // in .env.example — without this every PDF failed trying to spawn /usr/bin/chromium.
      // Edge is present on every Windows 10/11 install, so printing works untouched.
      const candidates = [
        'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
        'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
        'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
        'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
      ];
      const found = candidates.find((p) => fs.existsSync(p));
      if (found) return found;
      throw new Error('ไม่พบ Chrome หรือ Edge สำหรับสร้าง PDF — ตั้งค่า CHROMIUM_PATH ใน config\\.env');
    }
    return '/usr/bin/chromium';
  }

  /**
   * Get or launch singleton browser instance
   */
  private async getBrowser(): Promise<Browser> {
    if (this.browser?.connected) {
      return this.browser;
    }

    // Prevent concurrent launches
    if (this.browserLaunchPromise) {
      return this.browserLaunchPromise;
    }

    this.browserLaunchPromise = this.launchBrowser();
    try {
      this.browser = await this.browserLaunchPromise;
      // Clear the cached promise once the browser is attached. If we leave the
      // resolved promise set and the browser later disconnects, the disconnect
      // handler nulls `this.browser` but the next getBrowser call would return
      // the stale resolved promise pointing at a closed instance.
      this.browserLaunchPromise = null;
      // Reset state on disconnect so next call re-launches
      this.browser.on('disconnected', () => {
        this.browser = null;
        this.browserLaunchPromise = null;
      });
      return this.browser;
    } catch (error) {
      this.browserLaunchPromise = null; // Only clear on failure to allow retry
      throw error;
    }
  }

  /**
   * Launch Chromium with Docker-safe arguments
   */
  private async launchBrowser(): Promise<Browser> {
    return puppeteer.launch({
      executablePath: this.getChromiumPath(),
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--font-render-hinting=none',
      ],
    });
  }

  /**
   * Gracefully close browser instance
   */
  public async closeBrowser(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
      this.browserLaunchPromise = null;
    }
  }

  /**
   * Generate PDF from template and data using Puppeteer
   */
  public async generatePdf<T>(
    templateType: PdfTemplateType,
    data: T,
    options: PdfOptions = {}
  ): Promise<Buffer> {
    try {
      // Build the HTML (shared with the HTML print path)
      const html = await this.renderHtml(templateType, data, options);

      // Generate PDF with Puppeteer
      const browser = await this.getBrowser();
      const page = await browser.newPage();
      try {
        await page.setContent(html, { waitUntil: 'domcontentloaded', timeout: 30000 });

        const margins = options.margin || {
          top: '5mm',
          right: '5mm',
          bottom: '5mm',
          left: '5mm',
        };

        const pdfOptions: Parameters<typeof page.pdf>[0] = {
          printBackground: options.printBackground !== false,
          preferCSSPageSize: true,
          landscape: options.landscape || false,
          margin: {
            top: margins.top,
            bottom: margins.bottom,
            left: margins.left,
            right: margins.right,
          },
          ...(options.width && options.height
            ? { width: options.width, height: options.height }
            : {}),
          ...(options.scale ? { scale: options.scale } : {}),
        };

        const pdfBuffer = await page.pdf(pdfOptions);
        return Buffer.from(pdfBuffer);
      } finally {
        await page.close();
      }
    } catch (error) {
      console.error('❌ PDF Generation failed:', error);
      throw error;
    }
  }

  /**
   * Render template + data as standalone HTML string (no Puppeteer / no PDF).
   * Used by browser-side `window.print()` flow so the printer driver receives
   * the exact `@page` size from CSS — no per-machine setup needed.
   */
  public async renderHtml<T>(
    templateType: PdfTemplateType,
    data: T,
    options: PdfOptions = {}
  ): Promise<string> {
    const template = this.getTemplate(templateType);

    const dbSettings = await import('../settings/settings.service').then((m) =>
      m.settingsService.getSettings()
    );

    const providedHeader = (data as any).header || {};
    const dbHeader = dbSettings
      ? {
          companyName: dbSettings.companyNameTh || DEFAULT_COMPANY_HEADER.companyName,
          address1: dbSettings.addressTh || DEFAULT_COMPANY_HEADER.address1,
          address2: '',
          phone:
            `โทร. ${dbSettings.phone} ${dbSettings.fax ? `โทรสาร. ${dbSettings.fax}` : ''}`.trim(),
          logoBase64: dbSettings.logo || this.logoBase64 || DEFAULT_COMPANY_HEADER.logoBase64,
        }
      : DEFAULT_COMPANY_HEADER;

    const dataWithHeader = {
      ...data,
      header: {
        ...dbHeader,
        ...providedHeader,
        logoBase64: providedHeader.logoBase64 || dbHeader.logoBase64 || this.logoBase64,
      },
      receiptBgBase64: this.receiptBgBase64,
    };

    const content = template(dataWithHeader);
    return this.getBaseHtml(content, options);
  }

  /**
   * Generate Delivery Receipt PDF (ใบปล่อยรถ/ใบรับรถ)
   */
  public async generateDeliveryReceipt(data: DeliveryReceiptData): Promise<Buffer> {
    return this.generatePdf(PdfTemplateType.DELIVERY_RECEIPT, data);
  }

  /**
   * Generate Thank You Letter PDF (หนังสือขอบคุณ)
   */
  public async generateThankYouLetter(data: ThankYouLetterData): Promise<Buffer> {
    return this.generatePdf(PdfTemplateType.THANK_YOU_LETTER, data);
  }

  /**
   * Generate Sales Confirmation PDF (หนังสือยืนยันการซื้อ-ขาย)
   */
  public async generateSalesConfirmation(data: SalesConfirmationData): Promise<Buffer> {
    return this.generatePdf(PdfTemplateType.SALES_CONFIRMATION, data);
  }

  /**
   * Generate Sales Record PDF (ใบบันทึกการขาย)
   */
  public async generateSalesRecord(data: SalesRecordData): Promise<Buffer> {
    return this.generatePdf(PdfTemplateType.SALES_RECORD, data);
  }

  /**
   * Generate Sales Confirmation Form PDF (ใบยืนยันรายละเอียดการขาย)
   */
  public async generateSalesConfirmationForm(data: SalesConfirmationFormData): Promise<Buffer> {
    return this.generatePdf(PdfTemplateType.SALES_CONFIRMATION_FORM, data);
  }

  /**
   * Generate Contract PDF (สัญญาจองรถยนต์) - supports both legacy and new format
   */
  public async generateContract(data: ContractData | CarReservationContractData): Promise<Buffer> {
    return this.generatePdf(PdfTemplateType.CONTRACT, data, {
      width: '8.27in', // A4 Width
      height: '11.69in', // A4 Height
      margin: {
        top: '0mm',
        right: '0mm',
        bottom: '0mm',
        left: '0mm',
      },
    });
  }

  /**
   * Generate Deposit Receipt PDF (ใบรับเงินมัดจำ)
   */
  public async generateDepositReceipt(data: DepositReceiptData): Promise<Buffer> {
    return this.generatePdf(PdfTemplateType.DEPOSIT_RECEIPT, data);
  }

  /**
   * Generate Payment Receipt PDF (ใบเสร็จรับเงิน)
   */
  public async generatePaymentReceipt(data: PaymentReceiptData): Promise<Buffer> {
    return this.generatePdf(PdfTemplateType.PAYMENT_RECEIPT, data);
  }

  /**
   * Resolve the printed value for each vehicle-card field and pair it with its
   * saved position. The template only iterates `fields`; the editor's
   * `format=json` uses the same resolver so screen and paper never diverge.
   */
  public buildVehicleCardContext(data: VehicleCardData, layout: VehicleCardLayout) {
    const car = data.car ?? ({} as VehicleCardData['car']);
    const costs = data.costs ?? ({} as VehicleCardData['costs']);
    const values: Record<VehicleCardFieldKey, string> = {
      model: [car.model, car.variant].filter(Boolean).join(' '),
      engineNo: car.engineNo ?? '',
      chassisNo: car.chassisNo ?? '',
      color: car.color ?? '',
      stockNumber: data.stockNumber ?? '',
      orderDate: data.orderDate ?? '',
      beforeVatInt: costs.beforeVatInt ?? '',
      beforeVatDec: costs.beforeVatDec ?? '',
      vatAmountInt: costs.vatAmountInt ?? '',
      vatAmountDec: costs.vatAmountDec ?? '',
      totalWithVatInt: costs.totalWithVatInt ?? '',
      totalWithVatDec: costs.totalWithVatDec ?? '',
    };
    const fields = (Object.keys(values) as VehicleCardFieldKey[]).map((key) => ({
      key,
      ...layout.fields[key],
      value: values[key],
    }));
    return {
      header: data.header,
      layout,
      fontFamilyCss: VEHICLE_CARD_FONTS[layout.fontFamily],
      fields,
      values,
    };
  }

  private async loadVehicleCardLayout(): Promise<VehicleCardLayout> {
    // Printing must keep working even if the print_layouts migration has not
    // been applied on this tenant yet (P2021) — fall back to the defaults.
    try {
      const saved = await import('../settings/settings.service').then((m) =>
        m.settingsService.getPrintLayout('vehicle-card')
      );
      return mergeVehicleCardLayout(saved);
    } catch (error) {
      console.warn('⚠️ Vehicle card layout unavailable, using defaults:', error);
      return mergeVehicleCardLayout(null);
    }
  }

  /**
   * Generate Vehicle Card PDF (การ์ดรายละเอียดรถยนต์).
   * Paper 27 × 21 cm, zero margin — field positions are absolute from the paper corner.
   */
  public async generateVehicleCard(data: VehicleCardData): Promise<Buffer> {
    const ctx = this.buildVehicleCardContext(data, await this.loadVehicleCardLayout());
    return this.generatePdf(PdfTemplateType.VEHICLE_CARD, ctx, {
      width: '27cm',
      height: '21cm',
      padding: '0mm',
      margin: { top: '0mm', right: '0mm', bottom: '0mm', left: '0mm' },
    });
  }

  /**
   * Render Vehicle Card as HTML for browser printing.
   * @page must match real paper so the driver does not scale to Letter/A4.
   */
  public async renderVehicleCardHtml(data: VehicleCardData): Promise<string> {
    const ctx = this.buildVehicleCardContext(data, await this.loadVehicleCardLayout());
    return this.renderHtml(PdfTemplateType.VEHICLE_CARD, ctx, {
      width: '27cm',
      height: '21cm',
      padding: '0mm',
      htmlPage: { size: '27cm 21cm', margin: '0' },
    });
  }

  /**
   * Generate Temporary Receipt PDF (ใบรับเงินชั่วคราว) — 9.5×5.5 in pinfeed sheet
   */
  public async generateTemporaryReceipt(data: TemporaryReceiptData): Promise<Buffer> {
    return this.generatePdf(PdfTemplateType.TEMPORARY_RECEIPT, data, {
      width: '9.5in',
      height: '5.5in',
      margin: {
        top: '5mm',
        right: '5mm',
        bottom: '5mm',
        left: '5mm',
      },
    });
  }

  /**
   * Generate Temporary Receipt — DATA-ONLY OVERLAY for the pre-printed
   * dot-matrix form. Prints only the variable values positioned to land in the
   * form's boxes. Size MUST stay 9×5.5in (hardware-locked continuous form);
   * padding/margin 0 so overlay coordinates map directly to the paper origin.
   */
  public async generateTemporaryReceiptBg(data: TemporaryReceiptData): Promise<Buffer> {
    return this.generatePdf(PdfTemplateType.TEMPORARY_RECEIPT_BG, data, {
      width: '9in',
      height: '5.5in',
      padding: '0mm',
      margin: {
        top: '0mm',
        right: '0mm',
        bottom: '0mm',
        left: '0mm',
      },
    });
  }

  /**
   * Generate Daily Payment Report PDF
   */
  public async generateDailyPaymentReport(data: DailyPaymentReportData): Promise<Buffer> {
    return this.generatePdf(PdfTemplateType.DAILY_PAYMENT_REPORT, data, { landscape: true });
  }

  /**
   * Generate Stock Report PDF
   */
  public async generateStockReport(data: StockReportData): Promise<Buffer> {
    return this.generatePdf(PdfTemplateType.STOCK_REPORT, data, { landscape: true });
  }

  /**
   * Generate Profit & Loss Report PDF
   */
  public async generateProfitLossReport(data: ProfitLossReportData): Promise<Buffer> {
    return this.generatePdf(PdfTemplateType.PROFIT_LOSS_REPORT, data, { landscape: true });
  }

  /**
   * Generate Sales Summary Report PDF
   */
  public async generateSalesSummaryReport(data: SalesSummaryReportData): Promise<Buffer> {
    return this.generatePdf(PdfTemplateType.SALES_SUMMARY_REPORT, data, { landscape: true });
  }

  /**
   * Generate Stock Interest Report PDF
   */
  public async generateStockInterestReport(data: StockInterestReportData): Promise<Buffer> {
    return this.generatePdf(PdfTemplateType.STOCK_INTEREST_REPORT, data, { landscape: true });
  }

  /**
   * Generate Bank Interest Report PDF (รายงานคำนวณดอกเบี้ยธนาคาร ต่องวด) — A4 landscape
   */
  public async generateBankInterestReport(data: BankInterestReportData): Promise<Buffer> {
    return this.generatePdf(PdfTemplateType.BANK_INTEREST_REPORT, data, { landscape: true });
  }

  /**
   * Generate Purchase Requirement Report PDF
   */
  public async generatePurchaseRequirementReport(
    data: PurchaseRequirementReportData
  ): Promise<Buffer> {
    return this.generatePdf(PdfTemplateType.PURCHASE_REQUIREMENT_REPORT, data);
  }

  public async generateDailyStockSnapshotPdf(data: unknown): Promise<Buffer> {
    return this.generatePdf(PdfTemplateType.DAILY_STOCK_SNAPSHOT, data, {
      landscape: true,
    });
  }

  public async generateMonthlyPurchasesReportPdf(data: unknown): Promise<Buffer> {
    return this.generatePdf(PdfTemplateType.MONTHLY_PURCHASES_REPORT, data, {
      landscape: true,
    });
  }

  /**
   * Generate Monthly Campaign Claim Report PDF (brand submission form).
   * Paper: F14 landscape = 356mm × 216mm (CSS @page in template is the size source;
   * width/height keep Puppeteer aligned when preferCSSPageSize is ignored).
   */
  public async generateCampaignClaimReportPdf(data: CampaignClaimReportData): Promise<Buffer> {
    return this.generatePdf(PdfTemplateType.CAMPAIGN_CLAIM_MONTHLY, data, {
      width: '356mm',
      height: '216mm',
    });
  }

  /**
   * Generate Campaign Report PDF
   */
  public async generateCampaignReportPdf(data: unknown): Promise<Buffer> {
    return this.generatePdf(PdfTemplateType.CAMPAIGN_REPORT, data, {
      landscape: true,
    });
  }

  /**
   * Clear template cache
   */
  public clearCache(): void {
    this.templateCache.clear();
    this.registerPartials();
  }
}

// Export singleton instance
export const pdfService = PdfService.getInstance();

// Graceful shutdown — close Chromium browser on process exit
process.on('SIGTERM', async () => {
  await pdfService.closeBrowser();
});
process.on('SIGINT', async () => {
  await pdfService.closeBrowser();
});
