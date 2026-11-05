
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function toHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function signIdentity(
  secret: string,
  publicKey: string,
  userId: string,
  expiry: number,
): Promise<string> {
  const message = [
    "offerwall-user-v1",
    publicKey,
    userId,
    String(expiry),
  ].join("\n");

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );

  return toHex(
    await crypto.subtle.sign(
      "HMAC",
      key,
      new TextEncoder().encode(message),
    ),
  );
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  try {
    const authorization = req.headers.get("Authorization");

    if (!authorization?.startsWith("Bearer ")) {
      return json({ error: "Authentication required" }, 401);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const publicKey = Deno.env.get("OFFERWALL_PUBLIC_API_KEY");
    const secret = Deno.env.get("OFFERWALL_SECRET_KEY");

    if (!supabaseUrl || !anonKey || !publicKey || !secret) {
      return json({ error: "Server configuration incomplete" }, 500);
    }

    const supabase = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authorization } },
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    const { data, error } = await supabase.auth.getUser();

    if (error || !data.user) {
      return json({ error: "Invalid session" }, 401);
    }

    const userId = data.user.id;
    const expiry = Math.floor(Date.now() / 1000) + 3600;

    const signature = await signIdentity(
      secret,
      publicKey,
      userId,
      expiry,
    );

    const offerwallUrl = new URL(
      `https://offerwall.me/offerwall/${encodeURIComponent(publicKey)}/${encodeURIComponent(userId)}`,
    );

    offerwallUrl.searchParams.set("identityExpires", String(expiry));
    offerwallUrl.searchParams.set("identitySignature", signature);

    return json({
      url: offerwallUrl.toString(),
      expires_at: expiry,
    });
  } catch {
    return json({ error: "Unable to create Offerwall session" }, 500);
  }
});
