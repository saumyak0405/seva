import { z } from 'zod';

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().default(4000),
  DATABASE_URL: z.string().min(1),
  CORS_ORIGIN: z.string().default('http://localhost:5173'),
  JWT_SECRET: z.string().min(16, 'JWT_SECRET must be at least 16 characters'),
  OTP_SECRET: z.string().min(8),
  ID_ENCRYPTION_KEY: z
    .string()
    .refine((v) => Buffer.from(v, 'base64').length === 32, 'ID_ENCRYPTION_KEY must be 32 bytes, base64-encoded'),
  ADMIN_PHONES: z
    .string()
    .default('')
    .transform((v) => v.split(',').map((p) => p.trim()).filter(Boolean)),
  OTP_DEV_MODE: z
    .string()
    .default('false')
    .transform((v) => v === 'true'),
  BOOKING_FEE_RUPEES: z.coerce.number().int().min(0).default(49),
});

const parsed = EnvSchema.safeParse(process.env);
if (!parsed.success) {
  console.error('Invalid environment configuration:');
  for (const issue of parsed.error.issues) console.error(`  ${issue.path.join('.')}: ${issue.message}`);
  process.exit(1);
}

export const env = parsed.data;

if (env.NODE_ENV === 'production' && env.OTP_DEV_MODE) {
  console.error('OTP_DEV_MODE must be false in production');
  process.exit(1);
}
