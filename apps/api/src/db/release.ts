/**
 * Release step, run by Vercel after building the API (`pnpm run vercel-build`):
 *   1. applies database migrations
 *   2. creates the first super-admin from ADMIN_EMAIL / ADMIN_PASSWORD (once; skipped if unset)
 *
 * Only production builds touch the database, so a preview build for a pull request can never change
 * the live schema before the change is merged. Both steps are idempotent.
 */
import 'dotenv/config';
import path from 'path';
import { execFileSync } from 'child_process';
import { databaseUrl } from './config';

const env = process.env.VERCEL_ENV; // 'production' | 'preview' | 'development' on Vercel, unset elsewhere
if (env && env !== 'production') {
  console.log(`Release: skipping database steps for a ${env} build`);
  process.exit(0);
}
if (!databaseUrl()) {
  console.error('Release: database URL is missing. Configure DATABASE_URL or XTR_DATABASE_URL before deploying.');
  process.exit(1);
}
if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
  console.error('Release: JWT_SECRET must contain at least 32 characters before deploying.');
  process.exit(1);
}

for (const step of ['migrate.js', 'create-admin.js']) {
  execFileSync(process.execPath, [path.join(__dirname, step)], { stdio: 'inherit' });
}
console.log('Release: database ready');
