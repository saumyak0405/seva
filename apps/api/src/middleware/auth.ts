import type { RequestHandler } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config.js';
import { forbidden, unauthorized } from '../lib/errors.js';

export type Role = 'HOUSEHOLD' | 'ADMIN';
export interface AuthUser {
  id: string;
  role: Role;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

const TOKEN_TTL = '7d';

export function signToken(user: AuthUser): string {
  return jwt.sign({ role: user.role }, env.JWT_SECRET, {
    subject: user.id,
    expiresIn: TOKEN_TTL,
    algorithm: 'HS256',
  });
}

export const requireAuth: RequestHandler = (req, _res, next) => {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) return next(unauthorized());
  try {
    const payload = jwt.verify(header.slice(7), env.JWT_SECRET, { algorithms: ['HS256'] }) as jwt.JwtPayload;
    if (!payload.sub || (payload.role !== 'HOUSEHOLD' && payload.role !== 'ADMIN')) return next(unauthorized());
    req.user = { id: payload.sub, role: payload.role };
    next();
  } catch {
    next(unauthorized('Session expired, please log in again'));
  }
};

export const requireRole =
  (...roles: Role[]): RequestHandler =>
  (req, _res, next) => {
    if (!req.user) return next(unauthorized());
    if (!roles.includes(req.user.role)) return next(forbidden());
    next();
  };

/** Narrow `req.user` inside handlers mounted after requireAuth. */
export function currentUser(req: { user?: AuthUser }): AuthUser {
  if (!req.user) throw unauthorized();
  return req.user;
}
