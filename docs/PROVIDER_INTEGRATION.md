# Provider integration (architecture, not connected)

No external provider is connected. Nothing here invents credentials or pretends a provider works.

## Flow
1. Admin creates a task (Admin > Tasks) with `provider` key (e.g. `acme`), `reward` and a provider URL containing `{click_id}`.
2. User clicks **Start**: `start_task()` creates (or reuses) an open `task_completions` row with a random `click_id` and returns the URL with the id substituted. The provider must echo this id back (often called `sub_id` / `s1`).
3. Provider calls `POST https://<project-ref>.supabase.co/functions/v1/provider-callback?provider=acme` with headers `x-timestamp` (unix seconds) and `x-signature` (hex HMAC-SHA256 of `${timestamp}.${rawBody}`, optional `sha256=` prefix) and JSON body `{ "event_id": "...", "click_id": "<uuid>", "event_type": "completed" }`.
4. The function checks signature + 5-minute window, then `process_provider_event()` (service role only) checks: event id unseen, click exists and is still open, provider matches the task, user active. It then credits `tasks.reward` once and qualifies the referral reward on the referred user's first verified task.

## Fraud controls implemented
- HMAC signature and replay window; per-provider secret; fails closed if the secret is missing.
- Unique `(provider, event_id)`: replays return `duplicate`.
- A click can complete once; per-task limit per user (`max_completions_per_user`).
- Amount comes from the database; the provider payload amount is ignored.
- Every event is logged in `provider_events` (visible in Admin > Provider events).

## Still required per real provider (BLOCKED: needs credentials/documentation)
- Provider account, postback format and its real signature scheme (adapt `verifySignature`/`parseEvent` in the function).
- `supabase secrets set PROVIDER_SECRET_<PROVIDER>=...` (never commit it).
- Chargeback/reversal handling (provider-specific; not implemented).
- IP/device fraud signals (not available without provider data).
