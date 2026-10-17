// apps/api/src/__tests__/campaign-claim-report.test.ts
import { describe, expect, test } from 'bun:test';
import {
  type ClaimSaleInput,
  buildCampaignClaimReport,
  computeCampaignSubsidies,
  computeLiveClaimTotal,
  claimCampaignFor,
} from '../modules/reports/campaign-claim.helpers';

const model = (id: string, modelName: string, variant: string | null, price: number) => ({
  id,
  brand: 'NETA',
  model: modelName,
  variant,
  price,
});

type Fm = {
  id: string;
  name: string;
  operator: 'PERCENT' | 'FIXED' | 'SUBTRACT' | 'ADD' | 'MULTIPLY' | 'PERCENT_SUBTRACT';
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
  baseCost: number | null; // null → no stock
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
    stock:
      args.baseCost == null
        ? null
        : {
            vin: `VIN-${args.id}`,
            engineNumber: `ENG-${args.id}`,
            soldDate: args.soldDate,
            baseCost: args.baseCost,
            vehicleModelId: args.vmId,
            vehicleModel: vm,
          },
    campaign: {
      id: 'camp1',
      name: 'Expense campaign',
      vehicleModels: [{ vehicleModelId: args.vmId, formulas: args.formulas }],
    },
  };
};

