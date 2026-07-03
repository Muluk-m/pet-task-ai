import { applyD1Migrations, env } from "cloudflare:test";

await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);

// 动态创建测试用户（避免真实账号密码出现在仓库中）
const encoder = new TextEncoder();
const salt = crypto.getRandomValues(new Uint8Array(16));
const key = await crypto.subtle.importKey(
  "raw",
  encoder.encode("test-password"),
  "PBKDF2",
  false,
  ["deriveBits"],
);
const bits = await crypto.subtle.deriveBits(
  { name: "PBKDF2", hash: "SHA-256", salt, iterations: 10000 },
  key,
  256,
);
const b64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));
const stored = `pbkdf2$10000$${b64(salt)}$${b64(new Uint8Array(bits))}`;

await env.DB.prepare(
  "INSERT OR IGNORE INTO users (username, password_hash) VALUES ('tester', ?)",
)
  .bind(stored)
  .run();
