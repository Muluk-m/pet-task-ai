// 测试环境的绑定类型（与 test/wrangler.test.jsonc + vitest.config.ts 保持一致）
declare namespace Cloudflare {
  interface Env {
    DB: D1Database;
    TEST_MIGRATIONS: import("@cloudflare/vitest-pool-workers").D1Migration[];
    ENVIRONMENT: string;
    AUTH_SECRET: string;
    OPENAI_API_KEY: string;
    VAPID_PRIVATE_KEY: string;
  }
}
