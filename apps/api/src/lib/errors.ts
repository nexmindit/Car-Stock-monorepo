import type { Prisma } from '@prisma/client';
import type { ZodError } from 'zod';

/**
 * Application Error Class
 * Standardized error format for API responses
 */
export class AppError extends Error {
  public readonly statusCode: number;
  public readonly errorCode: string;
  public readonly details?: Record<string, unknown>;

  constructor(
    message: string,
    statusCode: number = 500,
    errorCode: string = 'INTERNAL_ERROR',
    details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.errorCode = errorCode;
    this.details = details;
    Error.captureStackTrace(this, this.constructor);
  }

  toJSON() {
    return {
      success: false,
      error: this.errorCode,
      message: this.message,
      details: this.details,
    };
  }
}

/**
 * Not Found Error (404)
 */
export class NotFoundError extends AppError {
  constructor(entity: string, id?: string) {
    const message = id 
      ? `${entity} not found with id: ${id}` 
      : `${entity} not found`;
    super(
      message,
      404,
      `${entity.toUpperCase().replace(/\s+/g, '_')}_NOT_FOUND`
    );
    this.name = 'NotFoundError';
  }
}

/**
 * Forbidden Error (403)
 */
export class ForbiddenError extends AppError {
  constructor(message: string = 'Insufficient permissions') {
    super(message, 403, 'INSUFFICIENT_PERMISSIONS');
    this.name = 'ForbiddenError';
  }
}

/**
 * Bad Request Error (400)
 */
export class BadRequestError extends AppError {
  constructor(
    message: string,
    details?: Record<string, unknown>
  ) {
    super(message, 400, 'BAD_REQUEST', details);
    this.name = 'BadRequestError';
  }
}

/**
 * Conflict Error (409) - e.g., duplicate unique field
 */
export class ConflictError extends AppError {
  constructor(
    field: string,
    value?: string,
    details?: Record<string, unknown>
  ) {
    const message = value
      ? `${field} already exists: ${value}`
      : `${field} already exists`;

    const errorCode = `${field.toUpperCase().replace(/\s+/g, '_')}_ALREADY_EXISTS`;

    // Build field-level error details for frontend inline display
    const fieldKey = field.toLowerCase().replace(/\s+/g, '');
    const fieldDetails = {
      ...details,
      fields: { [fieldKey]: [`${field} already exists`] },
    };

    super(message, 409, errorCode, fieldDetails);
    this.name = 'ConflictError';
  }
}

/**
 * Validation Error (400) - for field-level validation
 */
export class ValidationError extends AppError {
  constructor(
    message: string = 'Validation failed',
    fieldErrors?: Record<string, string[]>
  ) {
    super(
      message,
      400,
      'VALIDATION_ERROR',
      fieldErrors ? { fields: fieldErrors } : undefined
    );
    this.name = 'ValidationError';
  }
}

/**
 * Unauthorized Error (401)
 */
export class UnauthorizedError extends AppError {
  constructor(message: string = 'Authentication required') {
    super(message, 401, 'UNAUTHORIZED');
    this.name = 'UnauthorizedError';
  }
}

/**
 * Handle Prisma errors and convert to AppError
 */
export function handlePrismaError(error: Prisma.PrismaClientKnownRequestError): AppError {
  const code = error.code;

  switch (code) {
    // Unique constraint violation
    case 'P2002': {
      const targets = error.meta?.target as string[] | undefined;
      const field = targets?.[0] || 'field';

      // Map DB column names to user-friendly field names
      const fieldNameMap: Record<string, string> = {
        vin: 'VIN',
        engine_number: 'Engine Number',
        engineNumber: 'Engine Number',
        tax_id: 'Tax ID',
        taxId: 'Tax ID',
        passport_number: 'Passport Number',
        passportNumber: 'Passport Number',
        username: 'Username',
        email: 'Email',
      };

      const friendlyName = fieldNameMap[field] || field;
      return new ConflictError(friendlyName, undefined, {
        target: error.meta?.target,
        code: 'P2002',
      });
    }

    // Foreign key constraint failed
    case 'P2003': {
      const field = error.meta?.field_name as string || 'foreign key';
      return new BadRequestError(`Invalid reference: ${field}`, {
        field,
        code: 'P2003'
      });
    }

    // Record not found
    case 'P2025': {
      const cause = error.meta?.cause as string || 'Record not found';
      return new NotFoundError(cause.split(' ')[0] || 'Record');
    }

    // Required record not found
    case 'P2018': {
      return new NotFoundError('Related record');
    }

    // Record to delete does not exist
    case 'P2026': {
      return new NotFoundError('Record');
    }

    default:
      return new AppError(
        'Database error occurred',
        500,
        'DATABASE_ERROR',
        { prismaCode: code, meta: error.meta }
      );
  }
}

/**
 * Handle Zod errors and convert to ValidationError
 */
export function handleZodError(error: ZodError): ValidationError {
  const fieldErrors: Record<string, string[]> = {};

  error.errors.forEach((err) => {
    const path = err.path.join('.');
    if (!fieldErrors[path]) {
      fieldErrors[path] = [];
    }
    fieldErrors[path].push(err.message);
  });

  return new ValidationError('Validation failed', fieldErrors);
}

/**
 * Type guard to check if error is AppError
 */
export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError;
}

/**
 * Type guard to check if error is Prisma error
 */
export function isPrismaError(error: unknown): error is Prisma.PrismaClientKnownRequestError {
  // Prisma known-request codes look like P2002. Other errors also carry a string
  // `code` (Elysia's ValidationError has code 'VALIDATION') and must not be
  // reported as "Database error occurred".
  return (
    error instanceof Error &&
    'code' in error &&
    typeof (error as { code: unknown }).code === 'string' &&
    /^P\d{4}$/.test((error as { code: string }).code)
  );
}
