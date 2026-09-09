import {
  PAYMENT_METHOD_LABELS,
  PAYMENT_MODE_LABELS,
  PAYMENT_TYPE_LABELS,
  SALE_STATUS_LABELS,
  STOCK_STATUS_LABELS,
} from '@car-stock/shared/constants';
// Import binds the name for local use; re-export keeps tests/consumers working.
// Re-export-only does NOT bind splitVat in this module (ReferenceError on stock report).
import { splitVat } from '@car-stock/shared/formulas';
import type { PaymentStatus, SaleStatus, StockStatus, VehicleType } from '@prisma/client';
import type { Decimal } from '@prisma/client/runtime/library';
import { db } from '../../lib/db';
import { resolveReportStockNotes } from '../sales/sale-notes';
import { type BankInterestStockInput, buildBankInterestRows } from './bank-interest.helpers';
import {
  buildCampaignClaimReport,
  computeLiveClaimTotal,
  pickClaimCampaign,
} from './campaign-claim.helpers';
import { buildSalespersonBreakdown, computeSaleMoney } from './sales-summary.helpers';
import { parseDay } from '../interest/interest.dates';
import {
  resolveStockInterestDisplay,
  resolveStockInterestWindow,
} from '../interest/stock-interest-display';

export { splitVat };

// Helper functions
const toNumber = (val: Decimal | number | null | undefined): number => {
  if (val === null || val === undefined) return 0;
  if (typeof val === 'number') return val;
  return Number(val);
};

const formatDateKey = (date: Date): string => {
  return date.toISOString().split('T')[0];
};

const getMonthKey = (date: Date): string => {
  const months = [
    'ม.ค.',
    'ก.พ.',
    'มี.ค.',
    'เม.ย.',
    'พ.ค.',
    'มิ.ย.',
    'ก.ค.',
    'ส.ค.',
    'ก.ย.',
    'ต.ค.',
    'พ.ย.',
    'ธ.ค.',
  ];
  return `${months[date.getMonth()]} ${date.getFullYear() + 543}`;
};

const calculateDays = (startDate: Date | null | undefined, endDate: Date | null | undefined): number => {
  if (!startDate || !endDate) return 0;
  const diffTime = Math.abs(endDate.getTime() - startDate.getTime());
  return Math.floor(diffTime / (1000 * 60 * 60 * 24));
};

const calculateInterest = (principal: number, annualRate: number, days: number): number => {
  const dailyRate = annualRate / 100 / 365;
  return principal * dailyRate * days;
};

// ============================================
// Daily Payment Report Service
// ============================================

interface DailyPaymentParams {
  startDate?: Date;
  endDate?: Date;
}

export async function getDailyPaymentReport(params: DailyPaymentParams) {
  const { startDate, endDate } = params;

  const where: Record<string, unknown> = {
    status: 'ACTIVE' as PaymentStatus,
  };

  if (startDate && endDate) {
    where.paymentDate = {
      gte: startDate,
      lte: endDate,
    };
  }

  const payments = await db.payment.findMany({
    where,
    include: {
      customer: {
        select: { id: true, name: true, code: true },
      },
      sale: {
        select: { id: true, saleNumber: true },
      },
    },
    orderBy: { paymentDate: 'desc' },
  });

  // Transform data
  const paymentItems = payments.map((p) => ({
    id: p.id,
    receiptNumber: p.receiptNumber,
    paymentDate: (p.paymentDate ?? p.createdAt).toISOString(),
    customerName: p.customer?.name ?? '-',
    customerCode: p.customer?.code ?? '-',
    description: p.description || '',
    paymentType: p.paymentType,
    paymentTypeLabel:
      PAYMENT_TYPE_LABELS[p.paymentType as keyof typeof PAYMENT_TYPE_LABELS] || p.paymentType,
    paymentMethod: p.paymentMethod,
    paymentMethodLabel:
      PAYMENT_METHOD_LABELS[p.paymentMethod as keyof typeof PAYMENT_METHOD_LABELS] ||
      p.paymentMethod,
    amount: toNumber(p.amount),
    saleNumber: p.sale?.saleNumber,
    issuedBy: p.issuedBy,
    notes: p.notes,
  }));

  // Calculate summary
  const totalAmount = paymentItems.reduce((sum, p) => sum + p.amount, 0);
  const totalCount = paymentItems.length;

  // Group by method
  const methodGroups: Record<string, { count: number; amount: number }> = {};
  paymentItems.forEach((p) => {
    if (!methodGroups[p.paymentMethod]) {
      methodGroups[p.paymentMethod] = { count: 0, amount: 0 };
    }
    methodGroups[p.paymentMethod].count += 1;
    methodGroups[p.paymentMethod].amount += p.amount;
  });

  const byMethod = Object.entries(methodGroups).map(([method, data]) => ({
    method,
    label: PAYMENT_METHOD_LABELS[method as keyof typeof PAYMENT_METHOD_LABELS] || method,
    count: data.count,
    amount: data.amount,
  }));

  // Group by type
  const typeGroups: Record<string, { count: number; amount: number }> = {};
  paymentItems.forEach((p) => {
    if (!typeGroups[p.paymentType]) {
      typeGroups[p.paymentType] = { count: 0, amount: 0 };
    }
    typeGroups[p.paymentType].count += 1;
    typeGroups[p.paymentType].amount += p.amount;
  });

  const byType = Object.entries(typeGroups).map(([type, data]) => ({
    type,
    label: PAYMENT_TYPE_LABELS[type as keyof typeof PAYMENT_TYPE_LABELS] || type,
    count: data.count,
    amount: data.amount,
  }));

  // Chart data - daily totals
  const dailyTotals: Record<string, { amount: number; count: number }> = {};
  paymentItems.forEach((p) => {
    const dateKey = p.paymentDate.split('T')[0];
    if (!dailyTotals[dateKey]) {
      dailyTotals[dateKey] = { amount: 0, count: 0 };
    }
    dailyTotals[dateKey].amount += p.amount;
    dailyTotals[dateKey].count += 1;
  });

  const chartData = Object.entries(dailyTotals)
    .map(([date, data]) => ({
      date,
      amount: data.amount,
      count: data.count,
    }))
    .sort((a, b) => a.date.localeCompare(b.date));

  return {
    payments: paymentItems,
    summary: {
      totalAmount,
      totalCount,
      byMethod,
      byType,
    },
    chartData,
  };
}

// ============================================
// Stock Report Service
// ============================================

interface StockReportParams {
  startDate?: Date;
  endDate?: Date;
  vehicleType?: VehicleType;
}

/** Inventory still on the lot: ready to sell + demo. Sales-lifecycle statuses stay off this report. */
const STOCK_REPORT_STATUSES = ['AVAILABLE', 'DEMO'] as StockStatus[];

