import { describe, it, expect, mock } from 'bun:test';
import type { VehicleCardData, CompanyHeader } from '../modules/pdf/types';
import { PdfTemplateType } from '../modules/pdf/types';

// Mock settings to avoid DB dependency (same pattern as pdf.test.ts)
let savedLayout: unknown = null;
mock.module('../modules/settings/settings.service', () => ({
  settingsService: {
    getSettings: () => Promise.resolve(null),
    getPrintLayout: () =>
      savedLayout instanceof Error ? Promise.reject(savedLayout) : Promise.resolve(savedLayout),
  },
}));

const { pdfService } = await import('../modules/pdf/pdf.service');
const { DEFAULT_VEHICLE_CARD_LAYOUT } = await import('@car-stock/shared/schemas');

const mockHeader: CompanyHeader = {
  logoBase64: '',
  companyName: 'Test Company',
  address1: '123 Test St',
  address2: 'Test City',
  phone: '000-000-0000',
};

const cardData: VehicleCardData = {
  header: mockHeader,
  stockNumber: 'STK-HTML-001',
  car: {
    brand: 'Toyota',
    model: 'Yaris Ativ',
    engineNo: 'ENG-HTML',
    chassisNo: 'CHS-HTML',
    color: 'แดง',
  },
  costs: {
    baseCost: '535000',
    beforeVat: '500,000.00',
    beforeVatInt: '500,000',
    beforeVatDec: '00',
    vatAmount: '35,000.00',
    vatAmountInt: '35,000',
    vatAmountDec: '00',
    totalWithVat: '535,000.00',
    totalWithVatInt: '535,000',
    totalWithVatDec: '00',
    transportCost: '0',
    accessoryCost: '0',
    otherCosts: '0',
    totalCost: '535000',
  },
} as VehicleCardData;

describe('Vehicle card HTML print', () => {
  it('renderVehicleCardHtml returns a full HTML doc sized to custom stock paper with card data', async () => {
    const html = await pdfService.renderVehicleCardHtml(cardData);
    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('@page');
    expect(html).toContain('27cm 21cm'); // custom cut stock 27×21
    expect(html).toContain('STK-HTML-001'); // data rendered
    expect(html).toContain('Yaris Ativ');
    expect(html).toContain('500,000');
  });

  it('normal card is values-only — no form title, headings, or row labels', async () => {
    const html = await pdfService.renderVehicleCardHtml(cardData);
    expect(html).toContain('Yaris Ativ');
    expect(html).toContain('ENG-HTML');
    expect(html).toContain('CHS-HTML');
    expect(html).toContain('500,000');
    expect(html).toContain('35,000');
    expect(html).toContain('535,000');
    expect(html).not.toContain('การ์ดรายละเอียดรถยนต์');
    expect(html).not.toContain('รายละเอียดต้นทุน');
    expect(html).not.toContain('ราคาขาย');
    expect(html).not.toContain('เงินสด');
    expect(html).not.toContain('ราคาก่อน VAT');
    expect(html).not.toContain('วันที่สั่งซื้อ');
  });

  it('neutralizes the template print padding so the @page margin is the sole gap', async () => {
    const html = await pdfService.renderVehicleCardHtml(cardData);
    expect(html).toContain('html body .page'); // higher-specificity override present
    expect(html).toContain('page-break-after: auto'); // forced page-break cancelled to prevent trailing blank page
  });

  it('does NOT emit @page on the default PDF path (htmlPage opt-in gate is off by default)', async () => {
    // Locks the "PDF path byte-for-byte unchanged" guarantee mechanically:
    // calling renderHtml without an htmlPage option must never inject the
    // @page rule (the only place that string is emitted by our code), while
    // still producing a real render with the card data present.
    const ctx = pdfService.buildVehicleCardContext(cardData, DEFAULT_VEHICLE_CARD_LAYOUT);
    const html = await pdfService.renderHtml(PdfTemplateType.VEHICLE_CARD, ctx);
    expect(html).not.toContain('@page'); // opt-in gate off → no page-size rule injected
    expect(html).toContain('STK-HTML-001'); // still a real render
  });

  it('places each field at its saved mm position and falls back to defaults for the rest', async () => {
    savedLayout = { offsetX: 1.5, fields: { stockNumber: { x: 200, y: 50 } } };
    try {
      const html = await pdfService.renderVehicleCardHtml(cardData);
      expect(html).toContain('translate(1.5mm, 0mm)'); // saved whole-sheet offset, default Y
      expect(html).toMatch(
        /top: 50mm; left: 200mm; width: 28mm; text-align: center; font-weight: bold;">STK-HTML-001</
      );
      const d = DEFAULT_VEHICLE_CARD_LAYOUT.fields.engineNo;
      expect(html).toContain(
        `top: ${d.y}mm; left: ${d.x}mm; width: ${d.w}mm; text-align: ${d.align};">ENG-HTML<`
      );
    } finally {
      savedLayout = null;
    }
  });

  it('keeps the valid parts of a saved layout when one entry is stale or invalid', async () => {
    savedLayout = {
      offsetX: 2,
      fontSize: 99, // out of range → default 8.5, but must not wipe the rest
      fields: { stockNumber: { x: 200, y: 50 }, removedKey: { x: 1, y: 1 } },
    };
    try {
      const html = await pdfService.renderVehicleCardHtml(cardData);
      expect(html).toContain('translate(2mm, 0mm)');
      expect(html).toContain(`font-size: ${DEFAULT_VEHICLE_CARD_LAYOUT.fontSize}px;`);
      expect(html).toMatch(/top: 50mm; left: 200mm;[^>]*>STK-HTML-001</);
    } finally {
      savedLayout = null;
    }
  });

  it('still prints with defaults when the print_layouts table is unavailable', async () => {
    savedLayout = new Error('P2021: table print_layouts does not exist');
    try {
      const html = await pdfService.renderVehicleCardHtml(cardData);
      expect(html).toContain('translate(0mm, 0mm)');
      expect(html).toContain('STK-HTML-001');
    } finally {
      savedLayout = null;
    }
  });

  it('applies the sheet font family and a per-field font size override', async () => {
    savedLayout = { fontFamily: 'Kanit', fontSize: 9, fields: { color: { fontSize: 12 } } };
    try {
      const html = await pdfService.renderVehicleCardHtml(cardData);
      expect(html).toContain('font-size: 9px; font-family: Kanit, Sarabun, sans-serif;');
      expect(html).toMatch(/text-align: center; font-size: 12px;">แดง</); // per-field override
      expect(html).toMatch(/text-align: center;">ENG-HTML</); // no override → inherits sheet size
    } finally {
      savedLayout = null;
    }
  });
});
