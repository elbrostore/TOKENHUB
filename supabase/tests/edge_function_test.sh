#!/usr/bin/env bash
# Tests the provider-callback signature gate locally with Deno (no real Supabase needed: valid
# requests reach the RPC call and fail with 500 because SUPABASE_URL points to a dead port).
set -u
export PROVIDER_SECRET_ACME="test-secret-not-real" SUPABASE_URL="http://127.0.0.1:9" SUPABASE_SERVICE_ROLE_KEY="x"
cd "$(dirname "$0")/../functions/provider-callback"
deno run --allow-net --allow-env --allow-read --no-prompt index.ts >/tmp/edge.log 2>&1 &
PID=$!; sleep 6
URL="http://127.0.0.1:8000"
sign() { printf '%s' "$1.$2" | openssl dgst -sha256 -hmac "$PROVIDER_SECRET_ACME" | sed 's/^.* //'; }
BODY='{"event_id":"e1","click_id":"6f1c2f7e-1a2b-4c3d-8e9f-0123456789ab","event_type":"completed","amount":999999}'
TS=$(date +%s); SIG=$(sign "$TS" "$BODY")
code() { curl -s -o /dev/null -w '%{http_code}' "$@"; }
echo "GET not allowed:            $(code $URL/?provider=acme) (want 405)"
echo "bad provider name:          $(code -X POST "$URL/?provider=A!" -d "$BODY") (want 400)"
echo "unconfigured provider:      $(code -X POST "$URL/?provider=other" -d "$BODY") (want 503)"
echo "missing signature:          $(code -X POST "$URL/?provider=acme" -H "x-timestamp: $TS" -d "$BODY") (want 401)"
echo "wrong signature:            $(code -X POST "$URL/?provider=acme" -H "x-timestamp: $TS" -H "x-signature: deadbeef" -d "$BODY") (want 401)"
echo "tampered body:              $(code -X POST "$URL/?provider=acme" -H "x-timestamp: $TS" -H "x-signature: $SIG" -d "${BODY/999999/1}") (want 401)"
OLD=$((TS-3600)); OSIG=$(sign "$OLD" "$BODY")
echo "stale timestamp (replay):   $(code -X POST "$URL/?provider=acme" -H "x-timestamp: $OLD" -H "x-signature: $OSIG" -d "$BODY") (want 401)"
BAD='{"event_id":"e1","click_id":"not-a-uuid"}'; BSIG=$(sign "$TS" "$BAD")
echo "valid sig, invalid event:   $(code -X POST "$URL/?provider=acme" -H "x-timestamp: $TS" -H "x-signature: $BSIG" -d "$BAD") (want 400)"
echo "valid sig reaches database: $(code -X POST "$URL/?provider=acme" -H "x-timestamp: $TS" -H "x-signature: sha256=$SIG" -d "$BODY") (want 500: DB unreachable here)"
kill $PID 2>/dev/null
