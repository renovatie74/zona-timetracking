import { defineConfig } from 'vitest/config';
import { cloudflareTest } from '@cloudflare/vitest-pool-workers';

export default defineConfig({
  plugins: [
    cloudflareTest({
      wrangler: { configPath: './wrangler.toml', environment: 'dev' },
      miniflare: {
        // Provide test secrets (not committable to wrangler.toml)
        vars: {
          JWT_SECRET:    'test-jwt-secret-00000000000000000000000000000000',
          EMAIL_API_KEY: 'test-api-key',
        },
      },
    }),
  ],
});