export async function getStockReport(params: StockReportParams) {
  const { vehicleType } = params;

  const where: Record<string, unknown> = {
    deletedAt: null,
    status: { in: STOCK_REPORT_STATUSES },
  };
  if (vehicleType) {
    where.vehicleModel = { type: vehicleType };
  }

  const stocks = await db.stock.findMany({
    where,
    include: {
      vehicleModel: {
        select: {
          brand: true,
          model: true,
          variant: true,
          year: true,
        },
      },
      interestPeriods: {
        select: {
          startDate: true,
          endDate: true,
          annualRate: true,
          principalAmount: true,
          calculatedInterest: true,
        },
      },
    },
    orderBy: { orderDate: 'desc' },
  });

  const today = new Date();

  const stockItems = stocks.map((s) => {
    const daysInStock = s.arrivalDate
      ? calculateDays(s.arrivalDate, s.soldDate || today)
      : 0;
    const baseCost = toNumber(s.baseCost);
    const transportCost = toNumber(s.transportCost);
    const accessoryCost = toNumber(s.accessoryCost);
    const otherCosts = toNumber(s.otherCosts);
    const costWithoutInterest = baseCost + transportCost + accessoryCost + otherCosts;

    let accumulatedInterest = 0;
    const activeEndDate = s.soldDate || today;
    const interestStartDate = s.orderDate ?? s.arrivalDate;
    const hasStopDate = s.stopInterestCalc && s.interestStoppedAt;
    const endDate = hasStopDate
      ? new Date(Math.min(activeEndDate.getTime(), s.interestStoppedAt!.getTime()))
      : activeEndDate;
    const canAccrueActiveInterest = s.debtStatus !== 'PAID_OFF' && !s.stopInterestCalc;

    if (s.interestPeriods.length > 0) {
      s.interestPeriods.forEach((period) => {
        if (period.endDate) {
          accumulatedInterest += toNumber(period.calculatedInterest);
          return;
        }

        if (!canAccrueActiveInterest) {
          return;
        }

        const days = calculateDays(period.startDate, activeEndDate);
        accumulatedInterest += calculateInterest(
          toNumber(period.principalAmount),
          toNumber(period.annualRate),
          days
        );
      });
    } else {
      const canAccrueInterest = s.debtStatus !== 'PAID_OFF' || hasStopDate;

      // No start date → cannot accrue (same invariant as stock.service)
      if (canAccrueInterest && interestStartDate) {
        const rate = toNumber(s.interestRate) * 100;
        const principal =
          s.interestPrincipalBase === 'BASE_COST_ONLY' ? baseCost : costWithoutInterest;
        const days = calculateDays(interestStartDate, endDate);
        accumulatedInterest = calculateInterest(principal, rate, days);
      }
    }

    const totalCost = costWithoutInterest + accumulatedInterest;

    return {
      id: s.id,
      vin: s.vin,
      engineNumber: s.engineNumber || '-',
      brand: s.vehicleModel.brand,
      model: s.vehicleModel.model,
      variant: s.vehicleModel.variant,
      year: s.vehicleModel.year,
      vehicleModelName: `${s.vehicleModel.brand} ${s.vehicleModel.model} ${s.vehicleModel.variant || ''}`,
      exteriorColor: s.exteriorColor,
      interiorColor: s.interiorColor,
      status: s.status,
      statusLabel: STOCK_STATUS_LABELS[s.status as keyof typeof STOCK_STATUS_LABELS] || s.status,
      arrivalDate: s.arrivalDate?.toISOString() ?? '',
      orderDate: s.orderDate?.toISOString(),
      daysInStock,
      parkingSlot: s.parkingSlot || '-',
      receivedFrom: s.receivedFrom || '-',
      priceNet: splitVat(baseCost).net,
      priceVat: splitVat(baseCost).vat,
      priceGross: baseCost,

      // Costs
      baseCost,
      transportCost,
      accessoryCost,
      otherCosts,
      accumulatedInterest: Math.round(accumulatedInterest * 100) / 100,
      totalCost: Math.round(totalCost * 100) / 100,
    };
  });

  // Summary
  const totalCount = stockItems.length;
  const availableCount = stockItems.filter((s) => s.status === 'AVAILABLE').length;
  const demoCount = stockItems.filter((s) => s.status === 'DEMO').length;
  const totalValue = stockItems.reduce((sum, s) => sum + s.totalCost, 0);

  // By status — only statuses this report includes
  const byStatus = [
    {
      status: 'AVAILABLE',
      label: 'พร้อมขาย',
      count: availableCount,
      percentage: totalCount > 0 ? (availableCount / totalCount) * 100 : 0,
    },
    {
      status: 'DEMO',
      label: 'รถ Demo',
      count: demoCount,
      percentage: totalCount > 0 ? (demoCount / totalCount) * 100 : 0,
    },
  ];

  // By brand
  const brandGroups: Record<string, number> = {};
  stockItems.forEach((s) => {
    brandGroups[s.brand] = (brandGroups[s.brand] || 0) + 1;
  });

  const byBrand = Object.entries(brandGroups)
    .map(([brand, count]) => ({
      brand,
      count,
      percentage: totalCount > 0 ? (count / totalCount) * 100 : 0,
    }))
    .sort((a, b) => b.count - a.count);

  // Chart data
  const chartData = {
    byStatus: byStatus.map((s) => ({ status: s.status, label: s.label, count: s.count })),
    byBrand: byBrand.slice(0, 10), // Top 10 brands
    byMonth: [], // TODO: Implement monthly trend
  };

  return {
    stocks: stockItems,
    summary: {
      totalCount,
      availableCount,
      demoCount,
      reservedCount: 0,
      preparingCount: 0,
      soldCount: 0,
      totalValue,
      byStatus,
      byBrand,
    },
    chartData,
  };
}

// ============================================
// Profit & Loss Report Service
// ============================================

interface ProfitLossParams {
  startDate?: Date;
  endDate?: Date;
}

