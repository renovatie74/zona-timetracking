import { router } from './router.js';
import { flagUnclosed } from './cron/flagUnclosed.js';

export default {
  async fetch(request, env, ctx) {
    return router.handle(request, env, ctx);
  },

  async scheduled(event, env, ctx) {
    ctx.waitUntil(flagUnclosed(env));
  },
};
