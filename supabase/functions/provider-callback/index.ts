// Supabase Edge Function: provider-callback
// Receives server-to-server reward confirmations from an offerwall/survey/ad provider.
//
// SECURITY MODEL
//  1. The request must carry an HMAC-SHA256 signature computed with a secret shared ONLY between us
//     and the provider (PROVIDER_SECRET_<PROVIDER>), over `${timestamp}.${rawBody}`.
//  2. The timestamp must be within 5 minutes (replay window); event_id is also globally unique per
//     provider in the database, so replays are no-ops.
//  3. The token amount is NEVER read from the request. The database credits tasks.reward for the
//     task bound to the user's click_id (see process_provider_event in the migration).
//
// Deploy (after approval):  supabase functions deploy provider-callback --no-verify-jwt
// Provider URL:             https://<project-ref>.supabase.co/functions/v1/provider-callback?provider=<key>
// NOTE: this is a GENERIC adapter. Real networks use their own signature/parameter formats: adapt
// `verifySignature` and `parseEvent` per provider when credentials/documentation are available.
import { createClient } from "npm:@supabase/supabase-js@2";

const MAX_BODY_BYTES = 64 * 1024;
const REPLAY_WINDOW_SECONDS = 300;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const json = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

async function hmacHex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });

  const provider = new URL(req.url).searchParams.get("provider")?.toLowerCase() ?? "";
  if (!/^[a-z0-9_-]{2,32}$/.test(provider)) return json(400, { error: "invalid_provider" });

  const secret = Deno.env.get(`PROVIDER_SECRET_${provider.toUpperCase().replace(/-/g, "_")}`);
  if (!secret) return json(503, { error: "provider_not_configured" }); // fail closed

  const raw = await req.text();
  if (new TextEncoder().encode(raw).length > MAX_BODY_BYTES) return json(413, { error: "payload_too_large" });

  const timestamp = req.headers.get("x-timestamp") ?? "";
  const age = Math.abs(Date.now() / 1000 - Number(timestamp));
  if (!Number.isFinite(age) || age > REPLAY_WINDOW_SECONDS) return json(401, { error: "stale_or_missing_timestamp" });

  const provided = (req.headers.get("x-signature") ?? "").replace(/^sha256=/, "").toLowerCase();
  const expected = await hmacHex(secret, `${timestamp}.${raw}`);
  if (!timingSafeEqual(provided, expected)) return json(401, { error: "invalid_signature" });

  let body: Record<string, unknown>;
  try { body = JSON.parse(raw); } catch { return json(400, { error: "invalid_json" }); }

  const eventId = typeof body.event_id === "string" ? body.event_id.slice(0, 128) : "";
  const clickId = typeof body.click_id === "string" ? body.click_id : "";
  const eventType = typeof body.event_type === "string" ? body.event_type : "completed";
  if (!eventId || !UUID_RE.test(clickId)) return json(400, { error: "invalid_event" });

  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceKey) return json(500, { error: "server_misconfigured" });

  const supabase = createClient(url, serviceKey, { auth: { persistSession: false } });
  const { data, error } = await supabase.rpc("process_provider_event", {
    p_provider: provider, p_event_id: eventId, p_click_id: clickId, p_event_type: eventType, p_payload: body,
  });
  if (error) {
    console.error("process_provider_event failed", error.message);
    return json(500, { error: "processing_failed" }); // provider may retry; replays are idempotent
  }
  // 200 for processed/duplicate/rejected so providers do not retry business rejections forever.
  return json(200, data as Record<string, unknown>);
});