export async function getProfitLossReport(params: ProfitLossParams) {
  const { startDate, endDate } = params;

  const where: Record<string, unknown> = {
    status: { in: ['DELIVERED', 'COMPLETED'] as SaleStatus[] },
  };

  if (startDate && endDate) {
    where.completedDate = {
      gte: startDate,
      lte: endDate,
    };
  }

  const sales = await db.sale.findMany({
    where,
    include: {
      customer: { select: { name: true } },
      stock: {
        include: {
          vehicleModel: { select: { brand: true, model: true, variant: true, year: true } },
          interestPeriods: true,
        },
      },
      vehicleModel: { select: { brand: true, model: true, variant: true, year: true } },
      createdBy: { select: { firstName: true, lastName: true } },
    },
    orderBy: { completedDate: 'desc' },
  });

  const today = new Date();

  const saleItems = sales.map((sale) => {
    const stock = sale.stock;
    const vehicleModel = stock?.vehicleModel || sale.vehicleModel;

    const sellingPrice = toNumber(sale.totalAmount);
    const baseCost = toNumber(stock?.baseCost) || 0;
    const transportCost = toNumber(stock?.transportCost) || 0;
    const accessoryCost = toNumber(stock?.accessoryCost) || 0;
    const otherCosts = toNumber(stock?.otherCosts) || 0;
    const totalCost = baseCost + transportCost + accessoryCost + otherCosts;

    // Calculate accumulated interest
    let accumulatedInterest = 0;
    if (stock) {
      const canAccrueActiveInterest = stock.debtStatus !== 'PAID_OFF' && !stock.stopInterestCalc;
      const activeEndDate = stock.soldDate || today;

      stock.interestPeriods.forEach((period) => {
        if (period.endDate) {
          accumulatedInterest += toNumber(period.calculatedInterest);
          return;
        }

        if (!canAccrueActiveInterest) {
          return;
        }

        const days = calculateDays(period.startDate, activeEndDate);
        accumulatedInterest += calculateInterest(
          toNumber(period.principalAmount),
          toNumber(period.annualRate),
          days
        );
      });

      // If no periods, use default rate, but respect debtStatus and stopInterestCalc
      if (stock.interestPeriods.length === 0 && canAccrueActiveInterest) {
        const interestStartDate = stock.orderDate || stock.arrivalDate;
        const days = calculateDays(interestStartDate, activeEndDate);
        const rate = toNumber(stock.interestRate) * 100;
        const principal = stock.interestPrincipalBase === 'BASE_COST_ONLY' ? baseCost : totalCost;
        accumulatedInterest = calculateInterest(principal, rate, days);
      }
    }

    const totalCostWithInterest = totalCost + accumulatedInterest;
    const grossProfit = sellingPrice - totalCost;
    const netProfit = sellingPrice - totalCostWithInterest;
    const profitMargin = sellingPrice > 0 ? (netProfit / sellingPrice) * 100 : 0;

    return {
      id: sale.id,
      saleNumber: sale.saleNumber,
      saleDate: sale.createdAt.toISOString(),
      completedDate: sale.completedDate?.toISOString() || sale.createdAt.toISOString(),
      customerName: sale.customer.name,
      vehicleInfo: vehicleModel
        ? `${vehicleModel.brand} ${vehicleModel.model} ${vehicleModel.variant || ''} ${vehicleModel.year}`
        : 'N/A',
      vin: stock?.vin || 'N/A',
      sellingPrice,
      baseCost,
      transportCost,
      accessoryCost,
      otherCosts,
      totalCost,
      interestCost: Math.round(accumulatedInterest * 100) / 100,
      accumulatedInterest: Math.round(accumulatedInterest * 100) / 100,
      totalCostWithInterest: Math.round(totalCostWithInterest * 100) / 100,
      grossProfit,
      netProfit: Math.round(netProfit * 100) / 100,
      profitMargin: Math.round(profitMargin * 100) / 100,
      salesperson: sale.createdBy ? `${sale.createdBy.firstName} ${sale.createdBy.lastName}` : '-',
    };
  });

  // Summary
  const totalRevenue = saleItems.reduce((sum, s) => sum + s.sellingPrice, 0);
  const totalCost = saleItems.reduce((sum, s) => sum + s.totalCost, 0);
  const totalInterest = saleItems.reduce((sum, s) => sum + s.accumulatedInterest, 0);
  const totalCostWithInterest = saleItems.reduce((sum, s) => sum + s.totalCostWithInterest, 0);
  const grossProfit = saleItems.reduce((sum, s) => sum + s.grossProfit, 0);
  const netProfit = saleItems.reduce((sum, s) => sum + s.netProfit, 0);
  const avgProfitMargin =
    saleItems.length > 0
      ? saleItems.reduce((sum, s) => sum + s.profitMargin, 0) / saleItems.length
      : 0;
  const saleCount = saleItems.length;
  const profitableSales = saleItems.filter((s) => s.netProfit > 0).length;
  const lossSales = saleItems.filter((s) => s.netProfit < 0).length;

  // Chart data - monthly
  const monthlyGroups: Record<string, { revenue: number; cost: number; profit: number }> = {};
  saleItems.forEach((s) => {
    const date = new Date(s.completedDate);
    const monthKey = getMonthKey(date);
    if (!monthlyGroups[monthKey]) {
      monthlyGroups[monthKey] = { revenue: 0, cost: 0, profit: 0 };
    }
    monthlyGroups[monthKey].revenue += s.sellingPrice;
    monthlyGroups[monthKey].cost += s.totalCostWithInterest;
    monthlyGroups[monthKey].profit += s.netProfit;
  });

  const monthly = Object.entries(monthlyGroups).map(([month, data]) => ({
    month,
    revenue: data.revenue,
    cost: data.cost,
    profit: data.profit,
  }));

  // By salesperson
  const salespersonGroups: Record<string, { profit: number; count: number }> = {};
  saleItems.forEach((s) => {
    if (!salespersonGroups[s.salesperson]) {
      salespersonGroups[s.salesperson] = { profit: 0, count: 0 };
    }
    salespersonGroups[s.salesperson].profit += s.netProfit;
    salespersonGroups[s.salesperson].count += 1;
  });

  const bySalesperson = Object.entries(salespersonGroups)
    .map(([name, data]) => ({
      name,
      profit: Math.round(data.profit * 100) / 100,
      count: data.count,
    }))
    .sort((a, b) => b.profit - a.profit);

  // Calculate average profit per vehicle
  const averageProfitPerVehicle = saleCount > 0 ? netProfit / saleCount : 0;
  const profitMargin = totalRevenue > 0 ? (netProfit / totalRevenue) * 100 : 0;

  return {
    items: saleItems,
    sales: saleItems,
    summary: {
      totalRevenue,
      totalCost,
      totalInterest: Math.round(totalInterest * 100) / 100,
      totalInterestCost: Math.round(totalInterest * 100) / 100,
      totalCostWithInterest: Math.round(totalCostWithInterest * 100) / 100,
      grossProfit,
      netProfit: Math.round(netProfit * 100) / 100,
      avgProfitMargin: Math.round(avgProfitMargin * 100) / 100,
      profitMargin: Math.round(profitMargin * 100) / 100,
      averageProfitPerVehicle: Math.round(averageProfitPerVehicle * 100) / 100,
      totalSales: saleCount,
      saleCount,
      profitableSales,
      lossSales,
    },
    chartData: {
      monthlyProfit: monthly.map((m) => ({
        month: m.month,
        revenue: m.revenue,
        cost: m.cost,
        netProfit: m.profit,
      })),
      monthly,
      bySalesperson,
    },
  };
}

// ============================================
// Sales Summary Report Service
// ============================================

interface SalesSummaryParams {
  startDate?: Date;
  endDate?: Date;
  status?: SaleStatus;
  salespersonId?: string;
  vehicleType?: VehicleType;
}

