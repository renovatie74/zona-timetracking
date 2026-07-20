import { router } from './router.js';
import { flagUnclosed } from './cron/flagUnclosed.js';

export default {
  async fetch(request, env, ctx) {
    try {
      return await router.handle(request, env, ctx);
    } catch (err) {
      console.error('[worker] unhandled error:', err?.message ?? err);
      return Response.json({ error: err?.message ?? 'Internal server error' }, { status: 422 });
    }
  },

  async scheduled(event, env, ctx) {
    ctx.waitUntil(flagUnclosed(env));
  },
};
