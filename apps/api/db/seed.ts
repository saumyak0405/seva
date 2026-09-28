/**
 * Seeds demo workers and admin accounts. Run: npm run db:seed
 */
import { pool } from '../src/db/client.js';
import { seedDemoData } from '../src/db/demo-data.js';
import { env } from '../src/config.js';

const n = await seedDemoData();
console.log(`Seeded ${n} workers and ${env.ADMIN_PHONES.length} admin account(s)`);
await pool.end();