describe('buildCampaignClaimReport (expense columns)', () => {
  // V (price 500,000): เปิดบูธ 1% sell = 5,000 ; Marketing 5% sell = 25,000
  const saleV = saleWith({
    id: 's1',
    vmId: 'vm1',
    modelName: 'V',
    variant: 'LITE',
    price: 500_000,
    baseCost: 450_000,
    soldDate: new Date('2026-05-10T07:00:00Z'),
    formulas: [
      { id: 'a', name: 'เปิดบูธ', operator: 'PERCENT', value: 1, priceTarget: 'SELLING_PRICE', sortOrder: 1 },
      { id: 'b', name: 'Marketing', operator: 'PERCENT', value: 5, priceTarget: 'SELLING_PRICE', sortOrder: 2 },
    ],
  });
  // X (price 700,000): เปิดบูธ 0.5% sell = 3,500 ; ค่าขนส่ง FIXED 3,000
  const saleX = saleWith({
    id: 's2',
    vmId: 'vm2',
    modelName: 'X',
    variant: 'COMFORT',
    price: 700_000,
    baseCost: 650_000,
    soldDate: new Date('2026-05-15T07:00:00Z'),
    formulas: [
      { id: 'c', name: 'เปิดบูธ', operator: 'PERCENT', value: 0.5, priceTarget: 'SELLING_PRICE', sortOrder: 1 },
      { id: 'd', name: 'ค่าขนส่ง', operator: 'FIXED', value: 3000, priceTarget: 'SELLING_PRICE', sortOrder: 2 },
    ],
  });

  test('expenseColumns is the union of line names in first-appearance order', () => {
    const r = buildCampaignClaimReport([saleV, saleX]);
    expect(r.expenseColumns).toEqual(['เปิดบูธ', 'Marketing', 'ค่าขนส่ง']);
  });

  test('cells align to columns; missing line → null', () => {
    const r = buildCampaignClaimReport([saleV, saleX]);
    // rows sorted by soldDate ascending: V (05-10) then X (05-15)
    expect(r.rows[0].modelName).toBe('V LITE');
    expect(r.rows[0].cells).toEqual([5_000, 25_000, null]);
    expect(r.rows[0].total).toBe(30_000);
    expect(r.rows[1].modelName).toBe('X COMFORT');
    expect(r.rows[1].cells).toEqual([3_500, null, 3_000]);
    expect(r.rows[1].total).toBe(6_500);
  });

  test('columnTotals + grandTotal, with the Σcolumns == grandTotal invariant', () => {
    const r = buildCampaignClaimReport([saleV, saleX]);
    expect(r.summary.columnTotals).toEqual([8_500, 25_000, 3_000]);
    expect(r.summary.grandTotal).toBe(36_500);
    expect(r.summary.columnTotals.reduce((a, b) => a + b, 0)).toBe(r.summary.grandTotal);
    expect(r.summary.totalCars).toBe(2);
  });

  test('no stock: a cost-based % cell resolves to 0', () => {
    const noStock = saleWith({
      id: 's3',
      vmId: 'vm1',
      modelName: 'V',
      variant: 'LITE',
      price: 500_000,
      baseCost: null,
      soldDate: new Date('2026-05-20T07:00:00Z'),
      formulas: [
        { id: 'm', name: 'Marketing', operator: 'PERCENT', value: 1, priceTarget: 'COST_PRICE', sortOrder: 1 },
        { id: 's', name: 'เปิดบูธ', operator: 'PERCENT', value: 1, priceTarget: 'SELLING_PRICE', sortOrder: 2 },
      ],
    });
    const r = buildCampaignClaimReport([noStock]);
    expect(r.expenseColumns).toEqual(['Marketing', 'เปิดบูธ']);
    expect(r.rows[0].cells).toEqual([0, 5_000]); // cost % → 0 ; selling 1% of 500,000 = 5,000
    expect(r.rows[0].total).toBe(5_000);
  });

  test('empty input → empty columns/rows and zero totals', () => {
    const r = buildCampaignClaimReport([]);
    expect(r.expenseColumns).toEqual([]);
    expect(r.rows).toEqual([]);
    expect(r.summary).toEqual({ totalCars: 0, columnTotals: [], grandTotal: 0 });
  });

  test('computeLiveClaimTotal matches the claim-report row total', () => {
    expect(computeLiveClaimTotal(saleV)).toBe(30_000);
    expect(computeLiveClaimTotal(saleX)).toBe(6_500);
  });

  test('computeLiveClaimTotal is 0 with no campaign / no matching model', () => {
    expect(computeLiveClaimTotal({ ...saleV, campaign: null })).toBe(0);
    expect(
      computeLiveClaimTotal({
        ...saleV,
        campaign: {
          id: 'camp1',
          name: 'Expense campaign',
          vehicleModels: [{ vehicleModelId: 'other-model', formulas: [] }],
        },
      })
    ).toBe(0);
  });

  test('claimCampaignFor falls back to catalog by model + sale date', () => {
    const untagged = { ...saleV, campaign: null };
    const catalog = [
      {
        name: 'CHERY V23 DEMO',
        status: 'ACTIVE',
        startDate: new Date('2026-07-23'),
        endDate: new Date('2026-09-19'),
        vehicleModels: saleV.campaign!.vehicleModels,
      },
    ];
    const picked = claimCampaignFor(
      {
        campaign: null,
        vehicleModel: untagged.vehicleModel,
        stock: untagged.stock,
        saleDate: new Date('2026-08-13'),
      },
      catalog
    );
    expect(picked?.name).toBe('CHERY V23 DEMO');
    expect(computeLiveClaimTotal({ ...untagged, campaign: picked })).toBe(30_000);
  });

  test('claimCampaignFor keeps the tagged campaign; catalog without the model adds nothing', () => {
    const catalog = [
      {
        name: 'OTHER',
        status: 'ACTIVE',
        startDate: new Date('2026-01-01'),
        endDate: new Date('2026-12-31'),
        vehicleModels: saleX.campaign!.vehicleModels,
      },
    ];
    const picked = claimCampaignFor(
      {
        campaign: saleV.campaign,
        vehicleModel: saleV.vehicleModel,
        stock: saleV.stock,
        saleDate: new Date('2026-08-13'),
      },
      catalog
    );
    expect(computeLiveClaimTotal({ ...saleV, campaign: picked })).toBe(30_000);
  });

  test('claimCampaignFor is null when date or model does not match', () => {
    const catalog = [
      {
        name: 'CHERY V23 DEMO',
        status: 'ACTIVE',
        startDate: new Date('2026-07-23'),
        endDate: new Date('2026-09-19'),
        vehicleModels: saleV.campaign!.vehicleModels,
      },
    ];
    expect(
      claimCampaignFor(
        {
          campaign: null,
          vehicleModel: saleV.vehicleModel,
          stock: saleV.stock,
          saleDate: new Date('2026-01-01'),
        },
        catalog
      )
    ).toBeNull();
  });

  test('claimCampaignFor sums every overlapping ACTIVE campaign plus the tag', () => {
    // price 500,000 / cost 450,000 → tag FIXED 1,000 + MARKETING 1% cost 4,500
    // + AFTER SALES 0.25% sell 1,250 = 6,750. DRAFT and the tag's own catalog
    // entry must not add anything.
    const line = (name: string, operator: Fm['operator'], value: number, priceTarget: Fm['priceTarget']) => ({
      vehicleModelId: 'vm1',
      formulas: [{ id: name, name, operator, value, priceTarget, sortOrder: 1 }],
    });
    const tag = { id: 'tag', name: 'TAG', vehicleModels: [line('ส่วนลด', 'FIXED', 1000, 'SELLING_PRICE')] };
    const camp = (id: string, status: string, vm: ReturnType<typeof line>) => ({
      id,
      name: id,
      status,
      startDate: new Date('2026-10-01'),
      endDate: new Date('2026-10-31'),
      vehicleModels: [vm],
    });
    const catalog = [
      { ...camp('tag', 'ACTIVE', tag.vehicleModels[0]), name: 'TAG' },
      camp('MARKETING', 'ACTIVE', line('Marketing', 'PERCENT', 1, 'COST_PRICE')),
      camp('AFTER SALES', 'ACTIVE', line('After Sales', 'PERCENT', 0.25, 'SELLING_PRICE')),
      camp('WHOLESALE', 'DRAFT', line('Wholesale', 'FIXED', 99_999, 'SELLING_PRICE')),
    ];
    const merged = claimCampaignFor(
      { campaign: tag, vehicleModel: saleV.vehicleModel, stock: saleV.stock, saleDate: new Date('2026-10-15') },
      catalog
    );
    expect(merged?.name).toBe('TAG, MARKETING, AFTER SALES');
    expect(computeLiveClaimTotal({ ...saleV, campaign: merged })).toBe(6_750);

    const report = buildCampaignClaimReport([
      { ...saleV, campaign: { id: merged!.id!, name: merged!.name!, vehicleModels: merged!.vehicleModels } },
    ]);
    expect(report.expenseColumns).toEqual(['ส่วนลด', 'Marketing', 'After Sales']);
    expect(report.rows[0].cells).toEqual([1000, 4500, 1250]);
    expect(report.summary.grandTotal).toBe(6_750);
  });

  test('live total follows current formulas, not a frozen snapshot', () => {
    const edited = saleWith({
      id: 's1',
      vmId: 'vm1',
      modelName: 'V',
      variant: 'LITE',
      price: 500_000,
      baseCost: 450_000,
      soldDate: new Date('2026-05-10T07:00:00Z'),
      formulas: [
        {
          id: 'b',
          name: 'Marketing',
          operator: 'PERCENT',
          value: 10,
          priceTarget: 'SELLING_PRICE',
          sortOrder: 1,
        },
      ],
    });
    // Old snapshot on the sale would still be 30,000; live claim is 10% of 500,000.
    expect(computeLiveClaimTotal(edited)).toBe(50_000);
  });
});

