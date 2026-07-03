import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { app } from "../src/index";

function register(body: unknown) {
  return app.request(
    "/api/auth/register",
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    },
    env,
  );
}

describe("POST /api/auth/register", () => {
  it("creates an account and starts a session", async () => {
    const res = await register({
      username: "newbie",
      password: "test-password-1",
    });
    expect(res.status).toBe(201);
    const data = (await res.json()) as { user: { username: string } };
    expect(data.user.username).toBe("newbie");
    expect(res.headers.get("set-cookie")).toContain("pt_session=");

    const login = await app.request(
      "/api/auth/login",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          username: "newbie",
          password: "test-password-1",
        }),
      },
      env,
    );
    expect(login.status).toBe(200);
  });

  it("rejects duplicate usernames", async () => {
    const first = await register({
      username: "dupe",
      password: "test-password-1",
    });
    expect(first.status).toBe(201);
    const second = await register({
      username: "dupe",
      password: "test-password-2",
    });
    expect(second.status).toBe(409);
  });

  it("supports profile update and password change with the new session", async () => {
    const res = await register({
      username: "profiler",
      password: "test-password-1",
    });
    expect(res.status).toBe(201);
    const cookie = res.headers.get("set-cookie")?.split(";")[0] ?? "";

    const profile = await app.request(
      "/api/auth/profile",
      {
        method: "PATCH",
        headers: { "content-type": "application/json", cookie },
        body: JSON.stringify({ displayName: "毛毛的铲屎官" }),
      },
      env,
    );
    expect(profile.status).toBe(200);
    const profileData = (await profile.json()) as {
      user: { displayName: string };
    };
    expect(profileData.user.displayName).toBe("毛毛的铲屎官");

    const wrongCurrent = await app.request(
      "/api/auth/password",
      {
        method: "POST",
        headers: { "content-type": "application/json", cookie },
        body: JSON.stringify({
          currentPassword: "nope-nope",
          newPassword: "test-password-3",
        }),
      },
      env,
    );
    expect(wrongCurrent.status).toBe(400);

    const changed = await app.request(
      "/api/auth/password",
      {
        method: "POST",
        headers: { "content-type": "application/json", cookie },
        body: JSON.stringify({
          currentPassword: "test-password-1",
          newPassword: "test-password-3",
        }),
      },
      env,
    );
    expect(changed.status).toBe(200);

    const relogin = await app.request(
      "/api/auth/login",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          username: "profiler",
          password: "test-password-3",
        }),
      },
      env,
    );
    expect(relogin.status).toBe(200);
  });

  it("rejects profile routes without a session", async () => {
    const res = await app.request(
      "/api/auth/profile",
      {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ displayName: "hacker" }),
      },
      env,
    );
    expect(res.status).toBe(401);
  });

  it("rejects invalid input", async () => {
    expect(
      (await register({ username: "a", password: "test-password-1" })).status,
    ).toBe(400);
    expect(
      (await register({ username: "ok-name", password: "123" })).status,
    ).toBe(400);
    expect(
      (await register({ username: "带空格 的", password: "test-password-1" }))
        .status,
    ).toBe(400);
  });
});
