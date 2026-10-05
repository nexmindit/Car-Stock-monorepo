import { db } from '../../lib/db';
import { NotFoundError, BadRequestError, ForbiddenError, ConflictError } from '../../lib/errors';
import { Prisma, CampaignStatus } from '@prisma/client';
import { formulaSubsidyAmount, sumCampaignSubsidies } from '@car-stock/shared/formulas';
import { diffModelSet } from './campaign-model-set.helpers';
import { buildClonedCampaign, type CloneSource } from './campaign-duplicate.helpers';
import { campaignFormulasService } from './campaign-formulas.service';

/**
 * Derive the display status of a campaign at read time. The stored
 * `campaign.status` column is never auto-updated when `endDate` passes,
 * so a once-ACTIVE campaign keeps reading "ACTIVE" forever unless someone
 * clicks "End" manually. Project it to "ENDED" here so every API consumer
 * (list, detail, report) sees a status that matches reality.
 *
 * Business-logic queries already filter on `endDate` (see e.g. the
 * applicable-campaign lookup), so the stored value being stale has no
 * effect on discount application — this fix is purely about UI accuracy.
 */
function getEffectiveStatus(status: CampaignStatus, endDate: Date): CampaignStatus {
  // Only project ACTIVE → ENDED. A DRAFT past its endDate is still a DRAFT —
  // it never ran, so calling it "ENDED" would falsely imply rebates accrued.
  if (status === 'ACTIVE' && endDate.getTime() < Date.now()) {
    return 'ENDED' as CampaignStatus;
  }
  return status;
}

interface CreateCampaignData {
  name: string;
  description?: string;
  startDate: Date;
  endDate: Date;
  notes?: string;
  branch?: string | null;
  vehicleModelIds?: string[];
  createdById: string;
}

interface UpdateCampaignData {
  name?: string;
  description?: string;
  status?: 'DRAFT' | 'ACTIVE' | 'ENDED';
  startDate?: Date;
  endDate?: Date;
  notes?: string;
  branch?: string | null;
  vehicleModelIds?: string[];
}

interface CampaignAnalytics {
  vehicleModelId: string;
  vehicleModel: {
    id: string;
    brand: string;
    model: string;
    variant?: string;
    year: number;
  };
  totalSales: number;
  totalAmount: number;
  directSales: number;
  reservationSales: number;
}