// Brand-standard subsidy rates (from customer's ตัวอย่างหนังสือและรายงาน.xls sheet แคมเปญ):
// STOCK LEVEL 0.5% MSRP, After Sales 0.25%×2 MSRP, MARKETING 1% DNP, เป้าขาย tier% DNP.
const STD_RATES = {
  stockLevel: 0.005,
  afterSalesNoComplaint: 0.0025,
  afterSalesQr: 0.0025,
  marketing: 0.01,
  retailTargetTier: 0.01, // chosen tier (0.005 / 0.01 / 0.015)
} as const;

describe('computeCampaignSubsidies', () => {
  // Ground truth: CHERY V23 2WD PLUS — sale price 759,900 (incl VAT), cost (DNP) 714,306.
  // MSRP = 759900 × 100/107 = 710,186.92. Values taken from the customer's own cells.
  test('computes each subsidy bucket from MSRP (ex-VAT) and DNP', () => {
    const s = computeCampaignSubsidies(759900, 714306, STD_RATES);
    expect(s.stockLevel).toBe(3550.93); // 710186.92 × 0.5%
    expect(s.afterSalesNoComplaint).toBe(1775.47); // 710186.92 × 0.25%
    expect(s.afterSalesQr).toBe(1775.47);
    expect(s.marketing).toBe(7143.06); // 714306 × 1%
    expect(s.retailTarget).toBe(7143.06); // 714306 × 1% (tier)
    expect(s.total).toBe(21387.99); // SUM, rounded — matches cell 21387.989158878507
  });
});
