import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

serve((req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
      },
    });
  }

  const headers = req.headers;

  const result = {
    success: true,
    diagnostic: {
      cfConnectingIpPresent: headers.has("cf-connecting-ip"),
      cfIpCountryPresent: headers.has("cf-ipcountry"),
      xForwardedForPresent: headers.has("x-forwarded-for"),
      xRealIpPresent: headers.has("x-real-ip"),
    },
    message: "Header presence check only. No IP address or secrets are returned.",
  };

  return new Response(JSON.stringify(result), {
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
    },
  });
});