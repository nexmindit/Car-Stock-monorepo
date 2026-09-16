import { afterAll, describe, expect, it, mock } from 'bun:test';
import { PdfTemplateType } from '../modules/pdf/types';
import type {
  CompanyHeader,
  DailyPaymentReportData,
  DeliveryReceiptData,
  DepositReceiptData,
  StockReportData,
  TemporaryReceiptData,
  VehicleCardData,
} from '../modules/pdf/types';

/**
 * PDF Service Integration Tests
 *
 * Tests the Puppeteer-based PDF generation pipeline:
 * Handlebars template → HTML → Puppeteer page.pdf() → Buffer
 *
 * These tests launch a real Chromium instance to verify end-to-end PDF generation.
 * Each test validates:
 * - Output is a valid PDF (magic bytes: %PDF-)
 * - Output has reasonable size (> 1KB)
 */

// Mock the settings service to avoid DB dependency
mock.module('../modules/settings/settings.service', () => ({
  settingsService: {
    getSettings: () => Promise.resolve(null),
    getPrintLayout: () => Promise.resolve(null),
  },
}));

// Import after mocking
const { pdfService } = await import('../modules/pdf/pdf.service');

// Shared test data
const mockHeader: CompanyHeader = {
  logoBase64: '',
  companyName: 'Test Company',
  address1: '123 Test St',
  address2: 'Test City',
  phone: '000-000-0000',
};

function expectValidPdf(buffer: Buffer) {
  expect(buffer).toBeInstanceOf(Buffer);
  expect(buffer.length).toBeGreaterThan(1000);
  // PDF magic bytes
  const header = buffer.subarray(0, 5).toString('ascii');
  expect(header).toBe('%PDF-');
}

afterAll(async () => {
  await pdfService.closeBrowser();
});

