/** Supports the standard URL and the XTR_ prefix configured by the Vercel database integration. */
export function databaseUrl(env: NodeJS.ProcessEnv = process.env): string | undefined {
  return [env.DATABASE_URL, env.XTR_DATABASE_URL, env.POSTGRES_URL, env.XTR_POSTGRES_URL]
    .map((value) => value?.trim())
    .find((value) => !!value);
}
