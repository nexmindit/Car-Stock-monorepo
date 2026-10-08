// apps/api/src/__tests__/campaign-claim-pdf.test.ts
import { describe, expect, test } from 'bun:test';
import {
  projectCampaignClaimForPdf,
  resolvePdfClaimExpenseKey,
} from '../modules/reports/campaign-claim-pdf';
import {
  type ClaimSaleInput,
  buildCampaignClaimReport,
} from '../modules/reports/campaign-claim.helpers';

const model = (id: string, modelName: string, variant: string | null, price: number) => ({
  id,
  brand: 'VBeyond',
  model: modelName,
  variant,
  price,
});

type Fm = {
  id: string;
  name: string;
  operator: 'PERCENT' | 'FIXED';
  value: number;
  priceTarget: 'SELLING_PRICE' | 'COST_PRICE';
  sortOrder: number;
};

const saleWith = (args: {
  id: string;
  vmId: string;
  modelName: string;
  variant: string | null;
  price: number;
  baseCost: number;
  soldDate: Date;
  formulas: Fm[];
}): ClaimSaleInput => {
  const vm = model(args.vmId, args.modelName, args.variant, args.price);
  return {
    id: args.id,
    saleNumber: args.id,
    customer: { name: `cust-${args.id}` },
    financeProvider: 'KTB',
    carDiscount: 0,
    discountSnapshot: 0,
    completedDate: args.soldDate,
    vehicleModelId: args.vmId,
    vehicleModel: vm,
    stock: {
      vin: `VIN-${args.id}`,
      engineNumber: `ENG-${args.id}`,
      soldDate: args.soldDate,
      baseCost: args.baseCost,
      vehicleModelId: args.vmId,
      vehicleModel: vm,
    },
    campaign: {
      id: 'camp1',
      name: 'Claim campaign',
      vehicleModels: [{ vehicleModelId: args.vmId, formulas: args.formulas }],
    },
  };
};

describe('resolvePdfClaimExpenseKey', () => {
  test('maps canonical and legacy names', () => {
    expect(resolvePdfClaimExpenseKey('Marketing 1%')).toBe('Marketing 1%');
    expect(resolvePdfClaimExpenseKey('MARKETING')).toBe('Marketing 1%');
    expect(resolvePdfClaimExpenseKey('STOCK 0.5%')).toBe('STOCK 0.5%');
    expect(resolvePdfClaimExpenseKey('STOCK LEVEL')).toBe('STOCK 0.5%');
    expect(resolvePdfClaimExpenseKey('STOCK LEVEL 0.5%')).toBe('STOCK 0.5%');
    expect(resolvePdfClaimExpenseKey('เปิดบูธ')).toBe('เปิดบูธ');
    expect(resolvePdfClaimExpenseKey('ค่าขนส่ง')).toBe('ค่าขนส่ง');
    expect(resolvePdfClaimExpenseKey('ทดสอบ')).toBe('ทดสอบ');
  });

  test('rejects typo and unmapped names', () => {
    expect(resolvePdfClaimExpenseKey('Marketing 1%เ')).toBeNull();
    expect(resolvePdfClaimExpenseKey('After Sales — Google QR')).toBeNull();
    expect(resolvePdfClaimExpenseKey('เป้าขาย (Retail)')).toBeNull();
    expect(resolvePdfClaimExpenseKey('Marketing')).toBeNull();
  });
});

