import { describe, expect, test } from 'bun:test';
import type { SalesSummaryItem } from '@car-stock/shared/types';
import { SALES_SUMMARY_COLUMNS, buildSalesSummaryExportRow } from './salesSummaryColumns';

// The canonical header order. Core columns mirror the PDF (sales-summary-report.hbs);
// the last three are Excel-only extras kept per the spec. Editing the descriptor
// without updating this list (or vice-versa) fails here — the PDF-drift guard.
const EXPECTED_HEADERS = [
  'ลำดับ',
  'ชื่อลูกค้า',
  'แบบรถ',
  'เลขเครื่อง',
  'เลขคัซซี',
  'ราคารถ',
  'ส่วนลดตัวรถ',
  'เงินดาวน์',
  'ส่วนลดดาวน์',
  'คงเหลือ',
  'ยอดจัด',
  'ค่าคอมไฟแนนซ์',
  'รวมรับเงิน',
  'วันที่ขาย',
  'ทะเบียน/พรบ/ขนส่ง',
  'ต้นทุน',
  'แคมเปญขาย',
  'กำไรขั้นต้น',
  'คอมฯพนักงาน',
  'ค่าใช้จ่ายขาย',
  'ดอกเบี้ยธนาคาร',
  'ค่าเบี้ยประกัน',
  'กำไรสุทธิ',
  'หมายเหตุ',
  'รับจาก',
  'สถานะ',
  'Sale',
];

const fullSale = {
  id: 's1',
  saleNumber: 'SL-2026-0001',
  saleDate: '2026-06-15T12:00:00.000Z', // noon UTC → June 15 in any realistic timezone
  customerName: 'สมชาย ใจดี',
  customerType: 'INDIVIDUAL',
  vehicleInfo: 'Toyota Vios',
  vehicleModelName: 'Toyota Vios 1.5 G',
  vin: '',
  chassisNumber: 'CHAS-123',
  engineNumber: 'ENG-123',
  saleType: 'DIRECT',
  paymentMode: 'FINANCE',
  totalAmount: 700000,
  paidAmount: 100000,
  remainingAmount: 600000,
  status: 'COMPLETED',
  statusLabel: 'สำเร็จ',
  salesperson: 'พนักงาน เอ',
  receivedFrom: 'คลังกลาง',
  priceNet: 0,
  priceVat: 0,
  priceGross: 0,
  discountAmount: 20000,
  campaignSubsidy: 15000,
  netCarDiscount: 5000,
  downPayment: 120000,
  downPaymentDiscount: 0,
  financeAmount: 580000,
  financeReturn: 8000,
  interestCost: 12000,
  transportFee: 4500,
  totalCost: 620000,
  campaignName: 'แคมเปญ มิ.ย.',
  stockNotes: 'ลูกค้าขอสีดำ\nรอใบกำกับ',
  salesCommission: 7000,
  salesExpense: 3000,
  insurancePremium: 18000,
  netProfit: 93000,
} as SalesSummaryItem;

describe('SALES_SUMMARY_COLUMNS', () => {
  test('column order matches the canonical header list (PDF-drift guard)', () => {
    expect(SALES_SUMMARY_COLUMNS.map((c) => c.key)).toEqual(EXPECTED_HEADERS);
  });

  test('builds a row with every expected header', () => {
    const row = buildSalesSummaryExportRow(fullSale, 0);
    expect(Object.keys(row)).toEqual(EXPECTED_HEADERS);
  });

  test('expense/profit fields land in the right columns as raw numbers', () => {
    const row = buildSalesSummaryExportRow(fullSale, 0);
    expect(row['ลำดับ']).toBe(1);
    expect(row['ค่าคอมไฟแนนซ์']).toBe(8000);
    expect(row['ทะเบียน/พรบ/ขนส่ง']).toBe(4500);
    expect(row['คอมฯพนักงาน']).toBe(7000);
    expect(row['ค่าใช้จ่ายขาย']).toBe(3000);
    expect(row['ค่าเบี้ยประกัน']).toBe(18000);
    expect(row['แคมเปญขาย']).toBe(15000);
    expect(row['กำไรสุทธิ']).toBe(93000);
    expect(row['หมายเหตุ']).toBe('ลูกค้าขอสีดำ\nรอใบกำกับ');
  });

  test('กำไรขั้นต้น is computed as ราคารถ − ต้นทุน', () => {
    const row = buildSalesSummaryExportRow(fullSale, 0);
    expect(row['กำไรขั้นต้น']).toBe(80000); // 700000 − 620000
  });

  test('วันที่ขาย matches the PDF numeric Buddhist-year format, with - for missing', () => {
    const row = buildSalesSummaryExportRow(fullSale, 0);
    // DD/MM/BBBB (2026 + 543) — mirrors the server PDF's formatThaiDate(date, 'numeric')
    expect(row['วันที่ขาย']).toBe('15/06/2569');
    const noDate = buildSalesSummaryExportRow({ ...fullSale, saleDate: '' } as SalesSummaryItem, 0);
    expect(noDate['วันที่ขาย']).toBe('-');
  });

  test('missing financial fields default to 0 (null-safety)', () => {
    const sparse = {
      ...fullSale,
      salesCommission: undefined,
      salesExpense: undefined,
      insurancePremium: undefined,
      transportFee: undefined,
      totalCost: undefined,
      financeReturn: undefined,
      campaignSubsidy: undefined,
      netProfit: undefined,
      stockNotes: undefined,
    } as SalesSummaryItem;
    const row = buildSalesSummaryExportRow(sparse, 4);
    expect(row['ลำดับ']).toBe(5);
    expect(row['คอมฯพนักงาน']).toBe(0);
    expect(row['ค่าใช้จ่ายขาย']).toBe(0);
    expect(row['ค่าเบี้ยประกัน']).toBe(0);
    expect(row['กำไรสุทธิ']).toBe(0);
    expect(row['แคมเปญขาย']).toBe(0);
    expect(row['หมายเหตุ']).toBe('-');
    expect(row['กำไรขั้นต้น']).toBe(700000); // totalCost undefined → 700000 − 0
  });
});