describe('PdfService — Puppeteer engine', () => {
  describe('generatePdf basics', () => {
    it('should generate a simple delivery receipt PDF', async () => {
      const data: DeliveryReceiptData = {
        header: mockHeader,
        documentNumber: 'DR-2026-0001',
        date: '2026-03-19',
        customer: {
          name: 'ทดสอบ ระบบ',
          address: '123 ถนนทดสอบ',
          street: '',
          subdistrict: 'ในเมือง',
          district: 'เมือง',
          province: 'นครราชสีมา',
          postalCode: '30000',
          phone: '081-234-5678',
        },
        car: {
          brand: 'Toyota',
          model: 'Yaris',
          engineNo: 'ENG-001',
          chassisNo: 'CHS-001',
          color: 'ขาว',
        },
        deliveryDate: '2026-03-20',
        accessories: [],
        notes: '',
      };

      const buffer = await pdfService.generateDeliveryReceipt(data);
      expectValidPdf(buffer);
    }, 30000);

    it('should generate a deposit receipt PDF', async () => {
      const data: DepositReceiptData = {
        header: mockHeader,
        receiptNumber: 'DP-2026-0001',
        date: '2026-03-19',
        customer: {
          name: 'ลูกค้าทดสอบ',
          address: '456 ถนนทดสอบ',
          street: '',
          subdistrict: 'ในเมือง',
          district: 'เมือง',
          province: 'นครราชสีมา',
          postalCode: '30000',
          phone: '081-999-8888',
        },
        car: {
          brand: 'Honda',
          model: 'City',
          engineNo: 'ENG-002',
          chassisNo: 'CHS-002',
          color: 'ดำ',
        },
        depositAmount: '10,000.00',
        depositAmountText: 'หนึ่งหมื่นบาทถ้วน',
        paymentMethod: 'เงินสด',
      };

      const buffer = await pdfService.generateDepositReceipt(data);
      expectValidPdf(buffer);
    }, 30000);
  });

  describe('custom page sizes', () => {
    it('should generate vehicle card with custom dimensions (27 x 21 cm)', async () => {
      const data: VehicleCardData = {
        header: mockHeader,
        stockNumber: 'STK-001',
        car: {
          brand: 'Toyota',
          model: 'Yaris Ativ',
          engineNo: 'ENG-003',
          chassisNo: 'CHS-003',
          color: 'แดง',
        },
        year: '2026',
        price: '599,000',
        mileage: '15,000 km',
        registrationDate: '2026-01-15',
        images: [],
      };

      const buffer = await pdfService.generateVehicleCard(data);
      expectValidPdf(buffer);
    }, 30000);

    it('should generate temporary receipt with small page size (9 x 5.5 in)', async () => {
      const data: TemporaryReceiptData = {
        header: mockHeader,
        receiptNumber: 'TR-2026-0001',
        date: '2026-03-19',
        customerName: 'ทดสอบ ระบบ',
        amount: '50,000.00',
        amountText: 'ห้าหมื่นบาทถ้วน',
        description: 'ค่ามัดจำรถ',
        paymentMethod: 'เงินสด',
        receiverName: 'พนักงาน ทดสอบ',
      };

      const buffer = await pdfService.generateTemporaryReceipt(data);
      expectValidPdf(buffer);
    }, 30000);
  });

  describe('landscape mode', () => {
    it('should generate stock report in landscape', async () => {
      const data: StockReportData = {
        header: mockHeader,
        generatedDate: '2026-03-19',
        generatedBy: 'Admin',
        items: [
          {
            no: 1,
            stockNumber: 'STK-001',
            brand: 'Toyota',
            model: 'Yaris',
            year: '2026',
            color: 'ขาว',
            engineNo: 'ENG-001',
            chassisNo: 'CHS-001',
            cost: '500,000',
            sellingPrice: '599,000',
            status: 'พร้อมขาย',
            daysInStock: 15,
          },
        ],
        summary: {
          totalStock: 1,
          totalCost: '500,000',
          totalSellingPrice: '599,000',
        },
      };

      const buffer = await pdfService.generateStockReport(data);
      expectValidPdf(buffer);
    }, 30000);
  });

  describe('report templates', () => {
    it('should generate daily payment report PDF', async () => {
      const data: DailyPaymentReportData = {
        header: mockHeader,
        reportDate: '2026-03-19',
        generatedBy: 'Admin',
        items: [
          {
            no: 1,
            receiptNumber: 'RC-001',
            customerName: 'ลูกค้า ทดสอบ',
            customerCode: 'C001',
            description: 'ค่างวดรถ',
            paymentType: 'งวด',
            paymentMethod: 'เงินสด',
            amount: 15000,
            saleNumber: 'SL-001',
            issuedBy: 'พนักงาน A',
            note: '',
          },
        ],
        summary: {
          totalAmount: 15000,
          totalCount: 1,
        },
      };

      const buffer = await pdfService.generateDailyPaymentReport(data);
      expectValidPdf(buffer);
    }, 30000);
  });

  describe('browser management', () => {
    it('should reuse browser across multiple PDF generations', async () => {
      const data: DepositReceiptData = {
        header: mockHeader,
        receiptNumber: 'DP-2026-0002',
        date: '2026-03-19',
        customer: {
          name: 'ลูกค้า 2',
          address: '789 ถนนทดสอบ',
          street: '',
          subdistrict: 'ในเมือง',
          district: 'เมือง',
          province: 'นครราชสีมา',
          postalCode: '30000',
          phone: '081-111-2222',
        },
        car: {
          brand: 'Mazda',
          model: '2',
          engineNo: 'ENG-004',
          chassisNo: 'CHS-004',
          color: 'น้ำเงิน',
        },
        depositAmount: '20,000.00',
        depositAmountText: 'สองหมื่นบาทถ้วน',
        paymentMethod: 'โอน',
      };

      // Generate two PDFs — second should be faster (browser reuse)
      const start1 = performance.now();
      const buffer1 = await pdfService.generateDepositReceipt(data);
      const time1 = performance.now() - start1;

      const start2 = performance.now();
      data.receiptNumber = 'DP-2026-0003';
      const buffer2 = await pdfService.generateDepositReceipt(data);
      const time2 = performance.now() - start2;

      expectValidPdf(buffer1);
      expectValidPdf(buffer2);

      // Both should complete in reasonable time (browser is reused, not relaunched)
      console.log(`  1st PDF: ${time1.toFixed(0)}ms | 2nd PDF: ${time2.toFixed(0)}ms`);
      expect(time1).toBeLessThan(15000);
      expect(time2).toBeLessThan(15000);
    }, 60000);

    it('should handle closeBrowser gracefully when already closed', async () => {
      await pdfService.closeBrowser();
      // Should not throw
      await pdfService.closeBrowser();
    });
  });

  describe('renderHtml — temporary receipt HTML print path', () => {
    // Same fixture shape as the existing generateTemporaryReceipt test above.
    const data: TemporaryReceiptData = {
      header: mockHeader,
      receiptNumber: 'TR-2026-0002',
      date: '2026-07-03',
      customerName: 'ทดสอบ ระบบ',
      amount: '10,000.00',
      amountText: 'หนึ่งหมื่นบาทถ้วน',
      description: 'ค่ามัดจำรถ',
      paymentMethod: 'เงินสด',
      receiverName: 'พนักงาน ทดสอบ',
    };
    // Overlay stays 9×5.5 in; with-form continuous is 9.5×5.5 in.
    const overlayOptions = {
      width: '9in',
      height: '5.5in',
      padding: '0mm',
      margin: { top: '0mm', right: '0mm', bottom: '0mm', left: '0mm' },
    };
    const formOptions = {
      width: '9.5in',
      height: '5.5in',
      padding: '0mm',
      margin: { top: '0mm', right: '0mm', bottom: '0mm', left: '0mm' },
    };

    it('full-form template renders the CSS-drawn form (receipt-container)', async () => {
      const html = await pdfService.renderHtml(
        PdfTemplateType.TEMPORARY_RECEIPT,
        data,
        formOptions
      );
      expect(html).toContain('receipt-container'); // form's root — form template only
      expect(html).not.toContain('f-receipt-no'); // overlay-only positioned cell
      expect(html).toMatch(/size:\s*9\.5in\s+5\.5in/);
      expect(html).not.toMatch(/size:\s*A4 landscape/);
    });

    it('full-form A4 variant uses A4 landscape, not the tractor-feed page', async () => {
      const html = await pdfService.renderHtml(
        PdfTemplateType.TEMPORARY_RECEIPT,
        { ...data, paperA4: true },
        { width: '297mm', height: '210mm', padding: '0mm' }
      );
      expect(html).toContain('receipt-container');
      expect(html).toMatch(/size:\s*A4 landscape/);
      expect(html).toMatch(/width:\s*100%/);
      expect(html).not.toMatch(/size:\s*9\.5in/);
    });

    it('full-form keeps เลขที่สัญญา when the address is long (does not crush right columns)', async () => {
      const html = await pdfService.renderHtml(
        PdfTemplateType.TEMPORARY_RECEIPT,
        {
          header: mockHeader,
          customerCode: 'CUST-2026-0347',
          receiptNumber: 'RCPT-2608-0017',
          date: '2026-08-16',
          contractNumber: 'SL-2026-0077',
          customer: {
            name: 'ลูกค้าทดสอบ ที่อยู่ยาว',
            phone: '081-2345678',
            address:
              '99/188 หมู่บ้านภัสสรเพลสวิลเลจ 3 เฟส 2 ซอยประชาอุทิศ 79 แยก 12 แยกย่อย 4 ถนนประชาอุทิศ ใกล้ตลาดสดทุ่งครุ ตรงข้ามโรงเรียนวัดทุ่งครุ',
            subdistrict: 'แขวงทุ่งครุ',
            district: 'เขตทุ่งครุ',
            province: 'กรุงเทพมหานคร',
            postalCode: '10140',
          },
          items: [{ description: 'เงินจอง - CHERY V23 2WD PLUS', amount: '2000' }],
          paymentAmount: '2000',
          lateFee: '0',
          discount: '0',
          totalAmount: '2000',
        },
        formOptions
      );
      expect(html).toContain('เลขที่สัญญา');
      expect(html).toContain('SL-2026-0077');
      expect(html).toContain('table-layout: fixed');
      expect(html).toContain('address-cell');
    });

    it('overlay template renders data-only cells (f-receipt-no), no form container', async () => {
      const html = await pdfService.renderHtml(
        PdfTemplateType.TEMPORARY_RECEIPT_BG,
        data,
        overlayOptions
      );
      expect(html).toContain('f-receipt-no');
      expect(html).not.toContain('receipt-container');
    });

    // Regression: the dot-matrix form is a hardware-locked 9x5.5in continuous
    // sheet — a second page ruins the form and misfeeds every receipt after it.
    // The full form used to paginate for customers with long addresses because
    // it had no fixed box, unlike the overlay's .ovl. Worst case the controller
    // can emit is 2 items + a 5-line address.
    it('full-form receipt stays on ONE 9x5.5in page with worst-case data', async () => {
      const worstCase: TemporaryReceiptData = {
        header: mockHeader,
        customerCode: 'CUST-2026-0275',
        receiptNumber: 'TR-2026-0003',
        date: '2026-07-03',
        contractNumber: 'SL-2026-0142',
        customer: {
          name: 'นางสาว ศรีนภาวรรณ ช่างกีรติวัฒนากุล',
          phone: '089-9455610',
          // 5 wrapped lines — the length that reproduced the 2-page bug
          address:
            '99/188 หมู่บ้านภัสสรเพลสวิลเลจ 3 เฟส 2 ซอยประชาอุทิศ 79 แยก 12 แยกย่อย 4 ถนนประชาอุทิศ ใกล้ตลาดสดทุ่งครุ ตรงข้ามโรงเรียนวัดทุ่งครุ',
          subdistrict: 'แขวงทุ่งครุ',
          district: 'เขตทุ่งครุ',
          province: 'กรุงเทพมหานคร',
          postalCode: '10140',
        },
        items: [
          { description: 'ค่างวดรถยนต์ - CHERY TIGGO 8 PRO MAX HYBRID สีขาวมุก ทะเบียน 1กก-1234', amount: '25699' },
          { description: 'ชำระค่างวดประจำเดือนมิถุนายน 2569 พร้อมค่าติดตามทวงถามและค่าธรรมเนียมการโอน', amount: '' },
        ],
        paymentAmount: '25699',
        lateFee: '500',
        discount: '0',
        totalAmount: '26199',
        totalAmountText: 'สองหมื่นหกพันหนึ่งร้อยเก้าสิบเก้าบาทถ้วน',
        paymentMethod: { isCash: true },
      };

      const buffer = await pdfService.generateTemporaryReceipt(worstCase);
      expectValidPdf(buffer);

      const raw = buffer.toString('latin1');
      expect(raw.match(/\/Type\s*\/Page[^s]/g)?.length).toBe(1);
      // MediaBox must be the physical pinfeed sheet: 9.5x5.5in = 684x396 pt
      const box = raw.match(/\/MediaBox\s*\[\s*0\s+0\s+([\d.]+)\s+([\d.]+)\s*\]/);
      expect(Number(box?.[1])).toBeCloseTo(684, 0);
      expect(Number(box?.[2])).toBeCloseTo(396, 0);
    }, 30000);
  });
});
