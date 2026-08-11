import { loadWebConfig } from '@ai-agent/config';

const appEnv = process.env.APP_ENV ?? 'development';
loadWebConfig(process.env, appEnv === 'production');

const nextConfig = {
  transpilePackages: ['@ai-agent/config', '@ai-agent/contracts'],
};

export default nextConfig;
