import { createClient } from "npm:@supabase/supabase-js@2.112.2";
import { errorResponse, jsonResponse } from "../_shared/http.ts";

type WebhookPayload = {
  type?: string;
  table?: string;
  record?: Record<string, unknown>;
};

type DeviceTokenRow = {
  token: string;
  environment: "sandbox" | "production";
};

function base64url(value: Uint8Array | string): string {
  const bytes = typeof value === "string" ? new TextEncoder().encode(value) : value;
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

function pkcs8Bytes(pem: string): Uint8Array {
  const normalized = pem.replaceAll("\\n", "\n");
  const body = normalized
    .replace("-----BEGIN PRIVATE KEY-----", "")
    .replace("-----END PRIVATE KEY-----", "")
    .replaceAll(/\s/g, "");
  const binary = atob(body);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

async function createProviderToken(privateKey: string, keyId: string, teamId: string): Promise<string> {
  const header = base64url(JSON.stringify({ alg: "ES256", kid: keyId }));
  const claims = base64url(JSON.stringify({ iss: teamId, iat: Math.floor(Date.now() / 1000) }));
  const unsignedToken = `${header}.${claims}`;
  const key = await crypto.subtle.importKey(
    "pkcs8",
    pkcs8Bytes(privateKey),
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    key,
    new TextEncoder().encode(unsignedToken),
  );
  return `${unsignedToken}.${base64url(new Uint8Array(signature))}`;
}

function compactText(value: unknown, limit: number): string {
  return typeof value === "string" ? value.replaceAll(/\s+/g, " ").trim().slice(0, limit) : "";
}

async function secretsMatch(received: string | null, expected: string): Promise<boolean> {
  if (!received) return false;
  const encoder = new TextEncoder();
  const [left, right] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(received)),
    crypto.subtle.digest("SHA-256", encoder.encode(expected)),
  ]);
  const leftBytes = new Uint8Array(left);
  const rightBytes = new Uint8Array(right);
  let difference = leftBytes.length ^ rightBytes.length;
  for (let index = 0; index < Math.max(leftBytes.length, rightBytes.length); index += 1) {
    difference |= (leftBytes[index] ?? 0) ^ (rightBytes[index] ?? 0);
  }
  return difference === 0;
}

Deno.serve(async (request: Request) => {
  if (request.method !== "POST") return errorResponse("Method not allowed", 405);

  const supabaseURL = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const webhookSecret = Deno.env.get("WEBHOOK_SECRET");
  const privateKey = Deno.env.get("APNS_PRIVATE_KEY");
  const keyId = Deno.env.get("APNS_KEY_ID");
  const teamId = Deno.env.get("APNS_TEAM_ID");
  const topic = Deno.env.get("APNS_TOPIC");
  if (!supabaseURL || !serviceRoleKey || !webhookSecret) return errorResponse("Service configuration is missing", 503);
  if (!await secretsMatch(request.headers.get("x-webhook-secret"), webhookSecret)) {
    return errorResponse("Webhook authentication required", 401);
  }
  if (!privateKey || !keyId || !teamId || !topic) return errorResponse("APNs provider is not configured", 503);

  let payload: WebhookPayload;
  try {
    payload = await request.json();
  } catch {
    return errorResponse("Invalid JSON body", 400);
  }
  if (payload.type !== "INSERT" || !payload.table || !payload.record) {
    return errorResponse("Unsupported webhook event", 400);
  }

  const admin = createClient(supabaseURL, serviceRoleKey, { auth: { persistSession: false } });
  let targetIds: string[] = [];
  let title = "UniShare";
  let body = "You have a new update";
  const deepLink = "unishare://chats";

  if (payload.table === "messages") {
    const chatId = compactText(payload.record.chat_id, 64);
    const senderId = compactText(payload.record.sender_id, 64);
    if (!chatId || !senderId) return errorResponse("Invalid message record", 400);
    const [{ data: chat }, { data: sender }] = await Promise.all([
      admin.from("chats").select("participants").eq("id", chatId).maybeSingle(),
      admin.from("users").select("username").eq("uid", senderId).maybeSingle(),
    ]);
    targetIds = ((chat?.participants as string[] | null) ?? []).filter((id) => id !== senderId);
    title = compactText(sender?.username, 40) || "New message";
    body = compactText(payload.record.text, 120) || "Sent an image";
  } else if (payload.table === "like_requests") {
    const recipientId = compactText(payload.record.to_uid, 64);
    const senderId = compactText(payload.record.from_uid, 64);
    if (!recipientId || !senderId) return errorResponse("Invalid like record", 400);
    const { data: sender } = await admin.from("users").select("username").eq("uid", senderId).maybeSingle();
    targetIds = [recipientId];
    title = "New connection request";
    body = `${compactText(sender?.username, 40) || "Someone"} liked your profile`;
  } else {
    return errorResponse("Unsupported webhook table", 400);
  }

  if (targetIds.length === 0) return jsonResponse({ sent: 0, failed: 0 });
  const { data: tokenRows, error: tokenError } = await admin
    .from("device_tokens")
    .select("token,environment")
    .in("user_id", targetIds)
    .limit(500);
  if (tokenError) return errorResponse("Unable to load notification recipients", 500);

  const providerToken = await createProviderToken(privateKey, keyId, teamId);
  const notification = JSON.stringify({
    aps: { alert: { title, body }, sound: "default", "thread-id": "unishare-messages" },
    deep_link: deepLink,
  });
  let sent = 0;
  let failed = 0;
  const invalidTokens: string[] = [];

  await Promise.all(((tokenRows ?? []) as DeviceTokenRow[]).map(async (row) => {
    const host = row.environment === "production" ? "api.push.apple.com" : "api.sandbox.push.apple.com";
    try {
      const response = await fetch(`https://${host}/3/device/${row.token}`, {
        method: "POST",
        headers: {
          authorization: `bearer ${providerToken}`,
          "apns-topic": topic,
          "apns-push-type": "alert",
          "apns-priority": "10",
          "content-type": "application/json",
        },
        body: notification,
        signal: AbortSignal.timeout(8_000),
      });
      if (response.ok) {
        sent += 1;
        return;
      }
      failed += 1;
      const reason = compactText((await response.json().catch(() => ({})) as { reason?: string }).reason, 80);
      if (response.status === 410 || ["BadDeviceToken", "DeviceTokenNotForTopic", "Unregistered"].includes(reason)) {
        invalidTokens.push(row.token);
      }
    } catch {
      failed += 1;
    }
  }));

  if (invalidTokens.length > 0) await admin.from("device_tokens").delete().in("token", invalidTokens);
  return jsonResponse({ sent, failed, removed: invalidTokens.length, deepLink });
});
