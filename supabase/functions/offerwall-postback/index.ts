
import { createClient } from "npm:@supabase/supabase-js@2";
import CryptoJS from "npm:crypto-js@4.2.0";

const MAX_BODY_SIZE = 16 * 1024;

function response(text: string, status = 200) {
  return new Response(text, {
    status,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
    },
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
  if (req.method !== "POST") {
    return response("Method not allowed", 405);
  }

  try {
    const secret = Deno.env.get("OFFERWALL_SECRET_KEY");
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!secret || !supabaseUrl || !serviceKey) {
      console.error("Offerwall server configuration is incomplete");
      return response("Server configuration error", 500);
    }

    const contentType = (
      req.headers.get("content-type") ?? ""
    ).split(";")[0].trim().toLowerCase();

    if (
      contentType !== "application/json" &&
      contentType !== "application/x-www-form-urlencoded"
    ) {
      return response("Unsupported content type", 415);
    }

    const contentLength = Number(req.headers.get("content-length") ?? "0");

    if (
      !Number.isFinite(contentLength) ||
      contentLength < 0 ||
      contentLength > MAX_BODY_SIZE
    ) {
      return response("Invalid request size", 413);
    }

    const rawBody = await req.text();

    if (new TextEncoder().encode(rawBody).length > MAX_BODY_SIZE) {
      return response("Request too large", 413);
    }

    const params = new URLSearchParams();

    if (contentType === "application/json") {
      let body: unknown;

      try {
        body = JSON.parse(rawBody);
      } catch {
        return response("Invalid JSON", 400);
      }

      if (
        typeof body !== "object" ||
        body === null ||
        Array.isArray(body)
      ) {
        return response("Invalid JSON body", 400);
      }

      for (const [key, value] of Object.entries(body)) {
        if (
          value !== undefined &&
          value !== null &&
          typeof value !== "object"
        ) {
          params.set(key, String(value));
        }
      }
    } else {
      const form = new URLSearchParams(rawBody);

      for (const [key, value] of form.entries()) {
        params.set(key, value);
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

    if (
      transId.trim().length === 0 ||
      transId.length > 255
    ) {
      return response("Invalid transaction ID", 400);
    }

    // Placement currency uses zero decimal places.
    if (
      !/^\d+$/.test(rewardRaw) ||
      !/^\d+(\.\d{1,4})?$/.test(payoutRaw)
    ) {
      return response("Invalid numeric values", 400);
    }

    if (!/^[a-f0-9]{32}$/.test(signature)) {
      return response("Invalid signature", 403);
    }

    const expected = CryptoJS.MD5(
      subId + transId + rewardRaw + secret,
    ).toString().toLowerCase();

    if (!safeEqual(expected, signature)) {
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
      console.error(
        "Offerwall transaction processing failed:",
        error.message,
      );
      return response("Processing failed", 500);
    }

    console.log(
      "Offerwall postback processed:",
      data?.result ?? "ok",
    );

    return response("ok", 200);
  } catch (error) {
    console.error("Offerwall postback error:", error);
    return response("Internal server error", 500);
  }
});
