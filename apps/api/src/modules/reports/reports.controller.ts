import { Elysia, t } from 'elysia';
import { splitVat } from '@car-stock/shared/formulas';
import { authMiddleware, requirePermission } from '../auth/auth.middleware';
import { authService } from '../auth/auth.service';
import { formatThaiDate } from '../pdf/helpers';
import { pdfService } from '../pdf/pdf.service';
import { reportsService } from './reports.service';
import '../../types/context.d';
import { db } from '../../lib/db';

// Helper to get company header from settings or default
async function getCompanyHeader(): Promise<any> {
  const settings = await db.companySettings.findFirst();
  if (settings) {
    return {
      logoBase64: settings.logo || '',
      companyName: settings.companyNameTh,
      address1: settings.addressTh,
      address2: '',
      phone: `โทร. ${settings.phone} ${settings.fax ? `โทรสาร. ${settings.fax}` : ''}`,
    };
  }

  return {
    logoBase64: '',
    companyName: 'บริษัท วีบียอนด์ อินโนเวชั่น จำกัด',
    address1: '438/288 ถนนมิตรภาพ-หนองคาย ตำบลในเมือง',
    address2: 'อำเภอเมือง จังหวัดนครราชสีมา 30000',
    phone: 'โทร. 044-272-888 โทรสาร. 044-271-224',
  };
}

