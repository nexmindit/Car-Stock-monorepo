import { Elysia, t } from 'elysia';
import { vehiclesService } from './vehicles.service';
import { authMiddleware, requirePermission } from '../auth/auth.middleware';
import { authService } from '../auth/auth.service';

// Vehicle types are rows in vehicle_types; the service checks the code exists and is active.
const vehicleTypeT = t.String({ minLength: 1 });

export const vehicleRoutes = new Elysia({ prefix: '/vehicles' })
  // Get all vehicle models
  .get(
    '/',
    async ({ query, set, requester }) => {
      // Check permission for viewing
      if (!authService.hasPermission(requester.role, 'STOCK_VIEW' as any)) {
        set.status = 403;
        return {
          success: false,
          error: 'Forbidden',
          message: 'Insufficient permissions',
        };
      }

      const page = parseInt(query.page || '1');
      const limit = parseInt(query.limit || '20');
      const search = query.search;
      const brand = query.brand;

      const result = await vehiclesService.getAllVehicles(page, limit, search, brand);
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
        brand: t.Optional(t.String()),
      }),
      detail: {
        tags: ['Vehicles'],
        summary: 'Get all vehicle models',
        description: 'Get vehicle models with pagination and search',
      },
    }
  )
  // Get available vehicle models (for sales)
  .get(
    '/available',
    async ({ set, requester }) => {
      // Check permission for viewing
      if (!authService.hasPermission(requester.role, 'STOCK_VIEW' as any)) {
        set.status = 403;
        return {
          success: false,
          error: 'Forbidden',
          message: 'Insufficient permissions',
        };
      }

      const vehicles = await vehiclesService.getAvailableModels();
      set.status = 200;
      return {
        success: true,
        data: vehicles,
      };
    },
    {
      beforeHandle: authMiddleware,
      detail: {
        tags: ['Vehicles'],
        summary: 'Get available vehicle models',
        description: 'Get vehicle models with available stock for sales',
      },
    }
  )
  // Get vehicle model by ID
  .get(
    '/:id',
    async ({ params, set, requester }) => {
      // Check permission for viewing
      if (!authService.hasPermission(requester.role, 'STOCK_VIEW' as any)) {
        set.status = 403;
        return {
          success: false,
          error: 'Forbidden',
          message: 'Insufficient permissions',
        };
      }

      const vehicle = await vehiclesService.getVehicleById(params.id);
      set.status = 200;
      return {
        success: true,
        data: vehicle,
      };
    },
    {
      beforeHandle: authMiddleware,
      detail: {
        tags: ['Vehicles'],
        summary: 'Get vehicle model by ID',
        description: 'Get a specific vehicle model with stock information',
      },
    }
  )
  // Create vehicle model
  .post(
    '/',
    async ({ body, set, requester }) => {
      const vehicle = await vehiclesService.createVehicle(body, requester);
      set.status = 201;
      return {
        success: true,
        data: vehicle,
        message: 'Vehicle model created successfully',
      };
    },
    {
      beforeHandle: [authMiddleware, requirePermission('STOCK_CREATE')],
      body: t.Object({
        brand: t.String({ minLength: 1 }),
        model: t.String({ minLength: 1 }),
        variant: t.Optional(t.String()),
        year: t.Number(),
        type: vehicleTypeT,
        primaryColor: t.Optional(t.String()),
        secondaryColor: t.Optional(t.String()),
        colorNotes: t.Optional(t.String()),
        mainOptions: t.Optional(t.String()),
        engineSpecs: t.Optional(t.String()),
        dimensions: t.Optional(t.String()),
        price: t.Number(),
        standardCost: t.Number(),
        targetMargin: t.Optional(t.Number()),
        notes: t.Optional(t.String()),
      }),
      detail: {
        tags: ['Vehicles'],
        summary: 'Create vehicle model',
        description: 'Create a new vehicle model (stock staff only)',
      },
    }
  )
  // Update vehicle model
  .patch(
    '/:id',
    async ({ params, body, set, requester }) => {
      const vehicle = await vehiclesService.updateVehicle(params.id, body, requester);
      set.status = 200;
      return {
        success: true,
        data: vehicle,
        message: 'Vehicle model updated successfully',
      };
    },
    {
      beforeHandle: [authMiddleware, requirePermission('STOCK_UPDATE')],
      body: t.Object({
        brand: t.Optional(t.String({ minLength: 1 })),
        model: t.Optional(t.String({ minLength: 1 })),
        variant: t.Optional(t.String()),
        year: t.Optional(t.Number()),
        type: t.Optional(vehicleTypeT),
        primaryColor: t.Optional(t.String()),
        secondaryColor: t.Optional(t.String()),
        colorNotes: t.Optional(t.String()),
        mainOptions: t.Optional(t.String()),
        engineSpecs: t.Optional(t.String()),
        dimensions: t.Optional(t.String()),
        price: t.Optional(t.Number()),
        standardCost: t.Optional(t.Number()),
        targetMargin: t.Optional(t.Number()),
        notes: t.Optional(t.String()),
      }),
      detail: {
        tags: ['Vehicles'],
        summary: 'Update vehicle model',
        description: 'Update vehicle model information',
      },
    }
  )
  // Delete vehicle model
  .delete(
    '/:id',
    async ({ params, set, requester }) => {
      await vehiclesService.deleteVehicle(params.id, requester);
      set.status = 200;
      return {
        success: true,
        message: 'Vehicle model deleted successfully',
      };
    },
    {
      beforeHandle: [authMiddleware, requirePermission('STOCK_DELETE')],
      detail: {
        tags: ['Vehicles'],
        summary: 'Delete vehicle model',
        description: 'Delete a vehicle model (admin only, cannot delete if has stock)',
      },
    }
  );
