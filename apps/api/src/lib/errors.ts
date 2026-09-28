import type { ErrorRequestHandler } from 'express';
import { ZodError } from 'zod';

export class HttpError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

export const badRequest = (msg: string, code = 'BAD_REQUEST') => new HttpError(400, code, msg);
export const unauthorized = (msg = 'Login required') => new HttpError(401, 'UNAUTHORIZED', msg);
export const forbidden = (msg = 'Not allowed') => new HttpError(403, 'FORBIDDEN', msg);
export const notFound = (what = 'Resource') => new HttpError(404, 'NOT_FOUND', `${what} not found`);
export const conflict = (msg: string, code = 'CONFLICT') => new HttpError(409, code, msg);

/** Postgres error code, whether the pg error is thrown directly or wrapped by Drizzle. */
export function pgCode(err: unknown): string | undefined {
  const e = err as { code?: unknown; cause?: { code?: unknown } };
  if (typeof e?.code === 'string') return e.code;
  if (typeof e?.cause?.code === 'string') return e.cause.code;
  return undefined;
}

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof ZodError) {
    res.status(400).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid request',
        issues: err.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
      },
    });
    return;
  }
  if (err instanceof HttpError) {
    res.status(err.status).json({ error: { code: err.code, message: err.message } });
    return;
  }
  // Body-parser errors (malformed JSON, payload too large)
  if (typeof err?.status === 'number' && err.status < 500 && err.type) {
    res.status(err.status).json({ error: { code: 'BAD_REQUEST', message: 'Malformed request body' } });
    return;
  }
  const code = pgCode(err);
  if (code === '23P01') {
    res.status(409).json({ error: { code: 'SLOT_TAKEN', message: 'This worker is already booked for that time' } });
    return;
  }
  if (code === '23505') {
    res.status(409).json({ error: { code: 'DUPLICATE', message: 'A record with these details already exists' } });
    return;
  }
  console.error(err);
  res.status(500).json({ error: { code: 'INTERNAL', message: 'Something went wrong' } });
};
