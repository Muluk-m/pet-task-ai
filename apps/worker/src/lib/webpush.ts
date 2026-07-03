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

async function signVapidJwt(
  audience: string,
  subject: string,
  privateKeyPkcs8Base64: string,
): Promise<string> {
  const header = base64UrlEncode(
    encoder.encode(JSON.stringify({ typ: "JWT", alg: "ES256" })),
  );
  const payload = base64UrlEncode(
    encoder.encode(
      JSON.stringify({
        aud: audience,
        exp: Math.floor(Date.now() / 1000) + 12 * 60 * 60,
        sub: subject,
      }),
    ),
  );

  const privateKey = await crypto.subtle.importKey(
    "pkcs8",
    base64Decode(privateKeyPkcs8Base64),
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    privateKey,
    encoder.encode(`${header}.${payload}`),
  );

  return `${header}.${payload}.${base64UrlEncode(signature)}`;
}

export type PushSendResult = "ok" | "gone" | "error";

/**
 * 发送无 payload 的 Web Push（免去 RFC8291 加密）；
 * Service Worker 收到 push 事件后展示固定文案的提醒。
 */
export async function sendPushNotification(
  endpoint: string,
  vapid: { publicKey: string; privateKeyPkcs8Base64: string; subject: string },
): Promise<PushSendResult> {
  const audience = new URL(endpoint).origin;
  const jwt = await signVapidJwt(
    audience,
    vapid.subject,
    vapid.privateKeyPkcs8Base64,
  );

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      TTL: "86400",
      Urgency: "normal",
      Authorization: `vapid t=${jwt}, k=${vapid.publicKey}`,
    },
  });

  if (response.status === 404 || response.status === 410) {
    return "gone";
  }
  return response.ok || response.status === 201 ? "ok" : "error";
}
