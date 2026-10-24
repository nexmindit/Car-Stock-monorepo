import { Elysia, t } from 'elysia';
import { stockService } from './stock.service';
import { authMiddleware, requirePermission } from '../auth/auth.middleware';
import { authService } from '../auth/auth.service';
import '../../types/context.d';

export const stockRoutes = new Elysia({ prefix: '/stock' })
  // Get all stock
  .get(
    '/',
    async ({ query, set, requester }) => {
      const result = await stockService.getAllStock(query, requester!);
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
        vehicleModelId: t.Optional(t.String()),
        brand: t.Optional(t.String()),
        model: t.Optional(t.String()),
        exteriorColor: t.Optional(t.String()),
        interiorColor: t.Optional(t.String()),
      }),
      detail: {
        tags: ['Stock'],
        summary: 'Get all stock',
        description: 'Get stock with pagination and filters',
      },
    }
  )
  // Get stock statistics
  .get(
    '/stats',
    async ({ set, requester }) => {
      const stats = await stockService.getStockStats(requester!);
      set.status = 200;
      return {
        success: true,
        data: stats,
      };
    },
    {
      beforeHandle: authMiddleware,
      detail: {
        tags: ['Stock'],
        summary: 'Get stock statistics',
        description: 'Get overview statistics for stock',
      },
    }
  )
  // Distinct brand/model/colour values for filter dropdowns
  .get(
    '/filter-options',
    async ({ set, requester }) => {
      const options = await stockService.getFilterOptions(requester!);
      set.status = 200;
      return {
        success: true,
        data: options,
      };
    },
    {
      beforeHandle: authMiddleware,
      detail: {
        tags: ['Stock'],
        summary: 'Get stock filter options',
        description: 'Distinct brand/model and colours present in stock',
      },
    }
  )
  // Get available stock for sales
  .get(
    '/available',
    async ({ set, requester }) => {
      // Check permission
      if (!authService.hasPermission(requester!.role, 'STOCK_VIEW' as any)) {
        set.status = 403;
        return {
          success: false,
          error: 'Forbidden',
          message: 'Insufficient permissions',
        };
      }

      const stocks = await stockService.getAvailableStock();
      set.status = 200;
      return {
        success: true,
        data: stocks,
      };
    },
    {
      beforeHandle: authMiddleware,
      detail: {
        tags: ['Stock'],
        summary: 'Get available stock',
        description:
          'Stock list for sales picker: AVAILABLE + DEMO (DEMO sellable only when the demo-sale setting allows the role)',
      },
    }
  )
  // Get stock by ID
  .get(
    '/:id',
    async ({ params, set, requester }) => {
      const stock = await stockService.getStockById(params.id, requester!);
      set.status = 200;
      return {
        success: true,
        data: stock,
      };
    },
    {
      beforeHandle: authMiddleware,
      detail: {
        tags: ['Stock'],
        summary: 'Get stock by ID',
        description: 'Get a specific stock item with detailed information',
      },
    }
  )
  // Create stock
  .post(
    '/',
    async ({ body, set, requester }) => {
      // Convert string numbers to actual numbers
      const processedBody = {
        ...body,
        baseCost: typeof body.baseCost === 'string' ? parseFloat(body.baseCost) : body.baseCost,
        transportCost: typeof body.transportCost === 'string' ? parseFloat(body.transportCost) : body.transportCost,
        accessoryCost: typeof body.accessoryCost === 'string' ? parseFloat(body.accessoryCost) : body.accessoryCost,
        otherCosts: typeof body.otherCosts === 'string' ? parseFloat(body.otherCosts) : body.otherCosts,
        interestRate: typeof body.interestRate === 'string' ? parseFloat(body.interestRate) : body.interestRate,
        expectedSalePrice: body.expectedSalePrice !== undefined && typeof body.expectedSalePrice === 'string'
          ? parseFloat(body.expectedSalePrice)
          : body.expectedSalePrice,
      };

      const stock = await stockService.createStock(processedBody, requester!);
      set.status = 201;
      return {
        success: true,
        data: stock,
        message: 'Stock created successfully',
      };
    },
    {
      beforeHandle: [authMiddleware, requirePermission('STOCK_CREATE')],
      body: t.Object({
        vin: t.String({ minLength: 1 }),
        engineNumber: t.Optional(t.String()),
        motorNumber1: t.Optional(t.String()),
        motorNumber2: t.Optional(t.String()),
        vehicleModelId: t.String({ minLength: 1 }),
        exteriorColor: t.String({ minLength: 1 }),
        interiorColor: t.Optional(t.String()),
        arrivalDate: t.Optional(t.Union([t.Date(), t.Null()])),
        orderDate: t.Optional(t.Union([t.Date(), t.Null()])),
        parkingSlot: t.Optional(t.String()),
        status: t.Optional(
          t.Union([t.Literal('AVAILABLE'), t.Literal('DEMO')])
        ),
        baseCost: t.Union([t.String(), t.Number()]),
        transportCost: t.Union([t.String(), t.Number()]),
        accessoryCost: t.Union([t.String(), t.Number()]),
        otherCosts: t.Union([t.String(), t.Number()]),
        financeProvider: t.Optional(t.String()),
        interestRate: t.Union([t.String(), t.Number()]),
        interestPrincipalBase: t.Union([
          t.Literal('BASE_COST_ONLY'),
          t.Literal('TOTAL_COST'),
        ]),
        expectedSalePrice: t.Optional(t.Union([t.String(), t.Number(), t.Null()])),
        notes: t.Optional(t.String()),
      }),
      detail: {
        tags: ['Stock'],
        summary: 'Create stock',
        description:
          'Create a new stock item (stock staff only). Status may be AVAILABLE or DEMO only.',
      },
    }
  )
  // Update stock
  .patch(
    '/:id',
    async ({ params, body, set, requester }) => {
      // Convert string numbers to actual numbers (only if the fields are present)
      const processedBody: any = { ...body };
      if (body.baseCost !== undefined) {
        processedBody.baseCost = typeof body.baseCost === 'string' ? parseFloat(body.baseCost) : body.baseCost;
      }
      if (body.transportCost !== undefined) {
        processedBody.transportCost = typeof body.transportCost === 'string' ? parseFloat(body.transportCost) : body.transportCost;
      }
      if (body.accessoryCost !== undefined) {
        processedBody.accessoryCost = typeof body.accessoryCost === 'string' ? parseFloat(body.accessoryCost) : body.accessoryCost;
      }
      if (body.otherCosts !== undefined) {
        processedBody.otherCosts = typeof body.otherCosts === 'string' ? parseFloat(body.otherCosts) : body.otherCosts;
      }
      if (body.interestRate !== undefined) {
        processedBody.interestRate = typeof body.interestRate === 'string' ? parseFloat(body.interestRate) : body.interestRate;
      }
      if (body.expectedSalePrice !== undefined) {
        processedBody.expectedSalePrice = typeof body.expectedSalePrice === 'string' ? parseFloat(body.expectedSalePrice) : body.expectedSalePrice;
      }

      const stock = await stockService.updateStock(params.id, processedBody, requester!);
      set.status = 200;
      return {
        success: true,
        data: stock,
        message: 'Stock updated successfully',
      };
    },
    {
      beforeHandle: [authMiddleware, requirePermission('STOCK_UPDATE')],
      body: t.Object({
        engineNumber: t.Optional(t.String()),
        motorNumber1: t.Optional(t.String()),
        motorNumber2: t.Optional(t.String()),
        exteriorColor: t.Optional(t.String()),
        interiorColor: t.Optional(t.String()),
        arrivalDate: t.Optional(t.Date()),
        orderDate: t.Optional(t.Date()),
        parkingSlot: t.Optional(t.String()),
        baseCost: t.Optional(t.Union([t.String(), t.Number()])),
        transportCost: t.Optional(t.Union([t.String(), t.Number()])),
        accessoryCost: t.Optional(t.Union([t.String(), t.Number()])),
        otherCosts: t.Optional(t.Union([t.String(), t.Number()])),
        financeProvider: t.Optional(t.String()),
        interestRate: t.Optional(t.Union([t.String(), t.Number()])),
        interestPrincipalBase: t.Optional(
          t.Union([t.Literal('BASE_COST_ONLY'), t.Literal('TOTAL_COST')])
        ),
        stopInterestCalc: t.Optional(t.Boolean()),
        interestStoppedAt: t.Optional(t.Date()),
        expectedSalePrice: t.Optional(t.Union([t.String(), t.Number()])),
        notes: t.Optional(t.String()),
      }),
      detail: {
        tags: ['Stock'],
        summary: 'Update stock',
        description: 'Update stock information',
      },
    }
  )
  // Update stock status
  .patch(
    '/:id/status',
    async ({ params, body, set, requester }) => {
      const stock = await stockService.updateStockStatus(
        params.id,
        body.status,
        body.notes,
        requester!
      );
      set.status = 200;
      return {
        success: true,
        data: stock,
        message: 'Stock status updated successfully',
      };
    },
    {
      beforeHandle: [authMiddleware, requirePermission('STOCK_UPDATE')],
      body: t.Object({
        // Manual endpoint accepts only AVAILABLE | DEMO; sales lifecycle goes through sales routes.
        status: t.Union([t.Literal('AVAILABLE'), t.Literal('DEMO')]),
        notes: t.Optional(t.String()),
      }),
      detail: {
        tags: ['Stock'],
        summary: 'Update stock status',
        description:
          'Manual status change: AVAILABLE ↔ DEMO only. RESERVED/PREPARING/SOLD go through sales.',
      },
    }
  )
  // Recalculate interest
  .post(
    '/:id/recalculate-interest',
    async ({ params, set, requester }) => {
      const stock = await stockService.recalculateInterest(params.id, requester!);
      set.status = 200;
      return {
        success: true,
        data: stock,
        message: 'Interest recalculated successfully',
      };
    },
    {
      beforeHandle: [authMiddleware, requirePermission('STOCK_UPDATE')],
      detail: {
        tags: ['Stock'],
        summary: 'Recalculate interest',
        description: 'Recalculate accumulated interest for stock',
      },
    }
  )
  // Delete stock
  .delete(
    '/:id',
    async ({ params, set, requester }) => {
      await stockService.deleteStock(params.id, requester!);
      set.status = 200;
      return {
        success: true,
        message: 'Stock deleted successfully',
      };
    },
    {
      beforeHandle: [authMiddleware, requirePermission('STOCK_DELETE')],
      detail: {
        tags: ['Stock'],
        summary: 'Delete stock',
        description: 'Delete a stock item (admin only, cannot delete sold stock)',
      },
    }
  );
