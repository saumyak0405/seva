import pg from 'pg';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import * as schema from './schema.js';
import { env } from '../config.js';

export const pool = new pg.Pool({ connectionString: env.DATABASE_URL, max: 10 });

export const db = drizzle(pool, { schema });

export type DB = NodePgDatabase<typeof schema>;
/** A transaction handle has the same query API as `db`. */
export type Tx = Parameters<Parameters<DB['transaction']>[0]>[0];