export async function getSalesSummaryReport(params: SalesSummaryParams) {
  const { startDate, endDate, status, salespersonId, vehicleType } = params;

  const where: Record<string, unknown> = {};

  if (startDate && endDate) {
    where.createdAt = {
      gte: startDate,
      lte: endDate,
    };
  }

  if (status) {
    where.status = status;
  }

  if (salespersonId) {
    where.createdById = salespersonId;
  }

  if (vehicleType) {
    // Match either the stock's model or the direct sale.vehicleModel (fleet sales).
    where.OR = [
      { stock: { vehicleModel: { type: vehicleType } } },
      { vehicleModel: { type: vehicleType } },
    ];
  }

  const campaignCatalog = await db.campaign.findMany({
    where: {
      ...(startDate && endDate
        ? { startDate: { lte: endDate }, endDate: { gte: startDate } }
        : {}),
    },
    select: {
      id: true,
      name: true,
      status: true,
      startDate: true,
      endDate: true,
      vehicleModels: {
        select: {
          vehicleModelId: true,
          formulas: { orderBy: { sortOrder: 'asc' as const } },
        },
      },
    },
  });

  const sales = await db.sale.findMany({
    where,
    include: {
      customer: { select: { name: true, type: true } },
      campaign: {
        select: {
          name: true,
          vehicleModels: {
            select: {
              vehicleModelId: true,
              formulas: { orderBy: { sortOrder: 'asc' as const } },
            },
          },
        },
      },
      stock: {
        include: {
          vehicleModel: {
            select: { id: true, brand: true, model: true, variant: true, year: true, price: true },
          },
          interestPeriods: {
            select: {
              startDate: true,
              endDate: true,
              annualRate: true,
              principalAmount: true,
              calculatedInterest: true,
            },
          },
        },
      },
      vehicleModel: {
        select: { id: true, brand: true, model: true, variant: true, year: true, price: true },
      },
      createdBy: { select: { id: true, firstName: true, lastName: true } },
    },
    orderBy: { createdAt: 'desc' },
  });

  const today = new Date();

  const saleItems = sales.map((sale) => {
    const vehicleModel = sale.stock?.vehicleModel || sale.vehicleModel;
    const stock = sale.stock;

    const sellingPrice = toNumber(sale.totalAmount);
    // Cost calculation
    const baseCost = toNumber(stock?.baseCost) || 0;
    const transportCost = toNumber(stock?.transportCost) || 0;
    const accessoryCost = toNumber(stock?.accessoryCost) || 0;
    const otherCosts = toNumber(stock?.otherCosts) || 0;
    const totalCost = baseCost + transportCost + accessoryCost + otherCosts;

    let accumulatedInterest = 0;
    if (stock?.financeProvider) {
      const activeEndDate = stock.soldDate || today;
      const interestStartDate = stock.orderDate || stock.arrivalDate;
      const hasStopDate = stock.stopInterestCalc && stock.interestStoppedAt;
      const endDate = hasStopDate
        ? new Date(Math.min(activeEndDate.getTime(), stock.interestStoppedAt!.getTime()))
        : activeEndDate;
      const canAccrueActiveInterest = stock.debtStatus !== 'PAID_OFF' && !stock.stopInterestCalc;

      if (stock.interestPeriods?.length) {
        stock.interestPeriods.forEach(
          (period: {
            startDate: Date;
            endDate: Date | null;
            annualRate: Decimal | number;
            principalAmount: Decimal | number;
            calculatedInterest: Decimal | number;
          }) => {
            if (period.endDate) {
              accumulatedInterest += toNumber(period.calculatedInterest);
              return;
            }

            if (!canAccrueActiveInterest) {
              return;
            }

            const days = calculateDays(period.startDate, activeEndDate);
            accumulatedInterest += calculateInterest(
              toNumber(period.principalAmount),
              toNumber(period.annualRate),
              days
            );
          }
        );
      } else {
        const canAccrueInterest = stock.debtStatus !== 'PAID_OFF' || hasStopDate;

        if (canAccrueInterest) {
          const rate = toNumber(stock.interestRate) * 100;
          const principal = stock.interestPrincipalBase === 'BASE_COST_ONLY' ? baseCost : totalCost;
          const days = calculateDays(interestStartDate, endDate);
          accumulatedInterest = calculateInterest(principal, rate, days);
        }
      }
    }

    const totalCostWithInterest = totalCost + accumulatedInterest;
    const financeCommission = toNumber(sale.financeCommission) || 0;
    const salesCommission = toNumber(sale.salesCommission) || 0;
    const salesExpense = toNumber(sale.salesExpense) || 0;
    const discountAmount =
      sale.carDiscount != null ? toNumber(sale.carDiscount) : toNumber(sale.discountSnapshot) || 0;
    // Live ยอดเบิกต่อคัน (same engine as รายงานเบิกแคมเปญ). If the sale was
    // never tagged, pick a campaign by model + sale date so creating a
    // campaign applies without re-saving every bill.
    const claimCampaign = pickClaimCampaign(
      {
        campaign: sale.campaign,
        vehicleModel: sale.vehicleModel,
        stock: sale.stock ? { vehicleModel: sale.stock.vehicleModel } : null,
        saleDate: sale.createdAt,
      },
      campaignCatalog
    );
    const { campaignSubsidy, netCarDiscount, netProfit } = computeSaleMoney({
      sellingPrice,
      totalCostWithInterest,
      carDiscount: discountAmount,
      campaignSubsidy: computeLiveClaimTotal({
        campaign: claimCampaign,
        vehicleModel: sale.vehicleModel,
        stock: sale.stock
          ? { baseCost: sale.stock.baseCost, vehicleModel: sale.stock.vehicleModel }
          : null,
      }),
      financeCommission,
      salesCommission,
      salesExpense,
    });
    const interestCost = Math.round(accumulatedInterest * 100) / 100;

    return {
      id: sale.id,
      saleNumber: sale.saleNumber,
      saleDate: sale.createdAt.toISOString(),
      customerName: sale.customer.name,
      customerType: sale.customer.type,
      vehicleInfo: vehicleModel ? `${vehicleModel.brand} ${vehicleModel.model}` : 'N/A', // Shortened for report
      vehicleModelName: vehicleModel
        ? `${vehicleModel.brand} ${vehicleModel.model} ${vehicleModel.variant || ''}`
        : 'N/A',
      engineNumber: stock?.engineNumber || '-',
      chassisNumber: stock?.vin || '-',
      saleType: sale.type,
      paymentMode: sale.paymentMode,
      paymentModeLabel:
        PAYMENT_MODE_LABELS[sale.paymentMode as keyof typeof PAYMENT_MODE_LABELS] ||
        sale.paymentMode,
      totalAmount: sellingPrice,
      discountAmount,
      campaignSubsidy,
      netCarDiscount,
      downPaymentDiscount: toNumber(sale.downPaymentDiscount) || 0,
      downPayment: toNumber(sale.downPayment) || toNumber(sale.depositAmount) || 0,
      financeAmount: toNumber(sale.financeAmount) || 0,
      financeProvider: sale.financeProvider || stock?.financeProvider || '-',
      paidAmount: toNumber(sale.paidAmount),
      remainingAmount: toNumber(sale.remainingAmount),
      status: sale.status,
      statusLabel:
        SALE_STATUS_LABELS[sale.status as keyof typeof SALE_STATUS_LABELS] || sale.status,
      salesperson: sale.createdBy ? `${sale.createdBy.firstName} ${sale.createdBy.lastName}` : '-',
      salespersonId: sale.createdBy?.id ?? '',

      // Cost & Profit fields
      baseCost,
      totalCost,
      interestCost,
      accumulatedInterest: interestCost,
      totalCostWithInterest: Math.round(totalCostWithInterest * 100) / 100,
      netProfit: Math.round(netProfit * 100) / 100,

      // Supplier + VAT split (from stock.baseCost)
      receivedFrom: stock?.receivedFrom || '-',
      priceNet: splitVat(baseCost).net,
      priceVat: splitVat(baseCost).vat,
      priceGross: baseCost,

      financeReturn: financeCommission, // ค่าตอบไฟแนนซ์
      transportFee:
        (toNumber(sale.registrationFee) || 0) + (toNumber(sale.compulsoryInsuranceFee) || 0), // ทะเบียน/พรบ/ขนส่ง
      campaignName: claimCampaign?.name || sale.campaign?.name || '-',
      stockNotes: resolveReportStockNotes(sale.stock?.notes, sale.notes), // หมายเหตุ (PDF)
      salesCommission, // คอมฯ พนักงานขาย
      salesExpense, // ค่าใช้จ่ายในการขาย
      insurancePremium: toNumber(sale.insuranceFee) || 0, // ค่าเบี้ยประกัน
    };
  });

  // Summary
  const totalSales = saleItems.length;
  const totalAmount = saleItems.reduce((sum, s) => sum + s.totalAmount, 0);
  const totalPaid = saleItems.reduce((sum, s) => sum + s.paidAmount, 0);
  const totalRemaining = saleItems.reduce((sum, s) => sum + s.remainingAmount, 0);
  const avgSaleAmount = totalSales > 0 ? totalAmount / totalSales : 0;

  // Column totals + VAT split for the report footer (customer form layout)
  const sumField = (field: string) =>
    saleItems.reduce((sum, s) => sum + ((s as Record<string, any>)[field] || 0), 0);

  const totalCarDiscount = sumField('discountAmount');
  const totalDownPaymentDiscount = sumField('downPaymentDiscount');
  const totalDownPayment = sumField('downPayment');
  const totalFinanceAmount = sumField('financeAmount');
  const totalFinanceReturn = sumField('financeReturn');
  const totalTransportFee = sumField('transportFee');
  const totalCostSum = sumField('totalCost');
  const totalSalesCommission = sumField('salesCommission');
  const totalSalesExpense = sumField('salesExpense');
  const totalInsurancePremium = sumField('insurancePremium');
  const totalNetProfit = sumField('netProfit');
  const totalCampaignSubsidy = sumField('campaignSubsidy');
  const totalNetCarDiscount = sumField('netCarDiscount');

  // ยอดมูลค่าขาย/ภาษีขาย from selling price; ยอดมูลค่าต้นทุน/ภาษีซื้อ from base cost
  const saleVat = saleItems.reduce(
    (acc, s) => {
      const split = splitVat(s.totalAmount);
      return { net: acc.net + split.net, vat: acc.vat + split.vat };
    },
    { net: 0, vat: 0 }
  );
  const costVat = saleItems.reduce(
    (acc, s) => {
      const split = splitVat(s.baseCost);
      return { net: acc.net + split.net, vat: acc.vat + split.vat };
    },
    { net: 0, vat: 0 }
  );

  // By salesperson
  const salespersonGroups: Record<string, { id: string; count: number; amount: number }> = {};
  saleItems.forEach((s) => {
    if (!salespersonGroups[s.salesperson]) {
      salespersonGroups[s.salesperson] = { id: s.salespersonId, count: 0, amount: 0 };
    }
    salespersonGroups[s.salesperson].count += 1;
    salespersonGroups[s.salesperson].amount += s.totalAmount;
  });

  const bySalesperson = Object.entries(salespersonGroups)
    .map(([name, data]) => ({
      id: data.id,
      name,
      saleCount: data.count,
      totalAmount: data.amount,
      percentage: totalAmount > 0 ? (data.amount / totalAmount) * 100 : 0,
    }))
    .sort((a, b) => b.totalAmount - a.totalAmount);

  // By status
  const statusGroups: Record<string, { count: number; amount: number }> = {};
  saleItems.forEach((s) => {
    if (!statusGroups[s.status]) {
      statusGroups[s.status] = { count: 0, amount: 0 };
    }
    statusGroups[s.status].count += 1;
    statusGroups[s.status].amount += s.totalAmount;
  });

  const byStatus = Object.entries(statusGroups).map(([status, data]) => ({
    status,
    label: SALE_STATUS_LABELS[status as keyof typeof SALE_STATUS_LABELS] || status,
    count: data.count,
    amount: data.amount,
  }));

  // By payment mode
  const paymentModeGroups: Record<string, { count: number; amount: number }> = {};
  saleItems.forEach((s) => {
    if (!paymentModeGroups[s.paymentMode]) {
      paymentModeGroups[s.paymentMode] = { count: 0, amount: 0 };
    }
    paymentModeGroups[s.paymentMode].count += 1;
    paymentModeGroups[s.paymentMode].amount += s.totalAmount;
  });

  const byPaymentMode = Object.entries(paymentModeGroups).map(([mode, data]) => ({
    mode,
    label: PAYMENT_MODE_LABELS[mode as keyof typeof PAYMENT_MODE_LABELS] || mode,
    count: data.count,
    amount: data.amount,
  }));

  // Chart data - monthly
  const monthlyGroups: Record<string, { count: number; amount: number }> = {};
  saleItems.forEach((s) => {
    const date = new Date(s.saleDate);
    const monthKey = getMonthKey(date);
    if (!monthlyGroups[monthKey]) {
      monthlyGroups[monthKey] = { count: 0, amount: 0 };
    }
    monthlyGroups[monthKey].count += 1;
    monthlyGroups[monthKey].amount += s.totalAmount;
  });

  const monthly = Object.entries(monthlyGroups).map(([month, data]) => ({
    month,
    count: data.count,
    amount: data.amount,
  }));

  // Calculate completed count and top salesperson
  const completedCount = saleItems.filter((s) => s.status === 'COMPLETED').length;
  const topSalesperson = bySalesperson.length > 0 ? bySalesperson[0].name : '-';

  // Build per-salesperson breakdown. commission = sum of the salesCommission
  // entered on each sale (see sales-summary.helpers); previously this used a
  // hardcoded 1% of sales amount, which ignored the typed value (bug B6).
  const bySalespersonDetailed = buildSalespersonBreakdown(saleItems);

  return {
    sales: saleItems,
    bySalesperson: bySalespersonDetailed,
    summary: {
      totalSales,
      totalCount: totalSales,
      totalAmount,
      totalPaid,
      totalRemaining,
      avgSaleAmount: Math.round(avgSaleAmount),
      averageAmount: Math.round(avgSaleAmount),
      completedCount,
      topSalesperson,
      bySalesperson,
      byStatus,
      byPaymentMode,
      totalCarDiscount,
      totalCampaignSubsidy,
      totalNetCarDiscount,
      totalDownPaymentDiscount,
      totalDownPayment,
      totalFinanceAmount,
      totalFinanceReturn,
      totalTransportFee,
      totalCostSum,
      totalSalesCommission,
      totalSalesExpense,
      totalInsurancePremium,
      totalNetProfit,
      saleVatNet: Math.round(saleVat.net * 100) / 100,
      saleVatAmount: Math.round(saleVat.vat * 100) / 100,
      costVatNet: Math.round(costVat.net * 100) / 100,
      costVatAmount: Math.round(costVat.vat * 100) / 100,
    },
    chartData: {
      monthly,
      bySalesperson: bySalesperson.slice(0, 10).map((s) => ({
        name: s.name,
        count: s.saleCount,
        amount: s.totalAmount,
      })),
      byStatus: byStatus.map((s) => ({
        status: s.status,
        label: s.label,
        count: s.count,
        amount: s.amount,
      })),
    },
  };
}

