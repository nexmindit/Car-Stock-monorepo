import {
  DEFAULT_VEHICLE_CARD_LAYOUT,
  ReceiptPrintLayoutSchema,
  VehicleCardLayoutSchema,
  mergeReceiptPrintLayout,
  mergeVehicleCardLayout,
} from '@car-stock/shared/schemas';
import { Elysia, t } from 'elysia';
import { authMiddleware, requirePermission, requireRole } from '../auth/auth.middleware';
import { settingsService } from './settings.service';
import { CompanySettingsSchema } from './types';

export const settingsRoutes = new Elysia({ prefix: '/settings' })
  .get(
    '/',
    async () => {
      const settings = await settingsService.getSettings();
      return {
        success: true,
        data: settings,
      };
    },
    {
      beforeHandle: [authMiddleware],
    }
  )
  .put(
    '/',
    async ({ body }) => {
      const result = await settingsService.updateSettings(body);
      return {
        success: true,
        data: result,
        message: 'Settings updated successfully',
      };
    },
    {
      beforeHandle: [authMiddleware, requireRole('ADMIN')],
      body: CompanySettingsSchema,
    }
  )
  // Vehicle-card print positions (mm). Same permission as printing the card.
  .get(
    '/print-layout/vehicle-card',
    async () => {
      const saved = await settingsService.getPrintLayout('vehicle-card');
      return {
        success: true,
        data: saved ? mergeVehicleCardLayout(saved) : DEFAULT_VEHICLE_CARD_LAYOUT,
      };
    },
    { beforeHandle: [authMiddleware, requirePermission('DOC_CAR_DETAIL_CARD')] }
  )
  .put(
    '/print-layout/vehicle-card',
    async ({ body }) => {
      const layout = VehicleCardLayoutSchema.parse(body);
      await settingsService.savePrintLayout('vehicle-card', layout);
      return { success: true, data: mergeVehicleCardLayout(layout), message: 'บันทึกตำแหน่งการ์ดแล้ว' };
    },
    { beforeHandle: [authMiddleware, requirePermission('DOC_CAR_DETAIL_CARD')] }
  )
  // Receipt (ใบรับเงินชั่วคราว) print offsets in mm. Same permission as printing it.
  .get(
    '/print-layout/receipt',
    async () => ({
      success: true,
      data: mergeReceiptPrintLayout(await settingsService.getPrintLayout('receipt')),
    }),
    { beforeHandle: [authMiddleware, requirePermission('DOC_GENERAL')] }
  )
  .put(
    '/print-layout/receipt',
    async ({ body }) => {
      const layout = ReceiptPrintLayoutSchema.parse(body);
      await settingsService.savePrintLayout('receipt', layout);
      return { success: true, data: layout, message: 'บันทึกตำแหน่งพิมพ์ใบเสร็จแล้ว' };
    },
    { beforeHandle: [authMiddleware, requirePermission('DOC_GENERAL')] }
  );
