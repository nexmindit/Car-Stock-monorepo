import { Elysia, t } from 'elysia';
import { campaignsService } from './campaigns.service';
import { campaignFormulasService } from './campaign-formulas.service';
import { authMiddleware, requirePermission } from '../auth/auth.middleware';
import { pdfService } from '../pdf/pdf.service';
import { formatThaiDate, formatCurrency } from '../pdf/helpers';
import { db } from '../../lib/db';

// Expense model: percent rows show a bare "n%", fixed rows a bare baht amount.
// Legacy SUBTRACT keeps its minus sign for old rows.
const OPERATOR_SYMBOLS: Record<string, string> = {
  ADD: '',
  SUBTRACT: '-',
  MULTIPLY: '×',
  PERCENT: '',
  PERCENT_SUBTRACT: '',
  FIXED: '',
};

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

/**
 * Transform raw campaign report data into the shape expected by the PDF template.
 * Precomputes per-row indices, absolute values, colspan counts, and cross-model amount
 * arrays so the Handlebars template stays free of conditional arithmetic.
 */
function prepareCampaignReportForPdf(report: any) {
  const groups = report.groups || [];
  const allGroupsCount = groups.length;
  const hasMultipleGroups = allGroupsCount > 1;

  const allGroupHeaders = groups.map((g: any) => ({
    vehicleModelId: g.vehicleModelId,
    model: g.vehicleModel.model,
    variant: g.vehicleModel.variant || '',
  }));

  const preparedGroups = groups.map((group: any) => {
    const modelFullName = [
      group.vehicleModel.brand,
      group.vehicleModel.model,
      group.vehicleModel.variant,
    ]
      .filter(Boolean)
      .join(' ');

    const formulas = (group.formulas || []).map((f: any) => {
      const isPercent = f.operator === 'PERCENT' || f.operator === 'PERCENT_SUBTRACT';
      const operatorDisplay = `(${OPERATOR_SYMBOLS[f.operator] || ''}${
        isPercent ? `${f.value}%` : formatCurrency(f.value, false)
      })`;
      return {
        ...f,
        operatorDisplay,
        targetLabel: f.priceTarget === 'COST_PRICE' ? 'ทุน' : 'ขาย',
      };
    });

    const sales = (group.sales || []).map((s: any, idx: number) => ({
      ...s,
      rowIndex: idx + 1,
      // Kept for backward compatibility with any older callers; the report
      // now also uses rebatePerCar directly (positive = supplier owes).
      absCostPriceDiff: Math.abs(Number(s.costPriceDiff) || 0),
      vehicleModelAmounts: allGroupHeaders.map((h: any) =>
        h.vehicleModelId === group.vehicleModelId ? s.totalAmount : null
      ),
    }));

    const subtotalModelAmounts = allGroupHeaders.map((h: any) =>
      h.vehicleModelId === group.vehicleModelId ? group.totalAmount : null
    );

    const rebateSubtotal = sales.reduce(
      (sum: number, s: any) => sum + (Number(s.rebatePerCar) || 0),
      0
    );
    const financeCommissionSubtotal = sales.reduce(
      (sum: number, s: any) => sum + (Number(s.financeCommission) || 0),
      0
    );

    const subtotalLeftColspan = 7 + formulas.length;
    // Trailing columns: รวมรับเงิน, วันที่แจ้งขาย, Rebate, ค่าคอมไฟแนนซ์ = 4.
    const emptyRowColspan = subtotalLeftColspan + (hasMultipleGroups ? allGroupsCount : 0) + 4;

    return {
      ...group,
      modelFullName,
      hasFormulas: formulas.length > 0,
      formulas,
      sales,
      subtotalModelAmounts,
      subtotalLeftColspan,
      emptyRowColspan,
      rebateSubtotal,
      financeCommissionSubtotal,
    };
  });

  return {
    campaign: {
      ...report.campaign,
      createdByName: report.campaign.createdBy
        ? `${report.campaign.createdBy.firstName} ${report.campaign.createdBy.lastName}`
        : '-',
    },
    groups: preparedGroups,
    hasMultipleGroups,
    allGroupsCount,
    allGroupHeaders,
    summary: report.summary,
  };
}

