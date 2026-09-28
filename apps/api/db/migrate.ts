import { pool } from '../src/db/client.js';
import { runMigrations } from '../src/db/migrate.js';

await runMigrations();
console.log('Migrations applied');
await pool.end();