// ============================================
// Stock Interest Report Service
// ============================================

interface StockInterestParams {
  startDate?: Date;
  endDate?: Date;
  status?: StockStatus;
  isCalculating?: boolean;
  brand?: string;
}

export async function getStockInterestReport(params: StockInterestParams) {
  const { startDate, endDate, status, isCalculating, brand } = params;

  const where: Record<string, unknown> = {
    deletedAt: null,
  };

  if (status) {
    where.status = status;
  }

  if (isCalculating === true) {
    where.stopInterestCalc = false;
    where.debtStatus = { not: 'PAID_OFF' };
  } else if (isCalculating === false) {
    where.OR = [{ stopInterestCalc: true }, { debtStatus: 'PAID_OFF' }];
  }

  if (brand) {
    where.vehicleModel = { brand };
  }

  const stocks = await db.stock.findMany({
    where,
    include: {
      vehicleModel: {
        select: { brand: true, model: true, variant: true, year: true },
      },
      interestPeriods: {
        orderBy: { startDate: 'desc' },
      },
      debtPayments: {
        orderBy: { paymentDate: 'desc' },
      },
    },
    orderBy: { arrivalDate: 'desc' },
  });

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Report window. Both bounds are optional so an unfiltered call keeps the old
  // lifetime-to-today numbers; the report page always sends both.
  // An unparseable date is ignored rather than poisoning every day count with NaN.
  const validDay = (d?: Date): Date | null => (d && !Number.isNaN(d.getTime()) ? d : null);
  const windowStart = validDay(startDate);
  const windowEnd = validDay(endDate);
  const windowStartMs = windowStart ? parseDay(windowStart).getTime() : Number.NEGATIVE_INFINITY;
  const windowEndMs = windowEnd ? parseDay(windowEnd).getTime() : Number.POSITIVE_INFINITY;
  const isWindowed = windowStart !== null || windowEnd !== null;

  const allStockItems = stocks.map((stock) => {
    const baseCost = toNumber(stock.baseCost);
    const interestInput = {
      orderDate: stock.orderDate,
      arrivalDate: stock.arrivalDate,
      soldDate: stock.soldDate,
      stopInterestCalc: stock.stopInterestCalc,
      interestStoppedAt: stock.interestStoppedAt,
      debtStatus: stock.debtStatus,
      interestRate: toNumber(stock.interestRate),
      interestPrincipalBase: stock.interestPrincipalBase,
      baseCost,
      transportCost: toNumber(stock.transportCost),
      accessoryCost: toNumber(stock.accessoryCost),
      otherCosts: toNumber(stock.otherCosts),
      interestPeriods: stock.interestPeriods.map((p) => ({
        startDate: p.startDate,
        endDate: p.endDate,
        annualRate: toNumber(p.annualRate),
        principalBase: p.principalBase,
        principalAmount: toNumber(p.principalAmount),
        calculatedInterest: toNumber(p.calculatedInterest),
        daysCount: p.daysCount,
      })),
    };
    const display = resolveStockInterestDisplay(interestInput, today);
    // ดอกเบี้ย + จำนวนวัน "เฉพาะช่วงที่เลือก" (ไม่ใช่ยอดสะสมตลอดอายุรถ)
    const inWindow = resolveStockInterestWindow(interestInput, today, windowStart, windowEnd);

    const interestStartDate = display.interestStartDate;
    const lifetimeDaysCount = display.daysCount;
    const daysCount = isWindowed ? inWindow.daysCount : display.daysCount;
    const currentRate = display.currentRate;
    const principalBase = display.principalBase;
    const principalAmount = display.principalAmount;
    const totalAccumulatedInterest = isWindowed ? inWindow.interest : display.accumulatedInterest;
    const isCalculatingNow = display.isCalculating;
    const vehicleInfo =
      `${stock.vehicleModel.brand} ${stock.vehicleModel.model} ${stock.vehicleModel.variant || ''} ${stock.vehicleModel.year}`.trim();

    // ดอกเบี้ยที่จ่ายแล้ว: มีช่วง = รวมเฉพาะงวดที่จ่ายในช่วงนั้น (StockDebtPayment.interestPaid),
    // ไม่มีช่วง = ใช้ยอดสะสม paidInterestAmount ใน Stock ที่ recordDebtPayment update ไว้
    let paidInterest = isWindowed
      ? stock.debtPayments.reduce((sum, p) => {
          const paidAt = parseDay(p.paymentDate).getTime();
          if (paidAt < windowStartMs || paidAt > windowEndMs) return sum;
          return sum + toNumber(p.interestPaid);
        }, 0)
      : toNumber(stock.paidInterestAmount);

    // ดอกเบี้ยค้างชำระ = ดอกเบี้ย(ในช่วง) - ดอกเบี้ยที่จ่ายแล้ว(ในช่วง)
    let pendingInterest = Math.max(0, totalAccumulatedInterest - paidInterest);

    // ถ้าปิดหนี้แล้ว = ดอกเบี้ยทั้งหมดถือว่าจ่ายแล้ว
    if (stock.debtStatus === 'PAID_OFF') {
      paidInterest = totalAccumulatedInterest;
      pendingInterest = 0;
    } else if (stock.status === 'SOLD' && !stock.financeProvider) {
      // ไม่มีไฟแนนซ์ แต่ขายแล้ว = ดอกเบี้ยทั้งหมดถือว่าจ่ายแล้ว (รวมในราคาขาย)
      paidInterest = totalAccumulatedInterest;
      pendingInterest = 0;
    }

    return {
      stockId: stock.id,
      vin: stock.vin,
      vehicleInfo,
      brand: stock.vehicleModel.brand,
      model: stock.vehicleModel.model,
      variant: stock.vehicleModel.variant,
      year: stock.vehicleModel.year,
      exteriorColor: stock.exteriorColor,
      status: stock.status,
      statusLabel:
        STOCK_STATUS_LABELS[stock.status as keyof typeof STOCK_STATUS_LABELS] || stock.status,
      arrivalDate: stock.arrivalDate?.toISOString() ?? '',
      orderDate: stock.orderDate?.toISOString(),
      interestStartDate: interestStartDate?.toISOString() ?? '',
      interestStoppedAt: display.interestStoppedAt?.toISOString(),
      interestActionDate: display.interestActionDate?.toISOString() ?? '',
      interestStatusLabel: isCalculatingNow ? 'กำลังคิด' : 'หยุดแล้ว',
      daysInStock: lifetimeDaysCount,
      daysCount,
      currentRate,
      interestRate: currentRate,
      principalBase,
      principalAmount,
      baseCost,
      totalInterest: Math.round(totalAccumulatedInterest * 100) / 100,
      paidInterest: Math.round(paidInterest * 100) / 100,
      pendingInterest: Math.round(pendingInterest * 100) / 100,
      totalCostWithInterest: Math.round((baseCost + totalAccumulatedInterest) * 100) / 100,
      accumulatedInterest: Math.round(totalAccumulatedInterest * 100) / 100,
      isCalculating: isCalculatingNow,
      debtStatus: stock.debtStatus,
      debtAmount: toNumber(stock.debtAmount),
      paidDebtAmount: toNumber(stock.paidDebtAmount),
      remainingDebt: toNumber(stock.remainingDebt),
    };
  });

  // เมื่อเลือกช่วงวันที่: ตัดรถที่ไม่ได้คิดดอกเบี้ยเลยในช่วงนั้นออก
  // (หยุดคิดไปก่อนช่วง หรือเพิ่งเริ่มคิดหลังช่วง) และไม่มีการจ่ายดอกในช่วงด้วย
  const stockItems = isWindowed
    ? allStockItems.filter((s) => s.daysCount > 0 || s.paidInterest > 0)
    : allStockItems;

  // Summary
  const totalInterest = stockItems.reduce((sum, s) => sum + s.accumulatedInterest, 0);
  const totalBaseCost = stockItems.reduce((sum, s) => sum + s.baseCost, 0);
  const paidInterest = stockItems.reduce((sum, s) => sum + s.paidInterest, 0);
  const pendingInterest = stockItems.reduce((sum, s) => sum + s.pendingInterest, 0);
  const calculatingItems = stockItems.filter((s) => s.isCalculating);
  const stoppedItems = stockItems.filter((s) => !s.isCalculating);
  const calculatingCount = calculatingItems.length;
  const stoppedCount = stoppedItems.length;
  const calculatingInterest = calculatingItems.reduce((sum, s) => sum + s.accumulatedInterest, 0);
  const stoppedInterest = stoppedItems.reduce((sum, s) => sum + s.accumulatedInterest, 0);
  const totalStockCount = stockItems.length;
  const avgRate =
    totalStockCount > 0
      ? stockItems.reduce((sum, s) => sum + s.currentRate, 0) / totalStockCount
      : 0;
  const avgDaysInStock =
    totalStockCount > 0 ? stockItems.reduce((sum, s) => sum + s.daysCount, 0) / totalStockCount : 0;
  const averageInterestPerDay =
    avgDaysInStock > 0 && totalStockCount > 0
      ? totalInterest / (avgDaysInStock * totalStockCount)
      : 0;

  // Calculate overdue vehicles (more than 90 days in stock).
  // Uses lifetime days, not window days — a 1-month window would otherwise never flag anything.
  const overdueVehicles = stockItems.filter(
    (s) => s.daysInStock > 90 && s.status !== 'SOLD'
  ).length;
  const overdueInterest = stockItems
    .filter((s) => s.daysInStock > 90 && s.status !== 'SOLD')
    .reduce((sum, s) => sum + s.accumulatedInterest, 0);

  // Chart data - by status
  const statusGroups: Record<string, number> = {};
  stockItems.forEach((s) => {
    statusGroups[s.status] = (statusGroups[s.status] || 0) + s.accumulatedInterest;
  });

  const byStatus = Object.entries(statusGroups).map(([status, interest]) => ({
    status,
    label: STOCK_STATUS_LABELS[status as keyof typeof STOCK_STATUS_LABELS] || status,
    interest: Math.round(interest * 100) / 100,
  }));

  // By brand
  const brandGroups: Record<string, { interest: number; count: number }> = {};
  stockItems.forEach((s) => {
    if (!brandGroups[s.brand]) {
      brandGroups[s.brand] = { interest: 0, count: 0 };
    }
    brandGroups[s.brand].interest += s.accumulatedInterest;
    brandGroups[s.brand].count += 1;
  });

  const byBrand = Object.entries(brandGroups)
    .map(([brand, data]) => ({
      brand,
      interest: Math.round(data.interest * 100) / 100,
      count: data.count,
    }))
    .sort((a, b) => b.interest - a.interest);

  // Monthly (based on arrival date)
  const monthlyGroups: Record<string, { interest: number; paidInterest: number }> = {};
  stockItems.forEach((s) => {
    if (!s.arrivalDate) return;
    const date = new Date(s.arrivalDate);
    if (Number.isNaN(date.getTime())) return;
    const monthKey = getMonthKey(date);
    if (!monthlyGroups[monthKey]) {
      monthlyGroups[monthKey] = { interest: 0, paidInterest: 0 };
    }
    monthlyGroups[monthKey].interest += s.accumulatedInterest;
    // ใช้ paidInterest ที่คำนวณไว้แล้ว (จาก paidInterestAmount)
    monthlyGroups[monthKey].paidInterest += s.paidInterest;
  });

  const monthly = Object.entries(monthlyGroups).map(([month, data]) => ({
    month,
    interest: Math.round(data.interest * 100) / 100,
    paidInterest: Math.round(data.paidInterest * 100) / 100,
  }));

  return {
    items: stockItems,
    stocks: stockItems,
    summary: {
      totalInterest: Math.round(totalInterest * 100) / 100,
      paidInterest: Math.round(paidInterest * 100) / 100,
      pendingInterest: Math.round(pendingInterest * 100) / 100,
      totalVehicles: totalStockCount,
      totalBaseCost: Math.round(totalBaseCost * 100) / 100,
      averageInterestPerDay: Math.round(averageInterestPerDay * 100) / 100,
      overdueVehicles,
      overdueInterest: Math.round(overdueInterest * 100) / 100,
      calculatingCount,
      calculatingInterest: Math.round(calculatingInterest * 100) / 100,
      stoppedCount,
      stoppedInterest: Math.round(stoppedInterest * 100) / 100,
      totalStockCount,
      avgRate: Math.round(avgRate * 100) / 100,
      avgDaysInStock: Math.round(avgDaysInStock),
    },
    chartData: {
      monthlyInterest: monthly,
      monthly,
      byStatus,
      byBrand: byBrand.slice(0, 10),
    },
  };
}

