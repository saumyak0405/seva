import pg from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';

/** Rebuild the test database schema from migrations once per test run. */
export default async function setup() {
  const url = process.env.DATABASE_URL!;
  if (!url.includes('test')) throw new Error(`Refusing to reset a non-test database: ${url}`);

  const pool = new pg.Pool({ connectionString: url });
  await pool.query('DROP SCHEMA IF EXISTS public CASCADE; DROP SCHEMA IF EXISTS drizzle CASCADE; CREATE SCHEMA public;');
  await migrate(drizzle(pool), { migrationsFolder: new URL('../db/migrations', import.meta.url).pathname });
  await pool.end();
}
