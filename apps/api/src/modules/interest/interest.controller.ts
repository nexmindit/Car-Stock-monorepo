import { Elysia, t } from 'elysia';
import { interestService } from './interest.service';
import { authMiddleware } from '../auth/auth.middleware';
import { authService } from '../auth/auth.service';
import { parseOptionalDay } from './interest.dates';
import '../../types/context.d';

export const interestRoutes = new Elysia({ prefix: '/interest' })
  // Get all stock with interest summary
  .get(
    '/',
    async ({ query, set, requester }) => {
      // Check permission - need INTEREST_VIEW
      if (!authService.hasPermission(requester!.role, 'INTEREST_VIEW' as any)) {
        set.status = 403;
        return {
          success: false,
          error: 'Forbidden',
          message: 'Insufficient permissions',
        };
      }

      const page = query.page ? parseInt(query.page) : 1;
      const limit = query.limit ? parseInt(query.limit) : 20;
      const isCalculating = query.isCalculating === 'true' ? true :
                            query.isCalculating === 'false' ? false : undefined;

      const result = await interestService.getAllStockInterest({
        page,
        limit,
        search: query.search,
        status: query.status as any,
        isCalculating,
      });

      set.status = 200;
      return {
        success: true,
        data: result.data,
        meta: result.meta,
      };
    },
    {
      beforeHandle: authMiddleware,
      query: t.Object({
        page: t.Optional(t.String()),
        limit: t.Optional(t.String()),
        search: t.Optional(t.String()),
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
      }),
      detail: {
        tags: ['Interest'],
        summary: 'Get all stock with interest summary',
        description: 'Get list of all stock with their accumulated interest',
      },
    }
  )
  // Get interest statistics
  .get(
    '/stats',
    async ({ set, requester }) => {
      // Check permission - need INTEREST_VIEW
      if (!authService.hasPermission(requester!.role, 'INTEREST_VIEW' as any)) {
        set.status = 403;
        return {
          success: false,
          error: 'Forbidden',
          message: 'Insufficient permissions',
        };
      }

      const stats = await interestService.getInterestStats();
      set.status = 200;
      return {
        success: true,
        data: stats,
      };
    },
    {
      beforeHandle: authMiddleware,
      detail: {
        tags: ['Interest'],
        summary: 'Get interest statistics',
        description: 'Get overall interest statistics for all stock',
      },
    }
  )
  .post(
    '/bulk/stop',
    async ({ body, set, requester }) => {
      if (!authService.hasPermission(requester!.role, 'INTEREST_UPDATE' as any)) {
        set.status = 403;
        return {
          success: false,
          error: 'Forbidden',
          message: 'Insufficient permissions',
        };
      }

      const result = await interestService.bulkStopInterest(
        {
          stockIds: body.stockIds,
          matchFilters: body.matchFilters,
          excludeStockIds: body.excludeStockIds,
          notes: body.notes,
          stopDate: parseOptionalDay(body.stopDate),
        },
        requester!.id
      );

      set.status = 200;
      return { success: true, data: result };
    },
    {
      beforeHandle: authMiddleware,
      body: t.Object({
        stockIds: t.Optional(t.Array(t.String())),
        excludeStockIds: t.Optional(t.Array(t.String())),
        matchFilters: t.Optional(
          t.Object({
            search: t.Optional(t.String()),
            status: t.Optional(
              t.Union([
                t.Literal('AVAILABLE'),
                t.Literal('RESERVED'),
                t.Literal('PREPARING'),
                t.Literal('SOLD'),
                t.Literal('DEMO'),
              ])
            ),
            isCalculating: t.Optional(t.Boolean()),
          })
        ),
        notes: t.Optional(t.String()),
        stopDate: t.Optional(t.String()),
      }),
      detail: {
        tags: ['Interest'],
        summary: 'Bulk stop interest calculation',
      },
    }
  )
  .post(
    '/bulk/apply-rate',
    async ({ body, set, requester }) => {
      if (!authService.hasPermission(requester!.role, 'INTEREST_UPDATE' as any)) {
        set.status = 403;
        return {
          success: false,
          error: 'Forbidden',
          message: 'Insufficient permissions',
        };
      }

      const result = await interestService.bulkApplyRate(
        {
          stockIds: body.stockIds,
          matchFilters: body.matchFilters,
          excludeStockIds: body.excludeStockIds,
          annualRate: body.annualRate,
          principalBase: body.principalBase,
          items: body.items,
          notes: body.notes,
          effectiveDate: parseOptionalDay(body.effectiveDate),
        },
        requester!.id
      );

      set.status = 200;
      return { success: true, data: result };
    },
    {
      beforeHandle: authMiddleware,
      body: t.Object({
        stockIds: t.Optional(t.Array(t.String())),
        excludeStockIds: t.Optional(t.Array(t.String())),
        matchFilters: t.Optional(
          t.Object({
            search: t.Optional(t.String()),
            status: t.Optional(
              t.Union([
                t.Literal('AVAILABLE'),
                t.Literal('RESERVED'),
                t.Literal('PREPARING'),
                t.Literal('SOLD'),
                t.Literal('DEMO'),
              ])
            ),
            isCalculating: t.Optional(t.Boolean()),
          })
        ),
        annualRate: t.Optional(t.Number({ minimum: 0, maximum: 100 })),
        principalBase: t.Optional(
          t.Union([t.Literal('KEEP'), t.Literal('BASE_COST_ONLY'), t.Literal('TOTAL_COST')])
        ),
        items: t.Optional(
          t.Array(
            t.Object({
              stockId: t.String(),
              annualRate: t.Number({ minimum: 0, maximum: 100 }),
              principalBase: t.Optional(
                t.Union([t.Literal('KEEP'), t.Literal('BASE_COST_ONLY'), t.Literal('TOTAL_COST')])
              ),
            })
          )
        ),
        notes: t.Optional(t.String()),
        effectiveDate: t.Optional(t.String()),
      }),
      detail: {
        tags: ['Interest'],
        summary: 'Bulk apply a new interest rate (update or resume)',
      },
    }
  )
  // Get interest detail for a specific stock
  .get(
    '/:stockId',
    async ({ params, set, requester }) => {
      // Check permission - need INTEREST_VIEW
      if (!authService.hasPermission(requester!.role, 'INTEREST_VIEW' as any)) {
        set.status = 403;
        return {
          success: false,
          error: 'Forbidden',
          message: 'Insufficient permissions',
        };
      }

      const result = await interestService.getStockInterestDetail(params.stockId);
      set.status = 200;
      return {
        success: true,
        data: result,
      };
    },
    {
      beforeHandle: authMiddleware,
      params: t.Object({
        stockId: t.String(),
      }),
      detail: {
        tags: ['Interest'],
        summary: 'Get interest detail for a stock',
        description: 'Get detailed interest information including all periods for a specific stock',
      },
    }
  )
  // Initialize interest period for a stock
  .post(
    '/:stockId/initialize',
    async ({ params, body, set, requester }) => {
      // Need INTEREST_UPDATE permission (ADMIN or ACCOUNTANT only)
      if (!authService.hasPermission(requester!.role, 'INTEREST_UPDATE' as any)) {
        set.status = 403;
        return {
          success: false,
          error: 'Forbidden',
          message: 'Insufficient permissions',
        };
      }

      const result = await interestService.initializeInterestPeriod(
        params.stockId,
        {
          annualRate: body.annualRate,
          principalBase: body.principalBase as any,
          startDate: parseOptionalDay(body.startDate),
          notes: body.notes,
        },
        requester!.id
      );

      set.status = 201;
      return {
        success: true,
        data: result,
        message: 'Interest period initialized successfully',
      };
    },
    {
      beforeHandle: authMiddleware,
      params: t.Object({
        stockId: t.String(),
      }),
      body: t.Object({
        annualRate: t.Number({ minimum: 0, maximum: 100 }),
        principalBase: t.Optional(t.Union([t.Literal('BASE_COST_ONLY'), t.Literal('TOTAL_COST')])),
        startDate: t.Optional(t.String()),
        notes: t.Optional(t.String()),
      }),
      detail: {
        tags: ['Interest'],
        summary: 'Initialize interest period',
        description: 'Initialize the first interest period for a stock that has no periods yet',
      },
    }
  )
  // Update interest rate (creates new period)
  .put(
    '/:stockId',
    async ({ params, body, set, requester }) => {
      // Need INTEREST_UPDATE permission (ADMIN or ACCOUNTANT only)
      if (!authService.hasPermission(requester!.role, 'INTEREST_UPDATE' as any)) {
        set.status = 403;
        return {
          success: false,
          error: 'Forbidden',
          message: 'Insufficient permissions',
        };
      }

      const result = await interestService.updateInterestRate(
        params.stockId,
        {
          annualRate: body.annualRate,
          principalBase: body.principalBase as any,
          effectiveDate: parseOptionalDay(body.effectiveDate),
          notes: body.notes,
        },
        requester!.id
      );

      set.status = 200;
      return {
        success: true,
        data: result,
        message: 'Interest rate updated successfully',
      };
    },
    {
      beforeHandle: authMiddleware,
      params: t.Object({
        stockId: t.String(),
      }),
      body: t.Object({
        annualRate: t.Number({ minimum: 0, maximum: 100 }),
        principalBase: t.Optional(t.Union([t.Literal('BASE_COST_ONLY'), t.Literal('TOTAL_COST')])),
        effectiveDate: t.Optional(t.String()),
        notes: t.Optional(t.String()),
      }),
      detail: {
        tags: ['Interest'],
        summary: 'Update interest rate',
        description: 'Update interest rate for a stock. This closes the current period and creates a new one.',
      },
    }
  )
  // Stop interest calculation
  .post(
    '/:stockId/stop',
    async ({ params, body, set, requester }) => {
      // Need INTEREST_UPDATE permission (ADMIN or ACCOUNTANT only)
      if (!authService.hasPermission(requester!.role, 'INTEREST_UPDATE' as any)) {
        set.status = 403;
        return {
          success: false,
          error: 'Forbidden',
          message: 'Insufficient permissions',
        };
      }

      await interestService.stopInterestCalculation(
        params.stockId,
        requester!.id,
        body?.notes,
        parseOptionalDay(body?.stopDate)
      );

      set.status = 200;
      return {
        success: true,
        message: 'Interest calculation stopped successfully',
      };
    },
    {
      beforeHandle: authMiddleware,
      params: t.Object({
        stockId: t.String(),
      }),
      body: t.Optional(
        t.Object({
          notes: t.Optional(t.String()),
          stopDate: t.Optional(t.String()),
        })
      ),
      detail: {
        tags: ['Interest'],
        summary: 'Stop interest calculation',
        description: 'Stop interest calculation for a stock',
      },
    }
  )
  // Recompute days + interest of every closed period
  .post(
    '/:stockId/recalculate',
    async ({ params, set, requester }) => {
      if (!authService.hasPermission(requester!.role, 'INTEREST_UPDATE' as any)) {
        set.status = 403;
        return { success: false, error: 'Forbidden', message: 'Insufficient permissions' };
      }

      await interestService.recalculateInterestPeriods(params.stockId, requester!.id);
      set.status = 200;
      return { success: true, message: 'Interest periods recalculated' };
    },
    {
      beforeHandle: authMiddleware,
      params: t.Object({ stockId: t.String() }),
      detail: { tags: ['Interest'], summary: 'Recalculate interest history' },
    }
  )
  // Delete one interest-history period
  .delete(
    '/:stockId/periods/:periodId',
    async ({ params, set, requester }) => {
      if (!authService.hasPermission(requester!.role, 'INTEREST_UPDATE' as any)) {
        set.status = 403;
        return { success: false, error: 'Forbidden', message: 'Insufficient permissions' };
      }

      await interestService.deleteInterestPeriod(params.stockId, params.periodId, requester!.id);
      set.status = 200;
      return { success: true, message: 'Interest period deleted' };
    },
    {
      beforeHandle: authMiddleware,
      params: t.Object({ stockId: t.String(), periodId: t.String() }),
      detail: { tags: ['Interest'], summary: 'Delete interest history period' },
    }
  )
  // Resume interest calculation
  .post(
    '/:stockId/resume',
    async ({ params, body, set, requester }) => {
      // Need INTEREST_UPDATE permission (ADMIN or ACCOUNTANT only)
      if (!authService.hasPermission(requester!.role, 'INTEREST_UPDATE' as any)) {
        set.status = 403;
        return {
          success: false,
          error: 'Forbidden',
          message: 'Insufficient permissions',
        };
      }

      const result = await interestService.resumeInterestCalculation(
        params.stockId,
        {
          annualRate: body.annualRate,
          principalBase: body.principalBase as any,
          notes: body.notes,
          startDate: parseOptionalDay(body.startDate),
        },
        requester!.id
      );

      set.status = 200;
      return {
        success: true,
        data: result,
        message: 'Interest calculation resumed successfully',
      };
    },
    {
      beforeHandle: authMiddleware,
      params: t.Object({
        stockId: t.String(),
      }),
      body: t.Object({
        annualRate: t.Number({ minimum: 0, maximum: 100 }),
        principalBase: t.Optional(t.Union([t.Literal('BASE_COST_ONLY'), t.Literal('TOTAL_COST')])),
        notes: t.Optional(t.String()),
        startDate: t.Optional(t.String()),
      }),
      detail: {
        tags: ['Interest'],
        summary: 'Resume interest calculation',
        description: 'Resume interest calculation for a stock that was previously stopped',
      },
    }
  )
  // ============================================
  // Debt Payment Management Endpoints
  // ============================================

  // Initialize debt for a stock
  .post(
    '/:stockId/debt/initialize',
    async ({ params, body, set, requester }) => {
      // Need INTEREST_UPDATE permission (ADMIN or ACCOUNTANT only)
      if (!authService.hasPermission(requester!.role, 'INTEREST_UPDATE' as any)) {
        set.status = 403;
        return {
          success: false,
          error: 'Forbidden',
          message: 'Insufficient permissions',
        };
      }

      await interestService.initializeDebt(
        params.stockId,
        body.debtAmount,
        requester!.id
      );

      set.status = 201;
      return {
        success: true,
        message: 'Debt initialized successfully',
      };
    },
    {
      beforeHandle: authMiddleware,
      params: t.Object({
        stockId: t.String(),
      }),
      body: t.Object({
        debtAmount: t.Number({ minimum: 0 }),
      }),
      detail: {
        tags: ['Interest', 'Debt'],
        summary: 'Initialize debt for a stock',
        description: 'Set up the initial debt amount for a stock financed through a provider',
      },
    }
  )
  // Record a debt payment
  .post(
    '/:stockId/debt/payment',
    async ({ params, body, set, requester }) => {
      // Need INTEREST_UPDATE permission (ADMIN or ACCOUNTANT only)
      if (!authService.hasPermission(requester!.role, 'INTEREST_UPDATE' as any)) {
        set.status = 403;
        return {
          success: false,
          error: 'Forbidden',
          message: 'Insufficient permissions',
        };
      }

      const result = await interestService.recordDebtPayment(
        params.stockId,
        {
          amount: body.amount,
          paymentMethod: body.paymentMethod as any,
          paymentType: body.paymentType as any,
          paymentDate: parseOptionalDay(body.paymentDate),
          referenceNumber: body.referenceNumber,
          notes: body.notes,
        },
        requester!.id
      );

      set.status = 201;
      return {
        success: true,
        data: result,
        message: result.debtPaidOff
          ? 'Debt fully paid off! Interest calculation stopped.'
          : 'Debt payment recorded successfully',
      };
    },
    {
      beforeHandle: authMiddleware,
      params: t.Object({
        stockId: t.String(),
      }),
      body: t.Object({
        amount: t.Number({ minimum: 0.01 }),
        paymentMethod: t.Union([
          t.Literal('CASH'),
          t.Literal('BANK_TRANSFER'),
          t.Literal('CHEQUE'),
          t.Literal('CREDIT_CARD'),
        ]),
        paymentType: t.Optional(t.Union([
          t.Literal('AUTO'),
          t.Literal('PRINCIPAL_ONLY'),
          t.Literal('INTEREST_ONLY'),
        ])),
        paymentDate: t.Optional(t.String()),
        referenceNumber: t.Optional(t.String()),
        notes: t.Optional(t.String()),
      }),
      detail: {
        tags: ['Interest', 'Debt'],
        summary: 'Record a debt payment',
        description: 'Record a payment towards the stock debt. paymentType: AUTO (pay interest first), PRINCIPAL_ONLY (pay principal only), INTEREST_ONLY (pay interest only).',
      },
    }
  )
  // Get debt payment history for a stock
  .get(
    '/:stockId/debt/payments',
    async ({ params, set, requester }) => {
      // Check permission - need INTEREST_VIEW
      if (!authService.hasPermission(requester!.role, 'INTEREST_VIEW' as any)) {
        set.status = 403;
        return {
          success: false,
          error: 'Forbidden',
          message: 'Insufficient permissions',
        };
      }

      const payments = await interestService.getDebtPayments(params.stockId);
      set.status = 200;
      return {
        success: true,
        data: payments,
      };
    },
    {
      beforeHandle: authMiddleware,
      params: t.Object({
        stockId: t.String(),
      }),
      detail: {
        tags: ['Interest', 'Debt'],
        summary: 'Get debt payment history',
        description: 'Get all debt payment records for a specific stock',
      },
    }
  )
  // Get debt summary for a stock
  .get(
    '/:stockId/debt/summary',
    async ({ params, set, requester }) => {
      // Check permission - need INTEREST_VIEW
      if (!authService.hasPermission(requester!.role, 'INTEREST_VIEW' as any)) {
        set.status = 403;
        return {
          success: false,
          error: 'Forbidden',
          message: 'Insufficient permissions',
        };
      }

      const summary = await interestService.getDebtSummary(params.stockId);
      set.status = 200;
      return {
        success: true,
        data: summary,
      };
    },
    {
      beforeHandle: authMiddleware,
      params: t.Object({
        stockId: t.String(),
      }),
      detail: {
        tags: ['Interest', 'Debt'],
        summary: 'Get debt summary',
        description: 'Get debt summary for a specific stock including payment stats',
      },
    }
  )
  // Get all stocks with outstanding debt
  .get(
    '/debts/outstanding',
    async ({ query, set, requester }) => {
      // Check permission - need INTEREST_VIEW
      if (!authService.hasPermission(requester!.role, 'INTEREST_VIEW' as any)) {
        set.status = 403;
        return {
          success: false,
          error: 'Forbidden',
          message: 'Insufficient permissions',
        };
      }

      const page = query.page ? parseInt(query.page) : 1;
      const limit = query.limit ? parseInt(query.limit) : 20;

      const result = await interestService.getOutstandingDebts({
        page,
        limit,
        search: query.search,
      });

      set.status = 200;
      return {
        success: true,
        data: result.data,
        meta: result.meta,
      };
    },
    {
      beforeHandle: authMiddleware,
      query: t.Object({
        page: t.Optional(t.String()),
        limit: t.Optional(t.String()),
        search: t.Optional(t.String()),
      }),
      detail: {
        tags: ['Interest', 'Debt'],
        summary: 'Get outstanding debts',
        description: 'Get all stocks with outstanding debt',
      },
    }
  )
  // Get debt statistics
  .get(
    '/debts/stats',
    async ({ set, requester }) => {
      // Check permission - need INTEREST_VIEW
      if (!authService.hasPermission(requester!.role, 'INTEREST_VIEW' as any)) {
        set.status = 403;
        return {
          success: false,
          error: 'Forbidden',
          message: 'Insufficient permissions',
        };
      }

      const stats = await interestService.getDebtStats();
      set.status = 200;
      return {
        success: true,
        data: stats,
      };
    },
    {
      beforeHandle: authMiddleware,
      detail: {
        tags: ['Interest', 'Debt'],
        summary: 'Get debt statistics',
        description: 'Get overall debt statistics for all stocks',
      },
    }
  );
