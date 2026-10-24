import { existsSync, statSync } from 'node:fs';
import { join, resolve, sep } from 'node:path';
import { cors } from '@elysiajs/cors';
import { jwt } from '@elysiajs/jwt';
import { swagger } from '@elysiajs/swagger';
import { Elysia } from 'elysia';
import { db } from './lib/db';
import { AppError, handlePrismaError, isAppError, isPrismaError } from './lib/errors';
import { logger } from './lib/logger';

import { analyticsRoutes } from './modules/analytics/analytics.controller';
// Import routes
import { authRoutes } from './modules/auth/auth.controller';
import { bankAccountsRoutes } from './modules/bank-accounts/bank-accounts.controller';
import { campaignRoutes } from './modules/campaigns/campaigns.controller';
import { customerRoutes } from './modules/customers/customers.controller';
import { interestRoutes } from './modules/interest/interest.controller';
import { paymentRoutes } from './modules/payments/payments.controller';
import { pdfRoutes } from './modules/pdf/pdf.controller';
import { quotationRoutes } from './modules/quotations/quotations.controller';
import { reportRoutes } from './modules/reports/reports.controller';
import { salesRoutes } from './modules/sales/sales.controller';
import { settingsRoutes } from './modules/settings/settings.controller';
import { stockRoutes } from './modules/stock/stock.controller';
import { systemRoutes } from './modules/system/system.controller';
import { systemService } from './modules/system/system.service';
import { userRoutes } from './modules/users/users.controller';
import { vehicleTypeRoutes } from './modules/vehicle-types/vehicle-types.controller';
import { vehicleRoutes } from './modules/vehicles/vehicles.controller';
// import { documentRoutes } from './modules/documents/documents.controller';

/**
 * Resolve SPA static directory for portable / single-process production.
 * When missing (Docker API-only + separate nginx web), API keeps JSON root.
 */
function resolveStaticDir(): string | null {
  const candidates = [
    process.env.STATIC_DIR,
    join(process.cwd(), 'public'),
    // Running from apps/api/src via bun
    join(import.meta.dir, '..', 'public'),
    // Running from apps/api/dist
    join(import.meta.dir, 'public'),
  ].filter((v): v is string => Boolean(v));

  for (const dir of candidates) {
    const resolved = resolve(dir);
    if (existsSync(join(resolved, 'index.html'))) {
      return resolved;
    }
  }
  return null;
}

const STATIC_DIR = resolveStaticDir();

/** Safe static file lookup under STATIC_DIR; null if missing or path escape. */
function resolveStaticFile(pathname: string): string | null {
  if (!STATIC_DIR) return null;
  let decoded: string;
  try {
    decoded = decodeURIComponent(pathname.split('?')[0] || '/');
  } catch {
    // Malformed percent-encoding → 404, not 500
    return null;
  }
  if (decoded.includes('\0')) {
    return null;
  }
  const relative = decoded === '/' ? 'index.html' : decoded.replace(/^\/+/, '');
  const filePath = resolve(join(STATIC_DIR, relative));
  const rootWithSep = STATIC_DIR.endsWith(sep) ? STATIC_DIR : STATIC_DIR + sep;
  if (filePath !== STATIC_DIR && !filePath.startsWith(rootWithSep)) {
    return null;
  }
  if (existsSync(filePath) && statSync(filePath).isFile()) {
    return filePath;
  }
  return null;
}

