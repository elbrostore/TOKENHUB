
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

function reject(reason: string, status: number, details?: unknown) {
  console.warn("OFFERWALL_POSTBACK_REJECTED", {
    reason,
    status,
    details,
  });
  return response(reason, status);
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
  const contentType = (
    req.headers.get("content-type") ?? ""
  ).split(";")[0].trim().toLowerCase();

  console.log("OFFERWALL_POSTBACK_RECEIVED", {
    method: req.method,
    contentType,
  });

  if (req.method !== "POST") {
    return reject("Method not allowed", 405);
  }

  try {
    const secret = Deno.env.get("OFFERWALL_SECRET_KEY");
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!secret || !supabaseUrl || !serviceKey) {
      console.error("OFFERWALL_POSTBACK_CONFIG_ERROR", {
        hasSecret: Boolean(secret),
        hasSupabaseUrl: Boolean(supabaseUrl),
        hasServiceKey: Boolean(serviceKey),
      });
      return reject("Server configuration error", 500);
    }

    if (
      contentType !== "application/json" &&
      contentType !== "application/x-www-form-urlencoded"
    ) {
      return reject("Unsupported content type", 415, {
        contentType,
      });
    }

    const contentLengthHeader = req.headers.get("content-length");
    const contentLength = contentLengthHeader === null
      ? 0
      : Number(contentLengthHeader);

    if (
      !Number.isFinite(contentLength) ||
      contentLength < 0 ||
      contentLength > MAX_BODY_SIZE
    ) {
      return reject("Invalid request size", 413);
    }

    const rawBody = await req.text();

    if (new TextEncoder().encode(rawBody).length > MAX_BODY_SIZE) {
      return reject("Request too large", 413);
    }

    const params = new URLSearchParams();

    if (contentType === "application/json") {
      let body: unknown;

      try {
        body = JSON.parse(rawBody);
      } catch {
        return reject("Invalid JSON", 400);
      }

      if (
        typeof body !== "object" ||
        body === null ||
        Array.isArray(body)
      ) {
        return reject("Invalid JSON body", 400);
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

    const receivedKeys = Array.from(params.keys());

    console.log("OFFERWALL_POSTBACK_PARAMETERS", {
      receivedKeys,
      hasSubId: params.has("subId"),
      hasTransId: params.has("transId"),
      hasReward: params.has("reward"),
      hasStatus: params.has("status"),
      hasSignature: params.has("signature"),
      hasPayout: params.has("payout"),
    });

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
      return reject("Missing or invalid parameters", 400, {
        hasSubId: Boolean(subId),
        hasTransId: Boolean(transId),
        hasReward: Boolean(rewardRaw),
        hasSignature: Boolean(signature),
        statusPresent: Boolean(status),
        validStatus: ["1", "2"].includes(status),
      });
    }

    if (!validUuid(subId)) {
      return reject("Invalid user ID", 400);
    }

    if (
      transId.trim().length === 0 ||
      transId.length > 255
    ) {
      return reject("Invalid transaction ID", 400);
    }

    if (
      !/^\d+$/.test(rewardRaw) ||
      !/^\d+(\.\d{1,4})?$/.test(payoutRaw)
    ) {
      return reject("Invalid numeric values", 400, {
        rewardFormatValid: /^\d+$/.test(rewardRaw),
        payoutFormatValid: /^\d+(\.\d{1,4})?$/.test(payoutRaw),
      });
    }

    if (!/^[a-f0-9]{32}$/.test(signature)) {
      return reject("Invalid signature format", 403);
    }

    const expected = CryptoJS.MD5(
      subId + transId + rewardRaw + secret,
    ).toString().toLowerCase();

    if (!safeEqual(expected, signature)) {
      return reject("Invalid signature", 403);
    }

    const reward = Number(rewardRaw);
    const payout = Number(payoutRaw);

    if (
      !Number.isSafeInteger(reward) ||
      reward <= 0 ||
      !Number.isFinite(payout) ||
      payout < 0
    ) {
      return reject("Invalid reward or payout", 400);
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
      console.error("OFFERWALL_POSTBACK_PROCESSING_ERROR", {
        message: error.message,
        code: error.code,
      });
      return reject("Processing failed", 500);
    }

    console.log("OFFERWALL_POSTBACK_PROCESSED", {
      result: data?.result ?? "ok",
    });

    return response("ok", 200);
  } catch (error) {
    console.error("OFFERWALL_POSTBACK_UNEXPECTED_ERROR", {
      message: error instanceof Error ? error.message : "Unknown error",
    });
    return reject("Internal server error", 500);
  }
});