export const campaignRoutes = new Elysia({ prefix: '/campaigns' })
  // Get all campaigns (ADMIN only)
  .get(
    '/',
    async ({ query, set }) => {
      const page = parseInt(query.page || '1');
      const limit = parseInt(query.limit || '20');
      const search = query.search;

      const result = await campaignsService.getAll(page, limit, search, query.branch);
      set.status = 200;
      return {
        success: true,
        data: result.data,
        meta: result.meta,
      };
    },
    {
      beforeHandle: [authMiddleware, requirePermission('CAMPAIGN_VIEW')],
      query: t.Object({
        page: t.Optional(t.String()),
        limit: t.Optional(t.String()),
        search: t.Optional(t.String()),
        branch: t.Optional(t.String()),
      }),
      detail: {
        tags: ['Campaigns'],
        summary: 'Get all campaigns',
        description: 'Get campaigns with pagination and search (ADMIN only)',
      },
    }
  )
  // Get distinct branch labels (must be before /:id)
  .get(
    '/branches',
    async () => {
      const branches = await campaignsService.getBranches();
      return { success: true, data: branches };
    },
    {
      beforeHandle: [authMiddleware],
      detail: { tags: ['Campaigns'], summary: 'Distinct campaign branch labels' },
    }
  )
  // Get active campaigns (for sales - any authenticated user)
  .get(
    '/active',
    async ({ set }) => {
      const campaigns = await campaignsService.getActiveCampaigns();
      set.status = 200;
      return {
        success: true,
        data: campaigns,
      };
    },
    {
      beforeHandle: [authMiddleware, requirePermission('CAMPAIGN_VIEW')],
      detail: {
        tags: ['Campaigns'],
        summary: 'Get active campaigns',
        description: 'Get currently active campaigns (ADMIN only)',
      },
    }
  )
  // Get campaign by ID (ADMIN only)
  .get(
    '/:id',
    async ({ params, set }) => {
      const campaign = await campaignsService.getById(params.id);
      if (!campaign) {
        set.status = 404;
        return {
          success: false,
          error: 'Not Found',
          message: 'Campaign not found',
        };
      }

      set.status = 200;
      return {
        success: true,
        data: campaign,
      };
    },
    {
      beforeHandle: [authMiddleware, requirePermission('CAMPAIGN_VIEW')],
      params: t.Object({
        id: t.String(),
      }),
      detail: {
        tags: ['Campaigns'],
        summary: 'Get campaign by ID',
        description: 'Get a single campaign by ID (ADMIN only)',
      },
    }
  )
  // Get campaign analytics (ADMIN only)
  .get(
    '/:id/analytics',
    async ({ params, query, set }) => {
      const startDate = query.startDate ? new Date(query.startDate) : undefined;
      const endDate = query.endDate ? new Date(query.endDate) : undefined;

      const result = await campaignsService.getAnalytics(params.id, startDate, endDate);
      set.status = 200;
      return {
        success: true,
        data: result,
      };
    },
    {
      beforeHandle: [authMiddleware, requirePermission('CAMPAIGN_VIEW')],
      params: t.Object({
        id: t.String(),
      }),
      query: t.Object({
        startDate: t.Optional(t.String()),
        endDate: t.Optional(t.String()),
      }),
      detail: {
        tags: ['Campaigns'],
        summary: 'Get campaign analytics',
        description: 'Get sales analytics for a campaign by vehicle model (ADMIN only)',
      },
    }
  )
  // Get vehicle models under campaign (ADMIN only)
  .get(
    '/:id/vehicle-models',
    async ({ params, set }) => {
      const vehicleModels = await campaignsService.getVehicleModels(params.id);
      set.status = 200;
      return {
        success: true,
        data: vehicleModels,
      };
    },
    {
      beforeHandle: [authMiddleware, requirePermission('CAMPAIGN_VIEW')],
      params: t.Object({
        id: t.String(),
      }),
      detail: {
        tags: ['Campaigns'],
        summary: 'Get vehicle models in campaign',
        description: 'Get all vehicle models associated with a campaign (ADMIN only)',
      },
    }
  )
  // Create campaign (ADMIN only)
  .post(
    '/',
    async ({ body, set, requester }) => {
      // Authorization is enforced by `requirePermission('CAMPAIGN_CREATE')` in
      // `beforeHandle`. A redundant role-literal check here would block any
      // non-ADMIN role that is legitimately granted CAMPAIGN_CREATE permission.

      const campaign = await campaignsService.create({
        ...body,
        startDate: new Date(body.startDate),
        endDate: new Date(body.endDate),
        createdById: requester.id,
      });

      set.status = 201;
      return {
        success: true,
        data: campaign,
        message: 'Campaign created successfully',
      };
    },
    {
      beforeHandle: [authMiddleware, requirePermission('CAMPAIGN_CREATE')],
      body: t.Object({
        name: t.String({ minLength: 1 }),
        description: t.Optional(t.String()),
        startDate: t.String(),
        endDate: t.String(),
        notes: t.Optional(t.String()),
        branch: t.Optional(t.String()),
        vehicleModelIds: t.Optional(t.Array(t.String())),
        status: t.Optional(t.Union([t.Literal('DRAFT'), t.Literal('ACTIVE')])),
      }),
      detail: {
        tags: ['Campaigns'],
        summary: 'Create campaign',
        description: 'Create a new campaign (ADMIN only)',
      },
    }
  )
  // Update campaign (ADMIN only)
  .put(
    '/:id',
    async ({ params, body, set, requester }) => {
      const existing = await campaignsService.getById(params.id);
      if (!existing) {
        set.status = 404;
        return {
          success: false,
          error: 'Not Found',
          message: 'Campaign not found',
        };
      }

      const campaign = await campaignsService.update(
        params.id,
        {
          ...body,
          startDate: body.startDate ? new Date(body.startDate) : undefined,
          endDate: body.endDate ? new Date(body.endDate) : undefined,
        },
        requester.id
      );

      set.status = 200;
      return {
        success: true,
        data: campaign,
        message: 'Campaign updated successfully',
      };
    },
    {
      beforeHandle: [authMiddleware, requirePermission('CAMPAIGN_UPDATE')],
      params: t.Object({
        id: t.String(),
      }),
      body: t.Object({
        name: t.Optional(t.String({ minLength: 1 })),
        description: t.Optional(t.String()),
        status: t.Optional(t.Union([t.Literal('DRAFT'), t.Literal('ACTIVE'), t.Literal('ENDED')])),
        startDate: t.Optional(t.String()),
        endDate: t.Optional(t.String()),
        notes: t.Optional(t.String()),
        branch: t.Optional(t.String()),
        vehicleModelIds: t.Optional(t.Array(t.String())),
      }),
      detail: {
        tags: ['Campaigns'],
        summary: 'Update campaign',
        description: 'Update an existing campaign (ADMIN only)',
      },
    }
  )
  // Duplicate campaign (ADMIN only)
  .post(
    '/:id/duplicate',
    async ({ params, set, requester }) => {
      const campaign = await campaignsService.duplicate(params.id, requester.id);
      set.status = 201;
      return { success: true, data: campaign, message: 'Campaign duplicated' };
    },
    {
      beforeHandle: [authMiddleware, requirePermission('CAMPAIGN_CREATE')],
      detail: { tags: ['Campaigns'], summary: 'Duplicate a campaign' },
    }
  )
  // Delete campaign (ADMIN only)
  .delete(
    '/:id',
    async ({ params, set, requester }) => {
      const existing = await campaignsService.getById(params.id);
      if (!existing) {
        set.status = 404;
        return {
          success: false,
          error: 'Not Found',
          message: 'Campaign not found',
        };
      }

      await campaignsService.delete(params.id, requester.id);
      set.status = 200;
      return {
        success: true,
        message: 'Campaign deleted successfully',
      };
    },
    {
      beforeHandle: [authMiddleware, requirePermission('CAMPAIGN_DELETE')],
      params: t.Object({
        id: t.String(),
      }),
      detail: {
        tags: ['Campaigns'],
        summary: 'Delete campaign',
        description: 'Delete a campaign (ADMIN only)',
      },
    }
  )
  // Add vehicle model to campaign (ADMIN only)
  .post(
    '/:id/vehicle-models',
    async ({ params, body, set }) => {
      await campaignsService.addVehicleModel(params.id, body.vehicleModelId);
      set.status = 201;
      return {
        success: true,
        message: 'Vehicle model added to campaign',
      };
    },
    {
      beforeHandle: [authMiddleware, requirePermission('CAMPAIGN_UPDATE')],
      params: t.Object({
        id: t.String(),
      }),
      body: t.Object({
        vehicleModelId: t.String(),
      }),
      detail: {
        tags: ['Campaigns'],
        summary: 'Add vehicle model to campaign',
        description: 'Add a vehicle model to a campaign (ADMIN only)',
      },
    }
  )
  // Remove vehicle model from campaign (ADMIN only)
  .delete(
    '/:id/vehicle-models/:modelId',
    async ({ params, set }) => {
      await campaignsService.removeVehicleModel(params.id, params.modelId);
      set.status = 200;
      return {
        success: true,
        message: 'Vehicle model removed from campaign',
      };
    },
    {
      beforeHandle: [authMiddleware, requirePermission('CAMPAIGN_UPDATE')],
      params: t.Object({
        id: t.String(),
        modelId: t.String(),
      }),
      detail: {
        tags: ['Campaigns'],
        summary: 'Remove vehicle model from campaign',
        description: 'Remove a vehicle model from a campaign (ADMIN only)',
      },
    }
  )
  // ============================================
  // Campaign Formula Routes
  // ============================================
  // Get formulas for a vehicle model in campaign
  .get(
    '/:id/vehicle-models/:modelId/formulas',
    async ({ params, set }) => {
      const formulas = await campaignFormulasService.getFormulas(params.id, params.modelId);
      set.status = 200;
      return { success: true, data: formulas };
    },
    {
      beforeHandle: [authMiddleware, requirePermission('CAMPAIGN_VIEW')],
      params: t.Object({ id: t.String(), modelId: t.String() }),
      detail: {
        tags: ['Campaign Formulas'],
        summary: 'Get formulas for vehicle model in campaign',
      },
    }
  )
  // Create formula
  .post(
    '/:id/vehicle-models/:modelId/formulas',
    async ({ params, body, set }) => {
      const formula = await campaignFormulasService.create({
        campaignId: params.id,
        vehicleModelId: params.modelId,
        name: body.name,
        operator: body.operator as any,
        value: body.value,
        priceTarget: body.priceTarget as any,
        sortOrder: body.sortOrder,
      });
      set.status = 201;
      return { success: true, data: formula, message: 'Formula created successfully' };
    },
    {
      beforeHandle: [authMiddleware, requirePermission('CAMPAIGN_UPDATE')],
      params: t.Object({ id: t.String(), modelId: t.String() }),
      body: t.Object({
        name: t.String({ minLength: 1 }),
        operator: t.Union([
          t.Literal('ADD'),
          t.Literal('SUBTRACT'),
          t.Literal('MULTIPLY'),
          t.Literal('PERCENT'),
          t.Literal('PERCENT_SUBTRACT'),
          t.Literal('FIXED'),
        ]),
        value: t.Number(),
        priceTarget: t.Union([t.Literal('COST_PRICE'), t.Literal('SELLING_PRICE')]),
        sortOrder: t.Optional(t.Number()),
      }),
      detail: {
        tags: ['Campaign Formulas'],
        summary: 'Create formula for vehicle model in campaign',
      },
    }
  )
  // Update formula
  .put(
    '/:id/vehicle-models/:modelId/formulas/:formulaId',
    async ({ params, body, set }) => {
      const formula = await campaignFormulasService.update(params.formulaId, {
        name: body.name,
        operator: body.operator as any,
        value: body.value,
        priceTarget: body.priceTarget as any,
        sortOrder: body.sortOrder,
      });
      set.status = 200;
      return { success: true, data: formula, message: 'Formula updated successfully' };
    },
    {
      beforeHandle: [authMiddleware, requirePermission('CAMPAIGN_UPDATE')],
      params: t.Object({ id: t.String(), modelId: t.String(), formulaId: t.String() }),
      body: t.Object({
        name: t.Optional(t.String({ minLength: 1 })),
        operator: t.Optional(
          t.Union([
            t.Literal('ADD'),
            t.Literal('SUBTRACT'),
            t.Literal('MULTIPLY'),
            t.Literal('PERCENT'),
            t.Literal('PERCENT_SUBTRACT'),
            t.Literal('FIXED'),
          ])
        ),
        value: t.Optional(t.Number()),
        priceTarget: t.Optional(
          t.Union([t.Literal('COST_PRICE'), t.Literal('SELLING_PRICE')])
        ),
        sortOrder: t.Optional(t.Number()),
      }),
      detail: {
        tags: ['Campaign Formulas'],
        summary: 'Update formula',
      },
    }
  )
  // Delete formula
  .delete(
    '/:id/vehicle-models/:modelId/formulas/:formulaId',
    async ({ params, set }) => {
      await campaignFormulasService.delete(params.formulaId);
      set.status = 200;
      return { success: true, message: 'Formula deleted successfully' };
    },
    {
      beforeHandle: [authMiddleware, requirePermission('CAMPAIGN_UPDATE')],
      params: t.Object({ id: t.String(), modelId: t.String(), formulaId: t.String() }),
      detail: {
        tags: ['Campaign Formulas'],
        summary: 'Delete formula',
      },
    }
  )
  // Reorder formulas
  .put(
    '/:id/vehicle-models/:modelId/formulas-reorder',
    async ({ params, body, set }) => {
      const formulas = await campaignFormulasService.reorder(
        params.id,
        params.modelId,
        body.items
      );
      set.status = 200;
      return { success: true, data: formulas, message: 'Formulas reordered successfully' };
    },
    {
      beforeHandle: [authMiddleware, requirePermission('CAMPAIGN_UPDATE')],
      params: t.Object({ id: t.String(), modelId: t.String() }),
      body: t.Object({
        items: t.Array(
          t.Object({
            formulaId: t.String(),
            sortOrder: t.Number(),
          })
        ),
      }),
      detail: {
        tags: ['Campaign Formulas'],
        summary: 'Reorder formulas for vehicle model in campaign',
      },
    }
  )
  // ============================================
  // Campaign Report Route
  // ============================================
  .get(
    '/:id/report',
    async ({ params, set }) => {
      const report = await campaignsService.getCampaignReport(params.id);
      set.status = 200;
      return { success: true, data: report };
    },
    {
      beforeHandle: [authMiddleware, requirePermission('CAMPAIGN_VIEW')],
      params: t.Object({ id: t.String() }),
      detail: {
        tags: ['Campaigns'],
        summary: 'Get campaign report data',
        description: 'Get report data for campaign with sold stocks grouped by model and formula calculations',
      },
    }
  )
  .get(
    '/:id/report/pdf',
    async ({ params, set }) => {
      const report = await campaignsService.getCampaignReport(params.id);
      const header = await getCompanyHeader();
      if (!header.logoBase64) header.logoBase64 = pdfService.getLogoBase64();

      const prepared = prepareCampaignReportForPdf(report);

      const now = new Date();
      const printedAt = `${formatThaiDate(now, 'full')} เวลา ${now
        .getHours()
        .toString()
        .padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;

      const pdfBuffer = await pdfService.generateCampaignReportPdf({
        header,
        ...prepared,
        printedAt,
      });

      set.headers['Content-Type'] = 'application/pdf';
      set.headers['Content-Disposition'] =
        `attachment; filename="campaign-report-${params.id}.pdf"`;

      return pdfBuffer;
    },
    {
      beforeHandle: [authMiddleware, requirePermission('CAMPAIGN_VIEW')],
      params: t.Object({ id: t.String() }),
      detail: {
        tags: ['Campaigns'],
        summary: 'Export campaign report as PDF',
      },
    }
  );
