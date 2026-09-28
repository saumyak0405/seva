import { fileURLToPath } from 'node:url';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { db } from './client.js';

/** apps/api/db/migrations — same relative path from src/db (dev) and dist/db (production). */
const MIGRATIONS_DIR = fileURLToPath(new URL('../../db/migrations', import.meta.url));

/** Applies pending SQL migrations. Already-applied ones are skipped, so it's safe on every start. */
export async function runMigrations() {
  await migrate(db, { migrationsFolder: MIGRATIONS_DIR });
}