// ============================================
// Purchase Requirement Report Service
// รายงานรถที่ต้องซื้อเพิ่ม (จากการจองหักลบกับสต็อก)
// ============================================

interface PurchaseRequirementParams {
  brand?: string;
}

export async function getPurchaseRequirementReport(params: PurchaseRequirementParams) {
  const { brand } = params;

  // Get active reservations (RESERVED/PREPARING status, RESERVATION_SALE type) without assigned stock
  const reservationWhere: Record<string, unknown> = {
    status: { in: ['RESERVED', 'PREPARING'] as SaleStatus[] },
    type: 'RESERVATION_SALE',
    stockId: null, // ยังไม่ได้ assign stock
  };

  if (brand) {
    reservationWhere.vehicleModel = { brand };
  }

  const reservations = await db.sale.findMany({
    where: reservationWhere,
    include: {
      vehicleModel: {
        select: { id: true, brand: true, model: true, variant: true, year: true },
      },
    },
  });

  // Get available stock
  const stockWhere: Record<string, unknown> = {
    status: 'AVAILABLE' as StockStatus,
    deletedAt: null,
  };

  if (brand) {
    stockWhere.vehicleModel = { brand };
  }

  const availableStocks = await db.stock.findMany({
    where: stockWhere,
    include: {
      vehicleModel: {
        select: { id: true, brand: true, model: true, variant: true, year: true },
      },
    },
  });

  // Group reservations by vehicle model
  const reservationGroups: Record<string, { count: number; vehicleModel: any }> = {};
  reservations.forEach((sale) => {
    if (sale.vehicleModel) {
      const key = sale.vehicleModel.id;
      if (!reservationGroups[key]) {
        reservationGroups[key] = { count: 0, vehicleModel: sale.vehicleModel };
      }
      reservationGroups[key].count += 1;
    }
  });

  // Group available stock by vehicle model
  const stockGroups: Record<string, { count: number; vehicleModel: any }> = {};
  availableStocks.forEach((stock) => {
    const key = stock.vehicleModel.id;
    if (!stockGroups[key]) {
      stockGroups[key] = { count: 0, vehicleModel: stock.vehicleModel };
    }
    stockGroups[key].count += 1;
  });

  // Calculate purchase requirements
  const allModelIds = new Set([...Object.keys(reservationGroups), ...Object.keys(stockGroups)]);

  const items = Array.from(allModelIds)
    .map((modelId) => {
      const reservationCount = reservationGroups[modelId]?.count || 0;
      const availableCount = stockGroups[modelId]?.count || 0;
      const requiredPurchase = Math.max(0, reservationCount - availableCount);
      const vehicleModel =
        reservationGroups[modelId]?.vehicleModel || stockGroups[modelId]?.vehicleModel;

      return {
        vehicleModelId: modelId,
        brand: vehicleModel?.brand || '-',
        model: vehicleModel?.model || '-',
        variant: vehicleModel?.variant || '',
        year: vehicleModel?.year || 0,
        vehicleModelName:
          `${vehicleModel?.brand || ''} ${vehicleModel?.model || ''} ${vehicleModel?.variant || ''}`.trim(),
        reservationCount,
        availableCount,
        requiredPurchase,
        status: requiredPurchase > 0 ? 'NEED_TO_BUY' : 'SUFFICIENT',
      };
    })
    .filter((item) => item.reservationCount > 0 || item.availableCount > 0)
    .sort((a, b) => b.requiredPurchase - a.requiredPurchase);

  // Summary
  const totalReservations = items.reduce((sum, item) => sum + item.reservationCount, 0);
  const totalAvailable = items.reduce((sum, item) => sum + item.availableCount, 0);
  const totalRequired = items.reduce((sum, item) => sum + item.requiredPurchase, 0);
  const modelsNeedingPurchase = items.filter((item) => item.requiredPurchase > 0).length;

  return {
    items,
    summary: {
      totalReservations,
      totalAvailable,
      totalRequired,
      modelsNeedingPurchase,
      totalModels: items.length,
    },
  };
}

