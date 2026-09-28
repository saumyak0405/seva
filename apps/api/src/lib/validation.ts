import { z } from 'zod';
import { serviceEnum, idTypeEnum, bookingStatusEnum } from '../db/schema.js';

export const phoneSchema = z
  .string()
  .trim()
  .regex(/^[6-9]\d{9}$/, 'Enter a valid 10-digit Indian mobile number');

export const serviceSchema = z.enum(serviceEnum.enumValues);
export const idTypeSchema = z.enum(idTypeEnum.enumValues);
export const bookingStatusSchema = z.enum(bookingStatusEnum.enumValues);
export const uuidSchema = z.uuid();

export const hhmmSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$|^24:00$/, 'Use HH:MM (24-hour)');
export const dateSchema = z.iso.date();