class CampaignsService {
  /**
   * Get all campaigns with pagination
   */
  async getAll(page: number = 1, limit: number = 20, search?: string, branch?: string) {
    const skip = (page - 1) * limit;
    const where: Prisma.CampaignWhereInput = {
      ...(search
        ? {
            OR: [
              { name: { contains: search, mode: 'insensitive' } },
              { description: { contains: search, mode: 'insensitive' } },
            ],
          }
        : {}),
      ...(branch ? { branch } : {}),
    };

    const [campaigns, total] = await Promise.all([
      db.campaign.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          createdBy: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
            },
          },
          vehicleModels: {
            include: {
              vehicleModel: {
                select: {
                  id: true,
                  brand: true,
                  model: true,
                  variant: true,
                  year: true,
                },
              },
            },
          },
          _count: {
            select: { sales: true },
          },
        },
      }),
      db.campaign.count({ where }),
    ]);

    const totalPages = Math.ceil(total / limit);

    return {
      data: campaigns.map((campaign) => ({
        ...campaign,
        status: getEffectiveStatus(campaign.status, campaign.endDate),
        vehicleModels: campaign.vehicleModels.map((vm) => vm.vehicleModel),
        salesCount: campaign._count.sales,
      })),
      meta: {
        total,
        page,
        limit,
        totalPages,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1,
      },
    };
  }

  /** Distinct, non-empty branch labels across all campaigns, sorted. */
  async getBranches(): Promise<string[]> {
    const rows = await db.campaign.findMany({
      where: { branch: { not: null } },
      distinct: ['branch'],
      select: { branch: true },
      orderBy: { branch: 'asc' },
    });
    return rows
      .map((r) => r.branch)
      .filter((b): b is string => !!b && b.trim().length > 0);
  }

  /**
   * Get campaign by ID
   */
  async getById(id: string) {
    const campaign = await db.campaign.findUnique({
      where: { id },
      include: {
        createdBy: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
          },
        },
        vehicleModels: {
          include: {
            vehicleModel: {
              select: {
                id: true,
                brand: true,
                model: true,
                variant: true,
                year: true,
                price: true,
                standardCost: true,
              },
            },
          },
        },
        _count: {
          select: { sales: true },
        },
      },
    });

    if (!campaign) return null;

    return {
      ...campaign,
      status: getEffectiveStatus(campaign.status, campaign.endDate),
      vehicleModels: campaign.vehicleModels.map((vm) => vm.vehicleModel),
      salesCount: campaign._count.sales,
    };
  }

  /**
   * Create a new campaign
   */
  async create(data: CreateCampaignData) {
    const { vehicleModelIds, ...campaignData } = data;

    if (campaignData.startDate && campaignData.endDate && campaignData.startDate > campaignData.endDate) {
      throw new BadRequestError('วันเริ่มต้นต้องอยู่ก่อนวันสิ้นสุด');
    }

    // Past windows are allowed: dealers set campaigns up retroactively when the
    // brand announces them late. Existing sales get linked on activation via
    // tagRetroactiveSales().

    const campaign = await db.$transaction(async (tx) => {
      const created = await tx.campaign.create({
        data: {
          ...campaignData,
          vehicleModels: vehicleModelIds?.length
            ? {
                create: vehicleModelIds.map((vehicleModelId) => ({
                  vehicleModelId,
                })),
              }
            : undefined,
        },
        include: {
          createdBy: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
            },
          },
          vehicleModels: {
            include: {
              vehicleModel: {
                select: {
                  id: true,
                  brand: true,
                  model: true,
                  variant: true,
                  year: true,
                },
              },
            },
          },
        },
      });

      await tx.activityLog.create({
        data: {
          userId: campaignData.createdById,
          action: 'CREATE_CAMPAIGN',
          entity: 'CAMPAIGN',
          entityId: created.id,
          details: {
            campaignName: created.name,
            vehicleModelCount: vehicleModelIds?.length || 0,
          },
        },
      });

      return created;
    });

    return {
      ...campaign,
      vehicleModels: campaign.vehicleModels.map((vm) => vm.vehicleModel),
    };
  }

  /** Clone a campaign (models + formulas), next-month dates, status DRAFT. */
  async duplicate(id: string, userId: string) {
    const source = await db.campaign.findUnique({
      where: { id },
      include: {
        vehicleModels: { include: { formulas: true } },
      },
    });
    if (!source) throw new NotFoundError('ไม่พบแคมเปญ');

    const cloneSource: CloneSource = {
      name: source.name,
      description: source.description,
      branch: source.branch,
      notes: source.notes,
      startDate: source.startDate,
      endDate: source.endDate,
      vehicleModelIds: source.vehicleModels.map((vm) => vm.vehicleModelId),
      formulas: source.vehicleModels.flatMap((vm) =>
        vm.formulas.map((f) => ({
          vehicleModelId: f.vehicleModelId,
          name: f.name,
          operator: f.operator,
          value: Number(f.value),
          priceTarget: f.priceTarget,
          sortOrder: f.sortOrder,
        }))
      ),
    };

    const cloned = buildClonedCampaign(cloneSource);

    const created = await db.$transaction(async (tx) => {
      const campaign = await tx.campaign.create({
        data: {
          name: cloned.name,
          description: cloned.description,
          branch: cloned.branch,
          notes: cloned.notes,
          status: cloned.status,
          startDate: cloned.startDate,
          endDate: cloned.endDate,
          createdById: userId,
          vehicleModels: {
            create: cloned.vehicleModelIds.map((vehicleModelId) => ({ vehicleModelId })),
          },
        },
      });
      if (cloned.formulas.length) {
        await tx.campaignModelFormula.createMany({
          data: cloned.formulas.map((f) => ({
            campaignId: campaign.id,
            vehicleModelId: f.vehicleModelId,
            name: f.name,
            operator: f.operator,
            value: f.value,
            priceTarget: f.priceTarget,
            sortOrder: f.sortOrder,
          })),
        });
      }
      await tx.activityLog.create({
        data: {
          userId,
          action: 'CREATE_CAMPAIGN',
          entity: 'CAMPAIGN',
          entityId: campaign.id,
          details: {
            campaignName: campaign.name,
            vehicleModelCount: cloned.vehicleModelIds.length,
            duplicatedFrom: id,
          },
        },
      });
      return campaign;
    });

    return this.getById(created.id);
  }

  /**
   * Guard against two ACTIVE campaigns covering the same vehicle model in
   * overlapping date windows. This is the rule that lets auto-tag at sale
   * creation be deterministic — at most one ACTIVE campaign per (model,
   * day) means there is exactly one candidate to attach.
   *
   * DRAFT/ENDED campaigns never auto-tag, so overlaps with them are fine
   * and we skip the check for those statuses.
   *
   * Date overlap uses the standard interval formula:
   *   A.start <= B.end  AND  B.start <= A.end
   */
  private async assertNoActiveOverlap(
    vehicleModelIds: string[] | undefined,
    startDate: Date | undefined,
    endDate: Date | undefined,
    effectiveStatus: CampaignStatus,
    excludeCampaignId?: string
  ) {
    if (effectiveStatus !== 'ACTIVE') return;
    if (!vehicleModelIds?.length || !startDate || !endDate) return;

    // A stored-ACTIVE campaign whose endDate is already past can never
    // auto-tag a new sale, so it does not actually compete for the same
    // (model, today) slot — exclude it from the conflict check. This keeps
    // the rule aligned with the auto-tag query in sales.service.ts.
    const now = new Date();

    const conflict = await db.campaign.findFirst({
      where: {
        id: excludeCampaignId ? { not: excludeCampaignId } : undefined,
        status: 'ACTIVE',
        AND: [
          { startDate: { lte: endDate } },
          { endDate: { gte: startDate } },
          { endDate: { gte: now } },
        ],
        vehicleModels: {
          some: { vehicleModelId: { in: vehicleModelIds } },
        },
      },
      include: {
        vehicleModels: {
          where: { vehicleModelId: { in: vehicleModelIds } },
          include: { vehicleModel: { select: { brand: true, model: true } } },
        },
      },
    });

    if (conflict) {
      const models = conflict.vehicleModels
        .map((vm) => `${vm.vehicleModel.brand} ${vm.vehicleModel.model}`)
        .join(', ');
      throw new BadRequestError(
        `แคมเปญทับซ้อนกับ "${conflict.name}" ในช่วงเวลาเดียวกันสำหรับรุ่น: ${models}`
      );
    }
  }

  /**
   * Update campaign
   */
  async update(id: string, data: UpdateCampaignData, userId?: string) {
    const { vehicleModelIds, ...campaignData } = data;

    if (campaignData.startDate && campaignData.endDate && campaignData.startDate > campaignData.endDate) {
      throw new BadRequestError('วันเริ่มต้นต้องอยู่ก่อนวันสิ้นสุด');
    }

    // Resolve the *effective* post-update state (status, dates, models) by
    // merging the patch against the current row, then enforce the no-active-
    // overlap rule. We do this outside the transaction since it is read-only.
    const current = await db.campaign.findUnique({
      where: { id },
      include: { vehicleModels: { select: { vehicleModelId: true } } },
    });
    if (!current) throw new NotFoundError('Campaign');

    await this.assertNoActiveOverlap(
      vehicleModelIds ?? current.vehicleModels.map((vm) => vm.vehicleModelId),
      campaignData.startDate ?? current.startDate,
      campaignData.endDate ?? current.endDate,
      (campaignData.status ?? current.status) as CampaignStatus,
      id
    );

    // Guard against orphaning already-tagged sales by removing the vehicle
    // model they were attached under. The campaign report joins each sale
    // back to a model in `campaign.vehicleModels`; if that model is gone,
    // the report silently drops the sale — which can lose rebate claims.
    if (vehicleModelIds !== undefined) {
      const taggedSales = await db.sale.findMany({
        where: { campaignId: id, status: { notIn: ['CANCELLED'] } },
        select: {
          vehicleModelId: true,
          stock: { select: { vehicleModelId: true } },
        },
      });
      const newSet = new Set(vehicleModelIds);
      const orphans = taggedSales.filter((s) => {
        const effective = s.stock?.vehicleModelId ?? s.vehicleModelId;
        return effective && !newSet.has(effective);
      });
      if (orphans.length > 0) {
        throw new BadRequestError(
          `ไม่สามารถลบรุ่นรถออกได้ มีใบขาย ${orphans.length} ใบที่ผูกกับรุ่นที่กำลังจะถูกลบ — กรุณายกเลิกใบขายเหล่านั้นก่อนหรือคงรุ่นรถไว้`
        );
      }
    }

    const campaign = await db.$transaction(async (tx) => {
      // Diff the model set instead of wiping it. A blanket deleteMany +
      // recreate cascade-deletes every CampaignModelFormula (the relation is
      // onDelete: Cascade), so any edit to the campaign — even one that leaves
      // the model list unchanged — silently destroyed all saved formulas.
      // Only touch rows that actually changed; unchanged models keep theirs.
      if (vehicleModelIds !== undefined) {
        const { toAdd, toRemove } = diffModelSet(
          current.vehicleModels.map((vm) => vm.vehicleModelId),
          vehicleModelIds
        );

        if (toRemove.length > 0) {
          await tx.campaignVehicleModel.deleteMany({
            where: { campaignId: id, vehicleModelId: { in: toRemove } },
          });
        }

        if (toAdd.length > 0) {
          await tx.campaignVehicleModel.createMany({
            data: toAdd.map((vehicleModelId) => ({
              campaignId: id,
              vehicleModelId,
            })),
          });
        }
      }

      const updated = await tx.campaign.update({
        where: { id },
        data: campaignData,
        include: {
          createdBy: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
            },
          },
          vehicleModels: {
            include: {
              vehicleModel: {
                select: {
                  id: true,
                  brand: true,
                  model: true,
                  variant: true,
                  year: true,
                },
              },
            },
          },
        },
      });

      // Audit trail — retroactive edits to dates/models/status change which
      // sales count toward the supplier-rebate claim, so we record every
      // mutation alongside who did it.
      if (userId) {
        await tx.activityLog.create({
          data: {
            userId,
            action: 'UPDATE_CAMPAIGN',
            entity: 'CAMPAIGN',
            entityId: id,
            details: {
              campaignName: updated.name,
              changedFields: Object.keys(campaignData),
              vehicleModelCount: vehicleModelIds?.length,
            },
          },
        });
      }

      return updated;
    });

    await this.tagRetroactiveSales(id);

    return {
      ...campaign,
      vehicleModels: campaign.vehicleModels.map((vm) => vm.vehicleModel),
    };
  }

  /**
   * Link untagged sales that fall inside an ACTIVE campaign's window. Sales are
   * normally auto-tagged at creation only if a campaign is active *at that
   * moment*, so a campaign set up retroactively would otherwise have an empty
   * report forever. Sales already tagged to another campaign are left alone.
   */
  private async tagRetroactiveSales(campaignId: string) {
    const campaign = await db.campaign.findUnique({
      where: { id: campaignId },
      select: {
        status: true,
        startDate: true,
        endDate: true,
        vehicleModels: { select: { vehicleModelId: true } },
      },
    });
    if (!campaign || campaign.status !== 'ACTIVE') return;
    const modelIds = new Set(campaign.vehicleModels.map((vm) => vm.vehicleModelId));
    if (modelIds.size === 0) return;

    // ponytail: endDate is stored as a date-only midnight; +1 day makes the last day inclusive.
    const endExclusive = new Date(campaign.endDate.getTime() + 24 * 60 * 60 * 1000);
    const candidates = await db.sale.findMany({
      where: {
        campaignId: null,
        status: { notIn: ['CANCELLED'] },
        createdAt: { gte: campaign.startDate, lt: endExclusive },
        OR: [
          { vehicleModelId: { in: [...modelIds] } },
          { stock: { vehicleModelId: { in: [...modelIds] } } },
        ],
      },
      select: {
        id: true,
        stockId: true,
        vehicleModelId: true,
        stock: { select: { vehicleModelId: true } },
      },
    });

    for (const sale of candidates) {
      // Same effective-model rule as the report / orphan guard: stock wins.
      const vehicleModelId = sale.stock?.vehicleModelId ?? sale.vehicleModelId;
      if (!vehicleModelId || !modelIds.has(vehicleModelId)) continue;
      const campaignSubsidySnapshot = await campaignFormulasService.computeSaleSubsidySnapshot({
        campaignId,
        vehicleModelId,
        stockId: sale.stockId,
      });
      await db.sale.update({
        where: { id: sale.id },
        data: { campaignId, campaignSubsidySnapshot },
      });
    }
  }

  /**
   * Delete campaign
   */
  async delete(id: string, userId?: string) {
    // Block delete only when *live* sales claim this campaign for rebate.
    // Cancelled sales no longer contribute to a supplier claim, so they
    // should not prevent legitimate cleanup of a mistakenly-created campaign.
    const liveSalesCount = await db.sale.count({
      where: {
        campaignId: id,
        status: { notIn: ['CANCELLED'] },
      },
    });

    if (liveSalesCount > 0) {
      throw new BadRequestError(
        `ไม่สามารถลบแคมเปญนี้ได้ มีใบขายที่ยังใช้งานอยู่ ${liveSalesCount} รายการ`
      );
    }

    await db.$transaction(async (tx) => {
      const deleted = await tx.campaign.delete({
        where: { id },
        select: { name: true },
      });

      if (userId) {
        await tx.activityLog.create({
          data: {
            userId,
            action: 'DELETE_CAMPAIGN',
            entity: 'CAMPAIGN',
            entityId: id,
            details: { campaignName: deleted.name },
          },
        });
      }
    });

    return { success: true };
  }

  /**
   * Get vehicle models under a campaign
   */
  async getVehicleModels(campaignId: string) {
    const vehicleModels = await db.campaignVehicleModel.findMany({
      where: { campaignId },
      include: {
        vehicleModel: {
          select: {
            id: true,
            brand: true,
            model: true,
            variant: true,
            year: true,
            price: true,
            standardCost: true,
            type: true,
          },
        },
      },
    });

    return vehicleModels.map((vm) => vm.vehicleModel);
  }

  /**
   * Add vehicle model to campaign
   */
  async addVehicleModel(campaignId: string, vehicleModelId: string) {
    const existing = await db.campaignVehicleModel.findUnique({
      where: {
        campaignId_vehicleModelId: {
          campaignId,
          vehicleModelId,
        },
      },
    });

    if (existing) {
      throw new ConflictError('Vehicle model');
    }

    await db.campaignVehicleModel.create({
      data: {
        campaignId,
        vehicleModelId,
      },
    });

    await this.tagRetroactiveSales(campaignId);

    return { success: true };
  }

  /**
   * Remove vehicle model from campaign
   */
  async removeVehicleModel(campaignId: string, vehicleModelId: string) {
    await db.campaignVehicleModel.delete({
      where: {
        campaignId_vehicleModelId: {
          campaignId,
          vehicleModelId,
        },
      },
    });

    return { success: true };
  }

  /**
   * Get campaign analytics
   */
  async getAnalytics(
    campaignId: string,
    startDate?: Date,
    endDate?: Date
  ): Promise<{ analytics: CampaignAnalytics[]; summary: any }> {
    const campaign = await db.campaign.findUnique({
      where: { id: campaignId },
      include: {
        vehicleModels: {
          include: {
            vehicleModel: true,
          },
        },
      },
    });

    if (!campaign) {
      throw new NotFoundError('Campaign');
    }

    // Default to campaign period if no dates provided
    const filterStartDate = startDate || campaign.startDate;
    const filterEndDate = endDate || campaign.endDate;

    // Get sales for this campaign within the date range
    const sales = await db.sale.findMany({
      where: {
        campaignId,
        createdAt: {
          gte: filterStartDate,
          lte: filterEndDate,
        },
        status: {
          notIn: ['CANCELLED'],
        },
      },
      include: {
        vehicleModel: {
          select: {
            id: true,
            brand: true,
            model: true,
            variant: true,
            year: true,
          },
        },
        stock: {
          select: {
            vehicleModelId: true,
            vehicleModel: {
              select: {
                id: true,
                brand: true,
                model: true,
                variant: true,
                year: true,
              },
            },
          },
        },
      },
    });

    // Group sales by vehicle model
    const vehicleModelAnalytics = new Map<string, CampaignAnalytics>();

    // Initialize with all vehicle models in campaign
    for (const vm of campaign.vehicleModels) {
      vehicleModelAnalytics.set(vm.vehicleModelId, {
        vehicleModelId: vm.vehicleModelId,
        vehicleModel: {
          id: vm.vehicleModel.id,
          brand: vm.vehicleModel.brand,
          model: vm.vehicleModel.model,
          variant: vm.vehicleModel.variant || undefined,
          year: vm.vehicleModel.year,
        },
        totalSales: 0,
        totalAmount: 0,
        directSales: 0,
        reservationSales: 0,
      });
    }

    // Aggregate sales data
    for (const sale of sales) {
      const vehicleModelId =
        sale.stock?.vehicleModelId || sale.vehicleModelId;
      if (!vehicleModelId) continue;

      const existing = vehicleModelAnalytics.get(vehicleModelId);
      if (existing) {
        existing.totalSales += 1;
        existing.totalAmount += Number(sale.totalAmount);
        if (sale.type === 'DIRECT_SALE') {
          existing.directSales += 1;
        } else {
          existing.reservationSales += 1;
        }
      }
    }

    const analytics = Array.from(vehicleModelAnalytics.values());

    // Calculate summary
    const summary = {
      totalVehicleModels: campaign.vehicleModels.length,
      totalSales: analytics.reduce((sum, a) => sum + a.totalSales, 0),
      totalAmount: analytics.reduce((sum, a) => sum + a.totalAmount, 0),
      directSales: analytics.reduce((sum, a) => sum + a.directSales, 0),
      reservationSales: analytics.reduce(
        (sum, a) => sum + a.reservationSales,
        0
      ),
      periodStart: filterStartDate,
      periodEnd: filterEndDate,
    };

    return { analytics, summary };
  }

  /**
   * Get active campaigns
   */
  async getActiveCampaigns() {
    const now = new Date();
    return db.campaign.findMany({
      where: {
        status: 'ACTIVE',
        startDate: { lte: now },
        endDate: { gte: now },
      },
      include: {
        vehicleModels: {
          include: {
            vehicleModel: {
              select: {
                id: true,
                brand: true,
                model: true,
                variant: true,
                year: true,
              },
            },
          },
        },
      },
    });
  }

  /**
   * Get campaigns for a specific vehicle model
   */
  async getCampaignsForVehicleModel(vehicleModelId: string) {
    const now = new Date();
    const campaigns = await db.campaignVehicleModel.findMany({
      where: {
        vehicleModelId,
        campaign: {
          status: 'ACTIVE',
          startDate: { lte: now },
          endDate: { gte: now },
        },
      },
      include: {
        campaign: true,
      },
    });

    return campaigns.map((c) => c.campaign);
  }

  /**
   * Get campaign report data - sold stocks grouped by vehicle model with formula calculations
   */
  async getCampaignReport(campaignId: string) {
    const campaign = await db.campaign.findUnique({
      where: { id: campaignId },
      include: {
        createdBy: {
          select: { id: true, firstName: true, lastName: true },
        },
        vehicleModels: {
          include: {
            vehicleModel: {
              select: {
                id: true,
                brand: true,
                model: true,
                variant: true,
                year: true,
                price: true,
                standardCost: true,
              },
            },
            formulas: {
              orderBy: { sortOrder: 'asc' },
            },
          },
        },
      },
    });

    if (!campaign) {
      throw new NotFoundError('Campaign');
    }

    // Get all sales for this campaign within the campaign period
    const sales = await db.sale.findMany({
      where: {
        campaignId,
        status: { notIn: ['CANCELLED'] },
      },
      include: {
        customer: {
          select: {
            id: true,
            name: true,
          },
        },
        stock: {
          select: {
            id: true,
            vin: true,
            engineNumber: true,
            baseCost: true,
            actualSalePrice: true,
            exteriorColor: true,
            soldDate: true,
            vehicleModelId: true,
            vehicleModel: {
              select: {
                id: true,
                brand: true,
                model: true,
                variant: true,
                year: true,
                price: true,
              },
            },
          },
        },
        vehicleModel: {
          select: {
            id: true,
            brand: true,
            model: true,
            variant: true,
            year: true,
            price: true,
          },
        },
        createdBy: {
          select: { id: true, firstName: true, lastName: true },
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    // Build vehicle model info map with formulas
    const vehicleModelMap = new Map<string, {
      vehicleModel: any;
      formulas: any[];
    }>();

    for (const cvm of campaign.vehicleModels) {
      vehicleModelMap.set(cvm.vehicleModelId, {
        vehicleModel: cvm.vehicleModel,
        formulas: cvm.formulas,
      });
    }

    // Group sales by vehicle model
    const groupedSales = new Map<string, any[]>();

    // Initialize groups for all vehicle models in campaign
    for (const cvm of campaign.vehicleModels) {
      groupedSales.set(cvm.vehicleModelId, []);
    }

    // Process each sale
    for (const sale of sales) {
      const vehicleModelId = sale.stock?.vehicleModelId || sale.vehicleModelId;
      if (!vehicleModelId) continue;

      const vmInfo = vehicleModelMap.get(vehicleModelId);
      if (!vmInfo) continue;

      // Get base prices
      const costPrice = sale.stock ? Number(sale.stock.baseCost) : 0;
      const sellingPrice = Number(vmInfo.vehicleModel.price);

      // Per-car claim = the sum of independent expense line items (each a % of
      // the chosen base, or a flat baht amount). No chaining: each line stands
      // alone, computed by the shared sum engine so the editor, this report,
      // and the claim PDF never drift.
      const bases = { cost: costPrice, selling: sellingPrice };
      const formulaResults = vmInfo.formulas.map((f: any) => ({
        formulaId: f.id,
        name: f.name,
        operator: f.operator,
        value: Number(f.value),
        priceTarget: f.priceTarget,
        sortOrder: f.sortOrder,
        resultValue: formulaSubsidyAmount(f.operator, Number(f.value), f.priceTarget, bases),
      }));
      const rebatePerCar = sumCampaignSubsidies(
        vmInfo.formulas.map((f: any) => ({
          operator: f.operator,
          value: Number(f.value),
          priceTarget: f.priceTarget,
        })),
        bases
      );

      // Chain-era fields are no longer meaningful under the additive model;
      // keep them in the payload (web does not render them) as neutral values.
      const adjustedCostPrice = costPrice;
      const adjustedSellingPrice = sellingPrice;
      const costPriceDiff = 0;
      const sellingPriceDiff = 0;

      const saleReportItem = {
        saleId: sale.id,
        saleNumber: sale.saleNumber,
        saleType: sale.type,
        saleStatus: sale.status,
        customerName: sale.customer?.name ?? '-',
        salesperson: sale.createdBy
          ? `${sale.createdBy.firstName} ${sale.createdBy.lastName}`
          : '-',
        vin: sale.stock?.vin || '-',
        engineNumber: sale.stock?.engineNumber || '-',
        exteriorColor: sale.stock?.exteriorColor || '-',
        saleDate: sale.createdAt,
        soldDate: sale.stock?.soldDate || sale.completedDate,
        totalAmount: Number(sale.totalAmount),
        paymentMode: sale.paymentMode,
        financeProvider: sale.financeProvider || '-',
        // Finance commission (ค่าคอมไฟแนนซ์) the dealership earns from the
        // finance company for arranging the loan. Stored per-sale (entered on
        // the sale form); surfaced here so the campaign report shows it. It is
        // NOT part of the supplier rebate — different payer — so it gets its
        // own column/total rather than being folded into rebatePerCar.
        financeCommission: Number(sale.financeCommission) || 0,
        // Price calculations
        originalCostPrice: costPrice,
        originalSellingPrice: sellingPrice,
        adjustedCostPrice,
        adjustedSellingPrice,
        costPriceDiff,
        sellingPriceDiff,
        rebatePerCar,
        formulaResults,
      };

      const group = groupedSales.get(vehicleModelId);
      if (group) {
        group.push(saleReportItem);
      }
    }

    // Build report groups
    const reportGroups = Array.from(vehicleModelMap.entries()).map(
      ([vehicleModelId, vmInfo]) => {
        const salesItems = groupedSales.get(vehicleModelId) || [];
        return {
          vehicleModelId,
          vehicleModel: vmInfo.vehicleModel,
          formulas: vmInfo.formulas.map((f) => ({
            id: f.id,
            name: f.name,
            operator: f.operator,
            value: Number(f.value),
            priceTarget: f.priceTarget,
            sortOrder: f.sortOrder,
          })),
          sales: salesItems,
          totalSales: salesItems.length,
          totalAmount: salesItems.reduce((sum, s) => sum + s.totalAmount, 0),
          totalRebate: salesItems.reduce((sum, s) => sum + s.rebatePerCar, 0),
          totalFinanceCommission: salesItems.reduce((sum, s) => sum + s.financeCommission, 0),
        };
      }
    );

    return {
      campaign: {
        id: campaign.id,
        name: campaign.name,
        description: campaign.description,
        status: getEffectiveStatus(campaign.status, campaign.endDate),
        startDate: campaign.startDate,
        endDate: campaign.endDate,
        notes: campaign.notes,
        createdBy: campaign.createdBy,
      },
      vehicleModels: campaign.vehicleModels.map((vm) => ({
        ...vm.vehicleModel,
        formulaCount: vm.formulas.length,
      })),
      groups: reportGroups,
      summary: {
        totalVehicleModels: campaign.vehicleModels.length,
        totalSales: sales.length,
        totalAmount: sales.reduce((sum, s) => sum + Number(s.totalAmount), 0),
        totalRebate: reportGroups.reduce((sum, g) => sum + g.totalRebate, 0),
        totalFinanceCommission: reportGroups.reduce(
          (sum, g) => sum + g.totalFinanceCommission,
          0
        ),
      },
    };
  }
}

export const campaignsService = new CampaignsService();
