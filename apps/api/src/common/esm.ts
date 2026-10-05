import { pathToFileURL } from 'node:url';

// TypeScript's CommonJS target rewrites import() to require(). Keep native import
// for these ESM-only dependencies even when the runtime disables require(ESM).
// Literal require.resolve calls also keep both packages visible to Vercel tracing.
const nativeImport = new Function('url', 'return import(url)') as (url: string) => Promise<unknown>;

export function loadAiSdk(): Promise<typeof import('ai')> {
  return nativeImport(pathToFileURL(require.resolve('ai')).href) as Promise<typeof import('ai')>;
}

export function loadJose(): Promise<typeof import('jose')> {
  return nativeImport(pathToFileURL(require.resolve('jose')).href) as Promise<typeof import('jose')>;
}
