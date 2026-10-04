import type { NextConfig } from 'next';
import path from 'node:path';

const config: NextConfig = {
  transpilePackages: ['@xtra/shared', '@xtra/ui'],
  poweredByHeader: false,
  outputFileTracingRoot: path.join(__dirname, '../..'),
};
export default config;