describe('projectCampaignClaimForPdf', () => {
  test('no sales → no expense headers', () => {
    const report = buildCampaignClaimReport([]);
    const pdf = projectCampaignClaimForPdf(report);
    expect(pdf.expenseColumns).toEqual([]);
    expect(pdf.rows).toEqual([]);
    expect(pdf.summary.columnTotals).toEqual([]);
    expect(pdf.summary.grandTotal).toBe(0);
    expect(pdf.summary.totalCars).toBe(0);
  });

  test('headers follow the campaign formula names', () => {
    // price 500_000: เปิดบูธ FIXED 3000; ค่าขนส่ง FIXED 2000 only
    const sale = saleWith({
      id: 's1',
      vmId: 'vm1',
      modelName: 'V',
      variant: 'LITE',
      price: 500_000,
      baseCost: 450_000,
      soldDate: new Date('2026-08-01T07:00:00Z'),
      formulas: [
        {
          id: 'a',
          name: 'เปิดบูธ',
          operator: 'FIXED',
          value: 3000,
          priceTarget: 'SELLING_PRICE',
          sortOrder: 1,
        },
        {
          id: 'b',
          name: 'ค่าขนส่ง',
          operator: 'FIXED',
          value: 2000,
          priceTarget: 'SELLING_PRICE',
          sortOrder: 2,
        },
      ],
    });
    const report = buildCampaignClaimReport([sale]);
    const pdf = projectCampaignClaimForPdf(report);

    expect(pdf.expenseColumns).toEqual(['เปิดบูธ', 'ค่าขนส่ง']);
    expect(pdf.rows[0].cells).toEqual([3000, 2000]);
    expect(pdf.rows[0].total).toBe(5000);
    expect(pdf.summary.columnTotals).toEqual([3000, 2000]);
    expect(pdf.summary.grandTotal).toBe(5000);
  });

  test('legacy MARKETING / STOCK LEVEL aliases map to PDF headers', () => {
    // cost 400_000 → MARKETING 1% cost = 4000
    // sell 500_000 → STOCK LEVEL 0.5% sell = 2500
    const sale = saleWith({
      id: 's2',
      vmId: 'vm2',
      modelName: 'X',
      variant: null,
      price: 500_000,
      baseCost: 400_000,
      soldDate: new Date('2026-08-02T07:00:00Z'),
      formulas: [
        {
          id: 'm',
          name: 'MARKETING',
          operator: 'PERCENT',
          value: 1,
          priceTarget: 'COST_PRICE',
          sortOrder: 1,
        },
        {
          id: 's',
          name: 'STOCK LEVEL',
          operator: 'PERCENT',
          value: 0.5,
          priceTarget: 'SELLING_PRICE',
          sortOrder: 2,
        },
      ],
    });
    const report = buildCampaignClaimReport([sale]);
    const pdf = projectCampaignClaimForPdf(report);

    expect(pdf.expenseColumns).toEqual(['Marketing 1%', 'STOCK 0.5%']);
    expect(pdf.rows[0].cells).toEqual([4000, 2500]);
    expect(pdf.rows[0].total).toBe(6500);
  });

  test('STOCK LEVEL 0.5% alias maps to STOCK 0.5%', () => {
    const sale = saleWith({
      id: 's3',
      vmId: 'vm3',
      modelName: 'Y',
      variant: null,
      price: 1_000_000,
      baseCost: 900_000,
      soldDate: new Date('2026-08-03T07:00:00Z'),
      formulas: [
        {
          id: 's',
          name: 'STOCK LEVEL 0.5%',
          operator: 'PERCENT',
          value: 0.5,
          priceTarget: 'SELLING_PRICE',
          sortOrder: 1,
        },
      ],
    });
    const report = buildCampaignClaimReport([sale]);
    const pdf = projectCampaignClaimForPdf(report);
    expect(pdf.expenseColumns).toEqual(['STOCK 0.5%']);
    expect(pdf.rows[0].cells[0]).toBe(5000);
  });

  test('two source columns mapping to one header are summed', () => {
    // Both MARKETING and Marketing 1% → same PDF column
    const sale = saleWith({
      id: 's4',
      vmId: 'vm4',
      modelName: 'Z',
      variant: null,
      price: 100_000,
      baseCost: 100_000,
      soldDate: new Date('2026-08-04T07:00:00Z'),
      formulas: [
        {
          id: 'a',
          name: 'MARKETING',
          operator: 'FIXED',
          value: 100,
          priceTarget: 'SELLING_PRICE',
          sortOrder: 1,
        },
        {
          id: 'b',
          name: 'Marketing 1%',
          operator: 'FIXED',
          value: 50,
          priceTarget: 'SELLING_PRICE',
          sortOrder: 2,
        },
      ],
    });
    const report = buildCampaignClaimReport([sale]);
    const pdf = projectCampaignClaimForPdf(report);
    expect(pdf.rows[0].cells[0]).toBe(150);
    expect(pdf.rows[0].total).toBe(150);
  });

  // Regression: UAT campaign named its lines "Marketing" / "After Sales" and the
  // old fixed-5-header projection dropped them → empty cells, total 0.00.
  test('non-alias formula names get their own column and count in totals', () => {
    const sale = saleWith({
      id: 's5',
      vmId: 'vm5',
      modelName: 'W',
      variant: null,
      price: 500_000,
      baseCost: 450_000,
      soldDate: new Date('2026-08-05T07:00:00Z'),
      formulas: [
        {
          id: 'a',
          name: 'เปิดบูธ',
          operator: 'FIXED',
          value: 3000,
          priceTarget: 'SELLING_PRICE',
          sortOrder: 1,
        },
        {
          id: 'b',
          name: 'After Sales — Google QR',
          operator: 'FIXED',
          value: 9999,
          priceTarget: 'SELLING_PRICE',
          sortOrder: 2,
        },
        {
          id: 'c',
          name: 'เป้าขาย (Retail)',
          operator: 'FIXED',
          value: 8888,
          priceTarget: 'SELLING_PRICE',
          sortOrder: 3,
        },
      ],
    });
    const report = buildCampaignClaimReport([sale]);
    // Full report still includes After Sales in grand total
    expect(report.rows[0].total).toBe(3000 + 9999 + 8888);

    const pdf = projectCampaignClaimForPdf(report);
    expect(pdf.expenseColumns).toEqual(['เปิดบูธ', 'After Sales — Google QR', 'เป้าขาย (Retail)']);
    expect(pdf.rows[0].cells).toEqual([3000, 9999, 8888]);
    expect(pdf.rows[0].total).toBe(report.rows[0].total);
    expect(pdf.summary.grandTotal).toBe(3000 + 9999 + 8888);
  });

  test('canonical seed display names fill Marketing 1% and STOCK 0.5% without aliases', () => {
    const sale = saleWith({
      id: 's6',
      vmId: 'vm6',
      modelName: 'Std',
      variant: null,
      price: 500_000,
      baseCost: 400_000,
      soldDate: new Date('2026-08-06T07:00:00Z'),
      formulas: [
        {
          id: 'm',
          name: 'Marketing 1%',
          operator: 'PERCENT',
          value: 1,
          priceTarget: 'COST_PRICE',
          sortOrder: 1,
        },
        {
          id: 'o',
          name: 'เปิดบูธ',
          operator: 'FIXED',
          value: 3000,
          priceTarget: 'SELLING_PRICE',
          sortOrder: 2,
        },
        {
          id: 't',
          name: 'ค่าขนส่ง',
          operator: 'FIXED',
          value: 2000,
          priceTarget: 'SELLING_PRICE',
          sortOrder: 3,
        },
        {
          id: 'x',
          name: 'ทดสอบ',
          operator: 'FIXED',
          value: 1000,
          priceTarget: 'SELLING_PRICE',
          sortOrder: 4,
        },
        {
          id: 's',
          name: 'STOCK 0.5%',
          operator: 'PERCENT',
          value: 0.5,
          priceTarget: 'SELLING_PRICE',
          sortOrder: 5,
        },
      ],
    });
    const report = buildCampaignClaimReport([sale]);
    const pdf = projectCampaignClaimForPdf(report);
    // Marketing 1% of cost 400_000 = 4000; STOCK 0.5% of sell 500_000 = 2500
    expect(pdf.rows[0].cells).toEqual([4000, 3000, 2000, 1000, 2500]);
    expect(pdf.rows[0].total).toBe(12_500);
    expect(pdf.summary.grandTotal).toBe(12_500);
  });
});
