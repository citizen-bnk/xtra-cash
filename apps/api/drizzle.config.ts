import { defineConfig } from 'drizzle-kit';
import { databaseUrl } from './src/db/config';

export default defineConfig({
  dialect: 'postgresql',
  schema: ['./src/db/schema.ts', './src/personal-loans/settlement.schema.ts', './src/personal-loans/lender-ai.schema.ts', './src/personal-loans/vault.schema.ts'],
  out: './drizzle',
  dbCredentials: { url: databaseUrl() ?? 'postgresql://postgres:postgres@localhost:5432/xtracash' },
});
