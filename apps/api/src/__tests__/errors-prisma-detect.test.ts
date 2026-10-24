import { describe, expect, it } from 'bun:test';
import { isPrismaError } from '../lib/errors';

const withCode = (code: string) => Object.assign(new Error('x'), { code });

describe('isPrismaError', () => {
  it('matches Prisma known-request codes', () => {
    expect(isPrismaError(withCode('P2002'))).toBe(true);
    expect(isPrismaError(withCode('P2025'))).toBe(true);
  });

  it('ignores other errors that carry a string code (Elysia validation, system errors)', () => {
    expect(isPrismaError(withCode('VALIDATION'))).toBe(false);
    expect(isPrismaError(withCode('ECONNREFUSED'))).toBe(false);
    expect(isPrismaError(new Error('plain'))).toBe(false);
  });
});
