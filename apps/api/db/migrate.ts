import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { db, pool } from '../src/db/client.js';

await migrate(db, { migrationsFolder: new URL('./migrations', import.meta.url).pathname });
console.log('Migrations applied');
await pool.end();
