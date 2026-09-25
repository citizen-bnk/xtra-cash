import type { NextConfig } from 'next';

const config: NextConfig = {
  transpilePackages: ['@xtra/shared', '@xtra/ui'],
  poweredByHeader: false,
};
export default config;