const app = new Elysia()
  // CORS configuration
  .use(
    cors({
      origin: process.env.CORS_ORIGIN || 'http://localhost:5173',
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      credentials: true,
    })
  )
  // Swagger documentation
  .use(
    swagger({
      documentation: {
        info: {
          title: 'VBeyond Car Sales API',
          version: '1.0.0',
          description: 'API for Car Sales Management System',
        },
        tags: [
          { name: 'Auth', description: 'Authentication endpoints' },
          { name: 'Users', description: 'User management' },
          { name: 'Customers', description: 'Customer management' },
          { name: 'Vehicles', description: 'Vehicle model management' },
          { name: 'Stock', description: 'Stock/inventory management' },
          { name: 'Interest', description: 'Stock interest management' },
          { name: 'Sales', description: 'Sales pipeline management' },
          { name: 'Payments', description: 'Payment management' },
          { name: 'Campaigns', description: 'Campaign management' },
          { name: 'Reports', description: 'Reports and analytics' },
          { name: 'Documents', description: 'Document generation' },
        ],
      },
      path: '/docs',
    })
  )
  // JWT configuration
  .use(
    jwt({
      name: 'jwt',
      secret: (() => {
        const secret = process.env.JWT_SECRET;
        if (!secret || secret === 'your-secret-key-change-in-production') {
          if (process.env.NODE_ENV === 'production') {
            throw new Error('JWT_SECRET must be set in production');
          }
          return 'dev-only-secret-do-not-use-in-production';
        }
        return secret;
      })(),
      exp: '24h',
    })
  )
  // Root: SPA index when public/ is present; otherwise API status JSON (Docker API-only)
  .get('/', () => {
    if (STATIC_DIR) {
      return Bun.file(join(STATIC_DIR, 'index.html'));
    }
    return {
      name: 'VBeyond Car Sales API',
      version: '1.0.0',
      status: 'running',
      timestamp: new Date().toISOString(),
    };
  })
  // Health check with database
  .get('/health', async ({ set }) => {
    try {
      await db.$queryRaw`SELECT 1`;
      return {
        status: 'healthy',
        database: 'connected',
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      // 503, not 200: `curl -f` in start.bat and the Docker healthcheck only look at the
      // status code, so a 200 here reported a DB-less app as healthy and let a broken
      // update pass its post-start health gate.
      set.status = 503;
      return {
        status: 'unhealthy',
        database: 'disconnected',
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString(),
      };
    }
  })
  // Error handling — registered BEFORE the routes so it applies to every
  // module. Elysia attaches a lifecycle hook only to routes registered after
  // it; `as: 'global'` additionally extends it across all plugin scopes.
  // Without this, thrown AppErrors fell through to Elysia's default handler
  // (HTTP 500 + raw message string) instead of the normalized JSON envelope.
  .onError({ as: 'global' }, ({ code, error, set }) => {
    logger.error(
      { code, err: error, stack: error instanceof Error ? error.stack : undefined },
      `Error [${code}]: ${error instanceof Error ? error.message : 'Unknown error'}`
    );

    // Handle AppError (custom application errors)
    if (isAppError(error)) {
      set.status = error.statusCode;
      return {
        success: false,
        error: error.errorCode,
        message: error.message,
        details: error.details,
      };
    }

    // Handle Prisma errors
    if (isPrismaError(error)) {
      const appError = handlePrismaError(error);
      set.status = appError.statusCode;
      return {
        success: false,
        error: appError.errorCode,
        message: appError.message,
        details: appError.details,
      };
    }

    // PrismaClientValidationError has no P2xxx code (so isPrismaError misses it)
    // and its default message is a full query dump — keep one readable line.
    if (error instanceof Error && error.name === 'PrismaClientValidationError') {
      const unknownArg = error.message.match(/Unknown argument `[^`]+`/);
      set.status = 500;
      return {
        success: false,
        error: 'INTERNAL_ERROR',
        message: unknownArg
          ? `บันทึกไม่สำเร็จ: ${unknownArg[0]}`
          : 'ข้อมูลที่ส่งมาไม่ตรงกับฐานข้อมูล',
      };
    }

    // Handle Zod validation errors
    if (error instanceof Error && error.name === 'ZodError') {
      const zodError = error as import('zod').ZodError;
      const fieldErrors: Record<string, string[]> = {};
      zodError.errors.forEach((err) => {
        const path = err.path.join('.');
        if (!fieldErrors[path]) {
          fieldErrors[path] = [];
        }
        fieldErrors[path].push(err.message);
      });

      set.status = 400;
      return {
        success: false,
        error: 'VALIDATION_ERROR',
        message: 'Validation failed',
        details: { fields: fieldErrors },
      };
    }

    if (code === 'PARSE') {
      set.status = 400;
      return {
        success: false,
        error: 'PARSE_ERROR',
        message: 'ข้อมูลที่ส่งมาไม่ถูกต้อง',
      };
    }

    if (code === 'VALIDATION') {
      set.status = 400;
      return {
        success: false,
        error: 'VALIDATION_ERROR',
        message: error.message,
      };
    }

    if (code === 'NOT_FOUND') {
      set.status = 404;
      return {
        success: false,
        error: 'NOT_FOUND',
        message: 'The requested resource was not found',
      };
    }

    set.status = 500;
    return {
      success: false,
      error: 'INTERNAL_ERROR',
      message:
        process.env.NODE_ENV === 'development'
          ? (error as Error).message
          : 'An unexpected error occurred',
    };
  })
  // API routes group
  .group(
    '/api',
    (app) =>
      app
        .get('/', () => ({ message: 'Welcome to VBeyond Car Sales API' }))
        // Routes
        .use(authRoutes)
        .use(userRoutes)
        .use(customerRoutes)
        .use(vehicleRoutes)
        .use(vehicleTypeRoutes)
        .use(stockRoutes)
        .use(salesRoutes)
        .use(paymentRoutes)
        .use(quotationRoutes)
        .use(interestRoutes)
        .use(campaignRoutes)
        .use(reportRoutes)
        .use(pdfRoutes)
        .use(analyticsRoutes)
        .use(settingsRoutes)
        .use(bankAccountsRoutes)
        .use(systemRoutes)
    // .use(documentRoutes)
  )
  // Portable: serve built SPA assets + client-side router fallback
  .get('/*', ({ request, set }) => {
    if (!STATIC_DIR) {
      set.status = 404;
      return {
        success: false,
        error: 'NOT_FOUND',
        message: 'The requested resource was not found',
      };
    }

    const url = new URL(request.url);
    const pathname = url.pathname;

    // Never hijack API or OpenAPI surfaces (belt-and-suspenders if routing changes)
    if (
      pathname.startsWith('/api') ||
      pathname.startsWith('/docs') ||
      pathname.startsWith('/swagger') ||
      pathname === '/health'
    ) {
      set.status = 404;
      return {
        success: false,
        error: 'NOT_FOUND',
        message: 'The requested resource was not found',
      };
    }

    const filePath = resolveStaticFile(pathname);
    if (filePath) {
      return Bun.file(filePath);
    }

    // SPA fallback for client routes (e.g. /sales, /settings)
    return Bun.file(join(STATIC_DIR, 'index.html'));
  })
  // Request logging
  .onRequest(({ request, store }) => {
    (store as any).startTime = Date.now();
    logger.debug({ method: request.method, url: request.url }, 'Incoming request');
  })
  .onAfterResponse(({ request, set, store }) => {
    const duration = Date.now() - ((store as any).startTime || Date.now());
    const url = new URL(request.url);
    logger.info(
      {
        method: request.method,
        path: url.pathname,
        status: set.status || 200,
        duration,
      },
      `${request.method} ${url.pathname} ${set.status || 200} ${duration}ms`
    );
  })
  .listen(process.env.PORT || 3001);

console.log(`
🚗 VBeyond Car Sales API
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🌐 Server:  http://${app.server?.hostname}:${app.server?.port}
📚 Docs:    http://${app.server?.hostname}:${app.server?.port}/docs
${STATIC_DIR ? `📁 Static:  ${STATIC_DIR}\n` : ''}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`);
logger.info({ port: app.server?.port, staticDir: STATIC_DIR }, 'VBeyond Car Sales API started');

// Periodic update check (check only — never installs). Set UPDATE_CHECK_INTERVAL_HOURS=0
// to disable on sites with no outbound internet.
if (systemService.startUpdateWatcher()) {
  logger.info(
    { intervalHours: process.env.UPDATE_CHECK_INTERVAL_HOURS || '6' },
    'Update check watcher started'
  );
}

// Daily database backup. Failures are logged rather than thrown — a nightly job must not be
// able to take the API down — so this log is the only place a broken backup shows up until
// someone opens Settings.
const backupSchedule = systemService.startBackupScheduler((result) => {
  if (result.ok) {
    logger.info({ pruned: result.pruned }, result.message);
  } else {
    logger.error({ err: result.message }, `Scheduled backup failed: ${result.message}`);
  }
});
if (backupSchedule) {
  logger.info(
    { at: backupSchedule.at, retentionDays: process.env.BACKUP_RETENTION_DAYS || '30' },
    'Daily backup scheduled'
  );
} else if (process.env.BACKUP_SCHEDULE?.trim()) {
  // Configured but unusable — say so, instead of silently never backing up.
  logger.warn(
    { value: process.env.BACKUP_SCHEDULE },
    'BACKUP_SCHEDULE is not a valid HH:MM time — daily backup is DISABLED'
  );
}

export type App = typeof app;
