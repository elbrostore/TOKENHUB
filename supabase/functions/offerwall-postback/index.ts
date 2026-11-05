
import { createClient } from "npm:@supabase/supabase-js@2";
import CryptoJS from "npm:crypto-js@4.2.0";

function response(text: string, status = 200) {
  return new Response(text, {
    status,
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;

  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

function validUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

Deno.serve(async (req) => {
  if (req.method !== "POST" && req.method !== "GET") {
    return response("Method not allowed", 405);
  }

  try {
    const secret = Deno.env.get("OFFERWALL_SECRET_KEY");
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!secret || !supabaseUrl || !serviceKey) {
      return response("Server configuration error", 500);
    }

    const params = new URLSearchParams(new URL(req.url).search);

    if (req.method === "POST") {
      const contentType = req.headers.get("content-type") ?? "";

      if (contentType.includes("application/json")) {
        const body = await req.json();
        for (const [key, value] of Object.entries(body)) {
          if (value !== undefined && value !== null) {
            params.set(key, String(value));
          }
        }
      } else {
        const body = new URLSearchParams(await req.text());
        for (const [key, value] of body.entries()) {
          params.set(key, value);
        }
      }
    }

    const subId = params.get("subId") ?? "";
    const transId = params.get("transId") ?? "";
    const rewardRaw = params.get("reward") ?? "";
    const status = params.get("status") ?? "";
    const signature = (params.get("signature") ?? "").toLowerCase();
    const payoutRaw = params.get("payout") ?? "0";

    if (
      !subId ||
      !transId ||
      !rewardRaw ||
      !signature ||
      !["1", "2"].includes(status)
    ) {
      return response("Missing or invalid parameters", 400);
    }

    if (!validUuid(subId)) {
      return response("Invalid user ID", 400);
    }

    // Placement currency is configured with zero decimal places.
    if (!/^\d+$/.test(rewardRaw) || !/^\d+(\.\d+)?$/.test(payoutRaw)) {
      return response("Invalid numeric values", 400);
    }

    const expected = CryptoJS.MD5(
      subId + transId + rewardRaw + secret,
    ).toString().toLowerCase();

    if (!/^[a-f0-9]{32}$/.test(signature) ||
        !safeEqual(expected, signature)) {
      return response("Invalid signature", 403);
    }

    const reward = Number(rewardRaw);
    const payout = Number(payoutRaw);

    if (
      !Number.isSafeInteger(reward) ||
      reward <= 0 ||
      !Number.isFinite(payout) ||
      payout < 0
    ) {
      return response("Invalid reward or payout", 400);
    }

    const supabase = createClient(supabaseUrl, serviceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    const { data, error } = await supabase.rpc(
      "process_offerwall_transaction",
      {
        p_trans_id: transId,
        p_user_id: subId,
        p_reward_units: reward,
        p_payout_usd: payout,
        p_status: status,
        p_offer_name: params.get("offer_name"),
        p_offer_type: params.get("offer_type"),
        p_payload: {
          reward_name: params.get("reward_name"),
          reward_value: params.get("reward_value"),
          userIp: params.get("userIp"),
          country: params.get("country"),
          status,
        },
      },
    );

    if (error) {
      console.error("Offerwall transaction processing failed:", error.message);
      return response("Processing failed", 500);
    }

    console.log("Offerwall postback processed:", data?.result ?? "ok");
    return response("ok", 200);
  } catch (error) {
    console.error("Offerwall postback error:", error);
    return response("Internal server error", 500);
  }
});