export const reportRoutes = new Elysia({ prefix: '/reports' })
  // ============================================
  // Daily Payment Report
  // ============================================
  .get(
    '/daily-payments',
    async ({ query, set, requester }) => {
      // Check permission - REPORT_FINANCE
      if (!authService.hasPermission(requester!.role, 'REPORT_FINANCE')) {
        set.status = 403;
        return {
          success: false,
          error: 'Forbidden',
          message: 'คุณไม่มีสิทธิ์ดูรายงานนี้',
        };
      }

      const startDate = query.startDate ? new Date(query.startDate) : undefined;
      const endDate = query.endDate ? new Date(query.endDate + 'T23:59:59.999Z') : undefined;

      const result = await reportsService.getDailyPaymentReport({
        startDate,
        endDate,
      });

      set.status = 200;
      return {
        success: true,
        data: result,
      };
    },
    {
      beforeHandle: authMiddleware,
      query: t.Object({
        startDate: t.Optional(t.String()),
        endDate: t.Optional(t.String()),
      }),
      detail: {
        tags: ['Reports'],
        summary: 'Get daily payment report',
        description: 'Get payment transactions grouped by day with summary',
      },
    }
  )
  .get(
    '/daily-payments/pdf',
    async ({ query, set, requester }) => {
      if (!authService.hasPermission(requester!.role, 'REPORT_FINANCE')) {
        set.status = 403;
        return 'Forbidden';
      }

      const startDate = query.startDate ? new Date(query.startDate) : undefined;
      const endDate = query.endDate ? new Date(query.endDate + 'T23:59:59.999Z') : undefined;

      const result = await reportsService.getDailyPaymentReport({ startDate, endDate });

      const dateRange =
        startDate && endDate
          ? `${formatThaiDate(startDate, 'numeric')} ถึง ${formatThaiDate(endDate, 'numeric')}`
          : `ทั้งหมด`;

      const header = await getCompanyHeader();
      if (!header.logoBase64) header.logoBase64 = pdfService.getLogoBase64();

      // VAT-inclusive split (shared formula). Deposit rows use same split as
      // legacy sheet layout; non-taxable payment types would need an explicit flag.
      const enrichedPayments = result.payments.map((p) => {
        const { net: baseAmount, vat: vatAmount } = splitVat(p.amount);
        // PaymentForm "หมายเหตุ" (sale mode) is stored in description; edit form uses notes.
        const itemDetail = p.description || p.notes || '';
        return {
          ...p,
          itemDetail,
          baseAmount,
          vatAmount,
          cashAmount: p.paymentMethod === 'CASH' ? p.amount : 0,
          chequeAmount: p.paymentMethod === 'CHEQUE' ? p.amount : 0,
          transferAmount:
            p.paymentMethod === 'BANK_TRANSFER' || p.paymentMethod === 'CREDIT_CARD' ? p.amount : 0,
          feeAmount: 0,
          otherIncomeAmount: 0,
          otherExpenseAmount: 0,
          customerPaidAmount: 0,
        };
      });

      const sum = (key: 'baseAmount' | 'vatAmount' | 'cashAmount' | 'chequeAmount' | 'transferAmount') =>
        enrichedPayments.reduce((s, p) => s + p[key], 0);

      const pdfBuffer = await pdfService.generateDailyPaymentReport({
        header,
        dateRange,
        payments: enrichedPayments,
        summary: {
          ...result.summary,
          baseAmount: sum('baseAmount'),
          vatAmount: sum('vatAmount'),
          cashAmount: sum('cashAmount'),
          chequeAmount: sum('chequeAmount'),
          transferAmount: sum('transferAmount'),
          feeAmount: 0,
          otherIncomeAmount: 0,
          otherExpenseAmount: 0,
          customerPaidAmount: 0,
        },
      });

      set.headers['Content-Type'] = 'application/pdf';
      set.headers['Content-Disposition'] = `attachment; filename="daily-payment-report.pdf"`;

      return pdfBuffer;
    },
    {
      beforeHandle: authMiddleware,
      query: t.Object({
        startDate: t.Optional(t.String()),
        endDate: t.Optional(t.String()),
      }),
    }
  )
  // ============================================
  // Stock Report
  // ============================================
  .get(
    '/stock',
    async ({ query, set, requester }) => {
      // Check permission - REPORT_STOCK
      if (!authService.hasPermission(requester!.role, 'REPORT_STOCK')) {
        set.status = 403;
        return {
          success: false,
          error: 'Forbidden',
          message: 'คุณไม่มีสิทธิ์ดูรายงานนี้',
        };
      }

      const result = await reportsService.getStockReport({
        vehicleType: query.vehicleType as any,
      });

      set.status = 200;
      return {
        success: true,
        data: result,
      };
    },
    {
      beforeHandle: authMiddleware,
      query: t.Object({
        startDate: t.Optional(t.String()),
        endDate: t.Optional(t.String()),
        vehicleType: t.Optional(t.String()),
      }),
      detail: {
        tags: ['Reports'],
        summary: 'Get stock report',
        description: 'Stock still on the lot (AVAILABLE + DEMO), summarized by brand',
      },
    }
  )
  .get(
    '/stock/pdf',
    async ({ query, set, requester }) => {
      if (!authService.hasPermission(requester!.role, 'REPORT_STOCK')) {
        set.status = 403;
        return 'Forbidden';
      }

      const result = await reportsService.getStockReport({
        vehicleType: query.vehicleType as any,
      });

      const dateRange = `ข้อมูล ณ วันที่ ${formatThaiDate(new Date(), 'full')}`;

      const header = await getCompanyHeader();
      if (!header.logoBase64) header.logoBase64 = pdfService.getLogoBase64();

      const pdfBuffer = await pdfService.generateStockReport({
        header,
        dateRange,
        stocks: result.stocks,
        summary: result.summary,
      });

      set.headers['Content-Type'] = 'application/pdf';
      set.headers['Content-Disposition'] = `attachment; filename="stock-report.pdf"`;

      return pdfBuffer;
    },
    {
      beforeHandle: authMiddleware,
      query: t.Object({
        startDate: t.Optional(t.String()),
        endDate: t.Optional(t.String()),
        vehicleType: t.Optional(t.String()),
      }),
    }
  )
  // ============================================
  // Profit & Loss Report
  // ============================================
  .get(
    '/profit-loss',
    async ({ query, set, requester }) => {
      // Check permission - REPORT_SALES + SALE_VIEW_PROFIT
      if (
        !authService.hasPermission(requester!.role, 'REPORT_SALES') ||
        !authService.hasPermission(requester!.role, 'SALE_VIEW_PROFIT')
      ) {
        set.status = 403;
        return {
          success: false,
          error: 'Forbidden',
          message: 'คุณไม่มีสิทธิ์ดูรายงานนี้',
        };
      }

      const startDate = query.startDate ? new Date(query.startDate) : undefined;
      const endDate = query.endDate ? new Date(query.endDate + 'T23:59:59.999Z') : undefined;

      const result = await reportsService.getProfitLossReport({
        startDate,
        endDate,
      });

      set.status = 200;
      return {
        success: true,
        data: result,
      };
    },
    {
      beforeHandle: authMiddleware,
      query: t.Object({
        startDate: t.Optional(t.String()),
        endDate: t.Optional(t.String()),
      }),
      detail: {
        tags: ['Reports'],
        summary: 'Get profit and loss report',
        description: 'Get sales profit/loss report including interest costs',
      },
    }
  )
  .get(
    '/profit-loss/pdf',
    async ({ query, set, requester }) => {
      if (
        !authService.hasPermission(requester!.role, 'REPORT_SALES') ||
        !authService.hasPermission(requester!.role, 'SALE_VIEW_PROFIT')
      ) {
        set.status = 403;
        return 'Forbidden';
      }

      const startDate = query.startDate ? new Date(query.startDate) : undefined;
      const endDate = query.endDate ? new Date(query.endDate + 'T23:59:59.999Z') : undefined;

      const result = await reportsService.getProfitLossReport({ startDate, endDate });

      const dateRange =
        startDate && endDate
          ? `${formatThaiDate(startDate, 'short')} - ${formatThaiDate(endDate, 'short')}`
          : `ทั้งหมด`;

      const header = await getCompanyHeader();
      if (!header.logoBase64) header.logoBase64 = pdfService.getLogoBase64();

      const pdfBuffer = await pdfService.generateProfitLossReport({
        header,
        dateRange,
        items: result.items,
        summary: result.summary,
      });

      set.headers['Content-Type'] = 'application/pdf';
      set.headers['Content-Disposition'] = `attachment; filename="profit-loss-report.pdf"`;

      return pdfBuffer;
    },
    {
      beforeHandle: authMiddleware,
      query: t.Object({
        startDate: t.Optional(t.String()),
        endDate: t.Optional(t.String()),
      }),
    }
  )
  // ============================================
  // Sales Summary Report
  // ============================================
  .get(
    '/sales-summary',
    async ({ query, set, requester }) => {
      // Check permission - REPORT_SALES
      if (!authService.hasPermission(requester!.role, 'REPORT_SALES')) {
        set.status = 403;
        return {
          success: false,
          error: 'Forbidden',
          message: 'คุณไม่มีสิทธิ์ดูรายงานนี้',
        };
      }

      const startDate = query.startDate ? new Date(query.startDate) : undefined;
      const endDate = query.endDate ? new Date(query.endDate + 'T23:59:59.999Z') : undefined;

      const result = await reportsService.getSalesSummaryReport({
        startDate,
        endDate,
        status: query.status as any,
        salespersonId: query.salespersonId,
        vehicleType: query.vehicleType as any,
      });

      set.status = 200;
      return {
        success: true,
        data: result,
      };
    },
    {
      beforeHandle: authMiddleware,
      query: t.Object({
        startDate: t.Optional(t.String()),
        endDate: t.Optional(t.String()),
        status: t.Optional(
          t.Union([
            t.Literal('RESERVED'),
            t.Literal('PREPARING'),
            t.Literal('DELIVERED'),
            t.Literal('COMPLETED'),
            t.Literal('CANCELLED'),
          ])
        ),
        salespersonId: t.Optional(t.String()),
        vehicleType: t.Optional(t.String()),
      }),
      detail: {
        tags: ['Reports'],
        summary: 'Get sales summary report',
        description: 'Get sales summary report with breakdown by salesperson and status',
      },
    }
  )
  .get(
    '/sales-summary/pdf',
    async ({ query, set, requester }) => {
      if (!authService.hasPermission(requester!.role, 'REPORT_SALES')) {
        set.status = 403;
        return 'Forbidden';
      }

      const startDate = query.startDate ? new Date(query.startDate) : undefined;
      const endDate = query.endDate ? new Date(query.endDate + 'T23:59:59.999Z') : undefined;

      const result = await reportsService.getSalesSummaryReport({
        startDate,
        endDate,
        status: query.status as any,
        salespersonId: query.salespersonId,
      });

      const dateRange =
        startDate && endDate
          ? `${formatThaiDate(startDate, 'short')} - ${formatThaiDate(endDate, 'short')}`
          : `ทั้งหมด`;

      const header = await getCompanyHeader();
      if (!header.logoBase64) header.logoBase64 = pdfService.getLogoBase64();

      const pdfBuffer = await pdfService.generateSalesSummaryReport({
        header,
        dateRange,
        sales: result.sales,
        summary: result.summary,
        bySalesperson: result.bySalesperson,
      });

      set.headers['Content-Type'] = 'application/pdf';
      set.headers['Content-Disposition'] = `attachment; filename="sales-summary-report.pdf"`;

      return pdfBuffer;
    },
    {
      beforeHandle: authMiddleware,
      query: t.Object({
        startDate: t.Optional(t.String()),
        endDate: t.Optional(t.String()),
        status: t.Optional(t.String()),
        salespersonId: t.Optional(t.String()),
      }),
    }
  )
  // ============================================
  // Stock Interest Report
  // ============================================
  .get(
    '/stock-interest',
    async ({ query, set, requester }) => {
      // Check permission - INTEREST_VIEW
      if (!authService.hasPermission(requester!.role, 'INTEREST_VIEW' as any)) {
        set.status = 403;
        return {
          success: false,
          error: 'Forbidden',
          message: 'คุณไม่มีสิทธิ์ดูรายงานนี้',
        };
      }

      const isCalculating =
        query.isCalculating === 'true' ? true : query.isCalculating === 'false' ? false : undefined;

      const result = await reportsService.getStockInterestReport({
        startDate: query.startDate ? new Date(query.startDate) : undefined,
        endDate: query.endDate ? new Date(query.endDate) : undefined,
        status: query.status as any,
        isCalculating,
        brand: query.brand,
      });

      set.status = 200;
      return {
        success: true,
        data: result,
      };
    },
    {
      beforeHandle: authMiddleware,
      query: t.Object({
        startDate: t.Optional(t.String()),
        endDate: t.Optional(t.String()),
        status: t.Optional(
          t.Union([
            t.Literal('AVAILABLE'),
            t.Literal('RESERVED'),
            t.Literal('PREPARING'),
            t.Literal('SOLD'),
            t.Literal('DEMO'),
          ])
        ),
        isCalculating: t.Optional(t.String()),
        brand: t.Optional(t.String()),
      }),
      detail: {
        tags: ['Reports'],
        summary: 'Get stock interest report',
        description: 'Get stock interest report with accumulated interest calculations',
      },
    }
  )
  .get(
    '/stock-interest/pdf',
    async ({ query, set, requester }) => {
      if (!authService.hasPermission(requester!.role, 'INTEREST_VIEW' as any)) {
        set.status = 403;
        return 'Forbidden';
      }

      const isCalculating =
        query.isCalculating === 'true' ? true : query.isCalculating === 'false' ? false : undefined;

      const result = await reportsService.getStockInterestReport({
        startDate: query.startDate ? new Date(query.startDate) : undefined,
        endDate: query.endDate ? new Date(query.endDate) : undefined,
        status: query.status as any,
        isCalculating,
        brand: query.brand,
      });

      const dateRange =
        query.startDate && query.endDate
          ? `ช่วงวันที่ ${formatThaiDate(new Date(query.startDate), 'full')} ถึง ${formatThaiDate(new Date(query.endDate), 'full')}`
          : `ข้อมูล ณ วันที่ ${formatThaiDate(new Date(), 'full')}`;

      const header = await getCompanyHeader();
      if (!header.logoBase64) header.logoBase64 = pdfService.getLogoBase64();

      const pdfBuffer = await pdfService.generateStockInterestReport({
        header,
        dateRange,
        stocks: result.stocks,
        summary: result.summary,
      });

      set.headers['Content-Type'] = 'application/pdf';
      set.headers['Content-Disposition'] = `attachment; filename="stock-interest-report.pdf"`;

      return pdfBuffer;
    },
    {
      beforeHandle: authMiddleware,
      query: t.Object({
        startDate: t.Optional(t.String()),
        endDate: t.Optional(t.String()),
        status: t.Optional(t.String()),
        isCalculating: t.Optional(t.String()),
        brand: t.Optional(t.String()),
      }),
    }
  )
  // ============================================
  // Bank Interest Report (รายงานคำนวณดอกเบี้ยธนาคาร ต่องวด)
  // ============================================
  .get(
    '/bank-interest',
    async ({ query, set, requester }) => {
      // Check permission - INTEREST_VIEW
      if (!authService.hasPermission(requester!.role, 'INTEREST_VIEW' as any)) {
        set.status = 403;
        return {
          success: false,
          error: 'Forbidden',
          message: 'คุณไม่มีสิทธิ์ดูรายงานนี้',
        };
      }

      const cycleStart = new Date(query.startDate);
      const cycleEnd = new Date(query.endDate);
      if (Number.isNaN(cycleStart.getTime()) || Number.isNaN(cycleEnd.getTime())) {
        set.status = 400;
        return {
          success: false,
          error: 'BadRequest',
          message: 'startDate/endDate must be YYYY-MM-DD',
        };
      }

      const result = await reportsService.getBankInterestReport({ cycleStart, cycleEnd });

      set.status = 200;
      return {
        success: true,
        data: result,
      };
    },
    {
      beforeHandle: authMiddleware,
      query: t.Object({
        startDate: t.String(),
        endDate: t.String(),
      }),
      detail: {
        tags: ['Reports'],
        summary: 'Get bank interest report',
        description:
          'Bank-style per-cycle interest for financed stock (inclusive day count, matches bank bill)',
      },
    }
  )
  .get(
    '/bank-interest/pdf',
    async ({ query, set, requester }) => {
      if (!authService.hasPermission(requester!.role, 'INTEREST_VIEW' as any)) {
        set.status = 403;
        return 'Forbidden';
      }

      const cycleStart = new Date(query.startDate);
      const cycleEnd = new Date(query.endDate);
      if (Number.isNaN(cycleStart.getTime()) || Number.isNaN(cycleEnd.getTime())) {
        set.status = 400;
        return 'startDate/endDate must be YYYY-MM-DD';
      }

      const result = await reportsService.getBankInterestReport({ cycleStart, cycleEnd });

      // Due date defaults to end of cycle + 1 day if not provided.
      const dueDateObj = query.dueDate
        ? new Date(query.dueDate)
        : new Date(cycleEnd.getTime() + 24 * 60 * 60 * 1000);

      const dateRange = `${formatThaiDate(cycleStart, 'numeric')} ถึง ${formatThaiDate(
        cycleEnd,
        'numeric'
      )}`;
      const dueDate = formatThaiDate(dueDateObj, 'numeric');

      const header = await getCompanyHeader();
      if (!header.logoBase64) header.logoBase64 = pdfService.getLogoBase64();

      const pdfBuffer = await pdfService.generateBankInterestReport({
        header,
        dateRange,
        dueDate,
        rows: result.rows,
        summary: result.summary,
      });

      set.headers['Content-Type'] = 'application/pdf';
      set.headers['Content-Disposition'] = `attachment; filename="bank-interest-report.pdf"`;

      return pdfBuffer;
    },
    {
      beforeHandle: authMiddleware,
      query: t.Object({
        startDate: t.String(),
        endDate: t.String(),
        dueDate: t.Optional(t.String()),
      }),
    }
  )
  // ============================================
  // Purchase Requirement Report
  // ============================================
  .get(
    '/purchase-requirement',
    async ({ query, set, requester }) => {
      // Check permission - REPORT_STOCK
      if (!authService.hasPermission(requester!.role, 'REPORT_STOCK')) {
        set.status = 403;
        return {
          success: false,
          error: 'Forbidden',
          message: 'คุณไม่มีสิทธิ์ดูรายงานนี้',
        };
      }

      const result = await reportsService.getPurchaseRequirementReport({
        brand: query.brand,
      });

      set.status = 200;
      return {
        success: true,
        data: result,
      };
    },
    {
      beforeHandle: authMiddleware,
      query: t.Object({
        brand: t.Optional(t.String()),
      }),
      detail: {
        tags: ['Reports'],
        summary: 'Get purchase requirement report',
        description:
          'Get report of vehicles that need to be purchased based on reservations vs available stock',
      },
    }
  )
  .get(
    '/purchase-requirement/pdf',
    async ({ query, set, requester }) => {
      if (!authService.hasPermission(requester!.role, 'REPORT_STOCK')) {
        set.status = 403;
        return 'Forbidden';
      }

      const result = await reportsService.getPurchaseRequirementReport({
        brand: query.brand,
      });

      const dateRange = `ข้อมูล ณ วันที่ ${formatThaiDate(new Date(), 'full')}`;

      const header = await getCompanyHeader();
      if (!header.logoBase64) header.logoBase64 = pdfService.getLogoBase64();

      const pdfBuffer = await pdfService.generatePurchaseRequirementReport({
        header,
        dateRange,
        items: result.items,
        summary: result.summary,
      });

      set.headers['Content-Type'] = 'application/pdf';
      set.headers['Content-Disposition'] = `attachment; filename="purchase-requirement-report.pdf"`;

      return pdfBuffer;
    },
    {
      beforeHandle: authMiddleware,
      query: t.Object({
        brand: t.Optional(t.String()),
      }),
    }
  )
  // ============================================
  // Daily Stock Snapshot Report
  // ============================================
  .get(
    '/daily-stock-snapshot',
    async ({ query, set, requester }) => {
      if (!authService.hasPermission(requester!.role, 'REPORT_STOCK')) {
        set.status = 403;
        return {
          success: false,
          error: 'Forbidden',
          message: 'คุณไม่มีสิทธิ์ดูรายงานนี้',
        };
      }

      const date = new Date(query.date);
      if (Number.isNaN(date.getTime())) {
        set.status = 400;
        return { success: false, error: 'BadRequest', message: 'date must be YYYY-MM-DD' };
      }

      const result = await reportsService.getDailyStockSnapshot({ date });

      set.status = 200;
      return { success: true, data: result };
    },
    {
      beforeHandle: authMiddleware,
      query: t.Object({
        date: t.String(),
      }),
      detail: {
        tags: ['Reports'],
        summary: 'Daily stock snapshot',
        description:
          'Reservations / available / demo / required pivot by model × color on a given date',
      },
    }
  )
  // ============================================
  // Monthly Purchases Report
  // ============================================
  .get(
    '/monthly-purchases',
    async ({ query, set, requester }) => {
      if (!authService.hasPermission(requester!.role, 'REPORT_STOCK')) {
        set.status = 403;
        return {
          success: false,
          error: 'Forbidden',
          message: 'คุณไม่มีสิทธิ์ดูรายงานนี้',
        };
      }

      const year = Number(query.year);
      const month = Number(query.month);
      if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
        set.status = 400;
        return { success: false, error: 'BadRequest', message: 'year/month invalid' };
      }

      const result = await reportsService.getMonthlyPurchasesReport({
        year,
        month,
        vehicleType: query.vehicleType as any,
      });

      set.status = 200;
      return { success: true, data: result };
    },
    {
      beforeHandle: authMiddleware,
      query: t.Object({
        year: t.String(),
        month: t.String(),
        vehicleType: t.Optional(t.String()),
      }),
      detail: {
        tags: ['Reports'],
        summary: 'Monthly purchases report',
        description: 'All stock intake for a given month, optionally filtered by vehicleType',
      },
    }
  )
  // ============================================
  // Monthly Campaign Claim Report (brand submission)
  // ============================================
  .get(
    '/campaign-claims',
    async ({ query, set, requester }) => {
      if (!authService.hasPermission(requester!.role, 'CAMPAIGN_VIEW')) {
        set.status = 403;
        return {
          success: false,
          error: 'Forbidden',
          message: 'คุณไม่มีสิทธิ์ดูรายงานนี้',
        };
      }

      const startDate = new Date(`${query.startDate}T00:00:00`);
      const endDate = new Date(`${query.endDate}T00:00:00`);
      if (isNaN(startDate.getTime()) || isNaN(endDate.getTime()) || startDate > endDate) {
        set.status = 400;
        return { success: false, error: 'BadRequest', message: 'startDate/endDate invalid' };
      }
      if (!query.brand) {
        set.status = 400;
        return { success: false, error: 'BadRequest', message: 'brand is required' };
      }

      const result = await reportsService.getCampaignClaimReport({
        startDate,
        endDate,
        brand: query.brand,
        campaignId: query.campaignId || undefined,
      });

      set.status = 200;
      return { success: true, data: result };
    },
    {
      beforeHandle: authMiddleware,
      query: t.Object({
        startDate: t.String(),
        endDate: t.String(),
        brand: t.String(),
        campaignId: t.Optional(t.String()),
      }),
      detail: {
        tags: ['Reports'],
        summary: 'Monthly campaign claim report',
        description:
          'Campaign claim rows for a date range, filtered by vehicle brand and optionally by campaign, in brand submission format',
      },
    }
  );
