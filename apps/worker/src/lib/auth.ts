const encoder = new TextEncoder();

function base64UrlEncode(bytes: ArrayBuffer | Uint8Array): string {
  const array = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let binary = "";
  for (const byte of array) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function base64Decode(value: string) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

const PBKDF2_ITERATIONS = 10_000;

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt, iterations: PBKDF2_ITERATIONS },
    key,
    256,
  );
  const saltB64 = btoa(String.fromCharCode(...salt));
  const hashB64 = btoa(String.fromCharCode(...new Uint8Array(bits)));
  return `pbkdf2$${PBKDF2_ITERATIONS}$${saltB64}$${hashB64}`;
}

export async function verifyPassword(
  password: string,
  stored: string,
): Promise<boolean> {
  const parts = stored.split("$");
  if (parts.length !== 4 || parts[0] !== "pbkdf2") {
    return false;
  }
  const iterations = Number(parts[1]);
  const salt = base64Decode(parts[2]);
  const expected = parts[3];

  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt, iterations },
    key,
    256,
  );
  const actual = btoa(String.fromCharCode(...new Uint8Array(bits)));
  return actual === expected;
}

async function hmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30;

export async function createSessionToken(
  userId: number,
  secret: string,
): Promise<string> {
  const exp = Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS;
  const payload = base64UrlEncode(encoder.encode(`${userId}.${exp}`));
  const signature = await crypto.subtle.sign(
    "HMAC",
    await hmacKey(secret),
    encoder.encode(payload),
  );
  return `${payload}.${base64UrlEncode(signature)}`;
}

export async function verifySessionToken(
  token: string,
  secret: string,
): Promise<number | null> {
  const [payload, signature] = token.split(".");
  if (!payload || !signature) {
    return null;
  }

  const normalized = signature.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
  let signatureBytes: Uint8Array<ArrayBuffer>;
  try {
    signatureBytes = base64Decode(padded);
  } catch {
    return null;
  }

  const valid = await crypto.subtle.verify(
    "HMAC",
    await hmacKey(secret),
    signatureBytes,
    encoder.encode(payload),
  );
  if (!valid) {
    return null;
  }

  let decoded: string;
  try {
    const normalizedPayload = payload.replace(/-/g, "+").replace(/_/g, "/");
    decoded = new TextDecoder().decode(
      base64Decode(
        normalizedPayload +
          "=".repeat((4 - (normalizedPayload.length % 4)) % 4),
      ),
    );
  } catch {
    return null;
  }

  const [userIdRaw, expRaw] = decoded.split(".");
  const userId = Number(userIdRaw);
  const exp = Number(expRaw);
  if (!Number.isInteger(userId) || !Number.isFinite(exp)) {
    return null;
  }
  if (exp * 1000 < Date.now()) {
    return null;
  }
  return userId;
}

export const SESSION_COOKIE = "pt_session";
export const SESSION_MAX_AGE = SESSION_TTL_SECONDS;