// ============================================
// Daily Stock Snapshot
// ============================================

export interface DailySnapshotInputReservation {
  vehicleModelId: string | null;
  modelName: string;
  color: string;
}

export interface DailySnapshotInputStock {
  vehicleModelId: string;
  modelName: string;
  color: string;
  status: 'AVAILABLE' | 'DEMO';
}

export function buildDailySnapshot(args: {
  reservations: DailySnapshotInputReservation[];
  stocks: DailySnapshotInputStock[];
  date: string;
}) {
  const { reservations, stocks, date } = args;

  const colorSet = new Set<string>();
  for (const r of reservations) if (r.vehicleModelId) colorSet.add(r.color);
  for (const s of stocks) colorSet.add(s.color);
  const colors = Array.from(colorSet).sort();

  const modelMap = new Map<
    string,
    {
      vehicleModelId: string;
      modelName: string;
      reservationsByColor: Record<string, number>;
      availableByColor: Record<string, number>;
      demoByColor: Record<string, number>;
    }
  >();

  const ensureModel = (id: string, name: string) => {
    let m = modelMap.get(id);
    if (!m) {
      m = {
        vehicleModelId: id,
        modelName: name,
        reservationsByColor: {},
        availableByColor: {},
        demoByColor: {},
      };
      modelMap.set(id, m);
    }
    return m;
  };

  let unassignedReservations = 0;
  for (const r of reservations) {
    if (!r.vehicleModelId) {
      unassignedReservations += 1;
      continue;
    }
    const m = ensureModel(r.vehicleModelId, r.modelName);
    m.reservationsByColor[r.color] = (m.reservationsByColor[r.color] || 0) + 1;
  }

  for (const s of stocks) {
    const m = ensureModel(s.vehicleModelId, s.modelName);
    if (s.status === 'AVAILABLE') {
      m.availableByColor[s.color] = (m.availableByColor[s.color] || 0) + 1;
    } else {
      m.demoByColor[s.color] = (m.demoByColor[s.color] || 0) + 1;
    }
  }

  const models = Array.from(modelMap.values()).map((m) => {
    const reservationsTotal = Object.values(m.reservationsByColor).reduce((a, b) => a + b, 0);
    const availableTotal = Object.values(m.availableByColor).reduce((a, b) => a + b, 0);
    const demoTotal = Object.values(m.demoByColor).reduce((a, b) => a + b, 0);

    const requiredByColor: Record<string, number> = {};
    const allColors = new Set([
      ...Object.keys(m.reservationsByColor),
      ...Object.keys(m.availableByColor),
    ]);
    let requiredTotal = 0;
    for (const c of allColors) {
      const req = Math.max(0, (m.reservationsByColor[c] || 0) - (m.availableByColor[c] || 0));
      requiredByColor[c] = req;
      requiredTotal += req;
    }

    return { ...m, reservationsTotal, availableTotal, demoTotal, requiredByColor, requiredTotal };
  });

  const grand = {
    reservations: models.reduce((a, m) => a + m.reservationsTotal, 0),
    available: models.reduce((a, m) => a + m.availableTotal, 0),
    demo: models.reduce((a, m) => a + m.demoTotal, 0),
    required: models.reduce((a, m) => a + m.requiredTotal, 0),
  };

  return { date, colors, models, grand, unassignedReservations };
}

export async function getDailyStockSnapshot(params: { date: Date }) {
  const snapshotDate = new Date(params.date);
  snapshotDate.setHours(23, 59, 59, 999);

  const [reservations, stocks] = await Promise.all([
    db.sale.findMany({
      where: {
        status: { in: ['RESERVED', 'PREPARING'] as SaleStatus[] },
        createdAt: { lte: snapshotDate },
      },
      include: {
        vehicleModel: { select: { id: true, brand: true, model: true, variant: true } },
      },
    }),
    db.stock.findMany({
      where: {
        deletedAt: null,
        arrivalDate: { lte: snapshotDate },
        status: { in: ['AVAILABLE', 'DEMO'] as StockStatus[] },
      },
      include: {
        vehicleModel: { select: { id: true, brand: true, model: true, variant: true } },
      },
    }),
  ]);

  const inputReservations: DailySnapshotInputReservation[] = reservations.map((r) => ({
    vehicleModelId: r.vehicleModel?.id ?? null,
    modelName: r.vehicleModel
      ? `${r.vehicleModel.brand} ${r.vehicleModel.model}${r.vehicleModel.variant ? ' ' + r.vehicleModel.variant : ''}`
      : '',
    color: r.preferredExtColor || 'ไม่ระบุสี',
  }));

  const inputStocks: DailySnapshotInputStock[] = stocks.map((s) => ({
    vehicleModelId: s.vehicleModel.id,
    modelName: `${s.vehicleModel.brand} ${s.vehicleModel.model}${s.vehicleModel.variant ? ' ' + s.vehicleModel.variant : ''}`,
    color: s.exteriorColor,
    status: s.status as 'AVAILABLE' | 'DEMO',
  }));

  return buildDailySnapshot({
    reservations: inputReservations,
    stocks: inputStocks,
    date: params.date.toISOString().split('T')[0],
  });
}

