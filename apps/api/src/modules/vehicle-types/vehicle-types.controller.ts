import { Elysia, t } from 'elysia';
import { authMiddleware, requirePermission } from '../auth/auth.middleware';
import { vehicleTypesService } from './vehicle-types.service';

const vehicleTypeBody = {
  nameTh: t.String(),
  sortOrder: t.Optional(t.Number()),
  isActive: t.Optional(t.Boolean()),
};

export const vehicleTypeRoutes = new Elysia({ prefix: '/vehicle-types' })
  .get(
    '/',
    async ({ query }) => {
      const includeInactive = query?.includeInactive === 'true';
      const data = await vehicleTypesService.list(includeInactive);
      return { success: true, data };
    },
    {
      beforeHandle: [authMiddleware],
      query: t.Optional(t.Object({ includeInactive: t.Optional(t.String()) })),
      detail: { tags: ['Vehicles'], summary: 'List vehicle types' },
    }
  )
  .post(
    '/',
    async ({ body, set }) => {
      const data = await vehicleTypesService.create(body);
      set.status = 201;
      return { success: true, data, message: 'Vehicle type created' };
    },
    {
      beforeHandle: [authMiddleware, requirePermission('VEHICLE_TYPE_MANAGE')],
      body: t.Object({ code: t.String(), ...vehicleTypeBody }),
      detail: { tags: ['Vehicles'], summary: 'Create vehicle type' },
    }
  )
  .put(
    '/:code',
    async ({ params, body }) => {
      const data = await vehicleTypesService.update(params.code, body);
      return { success: true, data, message: 'Vehicle type updated' };
    },
    {
      beforeHandle: [authMiddleware, requirePermission('VEHICLE_TYPE_MANAGE')],
      params: t.Object({ code: t.String() }),
      body: t.Object({
        nameTh: t.Optional(t.String()),
        sortOrder: t.Optional(t.Number()),
        isActive: t.Optional(t.Boolean()),
      }),
      detail: { tags: ['Vehicles'], summary: 'Update vehicle type (code is immutable)' },
    }
  )
  .delete(
    '/:code',
    async ({ params }) => {
      await vehicleTypesService.remove(params.code);
      return { success: true, message: 'Vehicle type deleted' };
    },
    {
      beforeHandle: [authMiddleware, requirePermission('VEHICLE_TYPE_MANAGE')],
      params: t.Object({ code: t.String() }),
      detail: { tags: ['Vehicles'], summary: 'Delete an unused vehicle type' },
    }
  );