// ============================================
// Monthly Purchases Report
// ============================================

export async function getMonthlyPurchasesReport(params: {
  year: number;
  month: number;
  vehicleType?: VehicleType;
}) {
  const { year, month, vehicleType } = params;

  // Half-open interval: [startDate, endDate)
  const startDate = new Date(year, month - 1, 1, 0, 0, 0, 0);
  const endDate = new Date(year, month, 1, 0, 0, 0, 0);

  const where: Record<string, unknown> = {
    deletedAt: null,
    arrivalDate: { gte: startDate, lt: endDate },
  };
  if (vehicleType) {
    where.vehicleModel = { type: vehicleType };
  }

  const stocks = await db.stock.findMany({
    where,
    include: {
      vehicleModel: { select: { brand: true, model: true, variant: true, type: true } },
      sale: {
        include: {
          customer: { select: { name: true } },
          createdBy: { select: { firstName: true, lastName: true } },
        },
      },
    },
    orderBy: { arrivalDate: 'asc' },
  });

  const items = stocks.map((s, idx) => {
    const gross = toNumber(s.baseCost);
    const { net, vat } = splitVat(gross);
    const variantStr = s.vehicleModel.variant ? ` ${s.vehicleModel.variant}` : '';
    return {
      no: idx + 1,
      vehicleModelName: `${s.vehicleModel.brand} ${s.vehicleModel.model}${variantStr}`,
      exteriorColor: s.exteriorColor,
      vin: s.vin,
      engineNumber: s.engineNumber || '-',
      orderDate: s.orderDate ? s.orderDate.toISOString() : null,
      arrivalDate: s.arrivalDate ? s.arrivalDate.toISOString() : new Date(0).toISOString(),
      receivedFrom: s.receivedFrom || '-',
      priceNet: net,
      priceVat: vat,
      priceGross: gross,
      parkingSlot: s.parkingSlot || '-',
      customerName: s.sale?.customer?.name ?? null,
      soldDate: s.soldDate ? s.soldDate.toISOString() : null,
      salesperson: s.sale?.createdBy
        ? `${s.sale.createdBy.firstName} ${s.sale.createdBy.lastName}`
        : null,
      notes: s.notes ?? null,
    };
  });

  const totalPriceNet = items.reduce((sum, i) => sum + i.priceNet, 0);
  const totalPriceVat = items.reduce((sum, i) => sum + i.priceVat, 0);
  const totalPriceGross = items.reduce((sum, i) => sum + i.priceGross, 0);

  const byTypeMap = new Map<VehicleType, { count: number; totalGross: number }>();
  stocks.forEach((s, idx) => {
    const t = s.vehicleModel.type;
    const cur = byTypeMap.get(t) || { count: 0, totalGross: 0 };
    cur.count += 1;
    cur.totalGross += items[idx].priceGross;
    byTypeMap.set(t, cur);
  });
  const byType = Array.from(byTypeMap.entries()).map(([type, v]) => ({
    type,
    count: v.count,
    totalGross: Math.round(v.totalGross * 100) / 100,
  }));

  return {
    period: {
      year,
      month,
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString(),
    },
    vehicleType,
    items,
    summary: {
      totalVehicles: items.length,
      totalPriceNet: Math.round(totalPriceNet * 100) / 100,
      totalPriceVat: Math.round(totalPriceVat * 100) / 100,
      totalPriceGross: Math.round(totalPriceGross * 100) / 100,
      byType,
    },
  };
}

// ============================================
// Bank Interest Report (รายงานคำนวณดอกเบี้ยธนาคาร ต่องวด)
// คิดดอกเบี้ยไฟแนนซ์รถในสต็อกต่องวด แบบเดียวกับใบแจ้งของธนาคาร
// (inclusive day count → ตรงกับบิลธนาคาร)
// ============================================
export async function getBankInterestReport(params: { cycleStart: Date; cycleEnd: Date }) {
  const { cycleStart, cycleEnd } = params;

  const stocks = await db.stock.findMany({
    where: {
      financeProvider: { not: null },
      deletedAt: null,
    },
    include: {
      vehicleModel: {
        select: { brand: true, model: true, variant: true, year: true },
      },
      interestPeriods: {
        orderBy: { startDate: 'asc' },
      },
    },
    orderBy: { arrivalDate: 'asc' },
  });

  // Map Prisma rows to the pure-helper input shape (Decimal → number happens in the helper).
  const stockInputs: BankInterestStockInput[] = stocks.map((stock) => ({
    id: stock.id,
    stockNumber: stock.stockNumber,
    vin: stock.vin,
    exteriorColor: stock.exteriorColor,
    orderDate: stock.orderDate,
    arrivalDate: stock.arrivalDate,
    interestStoppedAt: stock.interestStoppedAt,
    interestRate: stock.interestRate,
    interestPrincipalBase: stock.interestPrincipalBase,
    baseCost: stock.baseCost,
    transportCost: stock.transportCost,
    accessoryCost: stock.accessoryCost,
    otherCosts: stock.otherCosts,
    vehicleModel: stock.vehicleModel,
    interestPeriods: stock.interestPeriods.map((p) => ({
      startDate: p.startDate,
      endDate: p.endDate,
      annualRate: p.annualRate,
      principalAmount: p.principalAmount,
    })),
  }));

  const { rows, summary } = buildBankInterestRows(stockInputs, cycleStart, cycleEnd);

  return {
    rows: rows.map((r) => ({
      ...r,
      periodFrom: r.periodFrom.toISOString(),
      periodTo: r.periodTo.toISOString(),
    })),
    summary,
  };
}

export async function getCampaignClaimReport(params: {
  startDate: Date;
  endDate: Date;
  brand: string;
  campaignId?: string;
}) {
  const { startDate, endDate, brand, campaignId } = params;
  // endDate is the last INCLUDED day; the query needs a half-open exclusive
  // upper bound at the start of the next day — same convention as monthly purchases.
  const endDateExclusive = new Date(
    endDate.getFullYear(),
    endDate.getMonth(),
    endDate.getDate() + 1,
    0,
    0,
    0,
    0
  );

  const vehicleModelSelect = {
    select: { id: true, brand: true, model: true, variant: true, price: true },
  } as const;

  const sales = await db.sale.findMany({
    where: {
      campaignId: campaignId ? campaignId : { not: null },
      status: { notIn: ['CANCELLED'] },
      // Third branch covers stocked sales whose soldDate hasn't been stamped yet
      // (builder falls back to completedDate).
      OR: [
        { stock: { is: { soldDate: { gte: startDate, lt: endDateExclusive } } } },
        { stock: { is: null }, completedDate: { gte: startDate, lt: endDateExclusive } },
        {
          stock: { is: { soldDate: null } },
          completedDate: { gte: startDate, lt: endDateExclusive },
        },
      ],
    },
    include: {
      customer: { select: { name: true } },
      vehicleModel: vehicleModelSelect,
      stock: {
        select: {
          vin: true,
          engineNumber: true,
          soldDate: true,
          baseCost: true,
          vehicleModelId: true,
          vehicleModel: vehicleModelSelect,
        },
      },
      campaign: {
        select: {
          id: true,
          name: true,
          vehicleModels: {
            select: {
              vehicleModelId: true,
              formulas: { orderBy: { sortOrder: 'asc' } },
            },
          },
        },
      },
    },
    orderBy: { createdAt: 'asc' },
  });

  // Brand lives on the resolved model (stock's model wins) — filter in JS to
  // keep the OR query simple; monthly volumes are small.
  const brandSales = sales.filter(
    (s) => (s.stock?.vehicleModel?.brand ?? s.vehicleModel?.brand) === brand
  );

  const report = buildCampaignClaimReport(brandSales);

  return {
    period: {
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString(),
    },
    brand,
    ...report,
  };
}

export const reportsService = {
  getDailyPaymentReport,
  getStockReport,
  getProfitLossReport,
  getSalesSummaryReport,
  getStockInterestReport,
  getPurchaseRequirementReport,
  getDailyStockSnapshot,
  getMonthlyPurchasesReport,
  getCampaignClaimReport,
  getBankInterestReport,
};
