# TOKENHUB

Rewards platform: users complete verified tasks, earn tokens, invite friends and request withdrawals.
React 19 + TypeScript + Vite 8 on the front end, Supabase (Auth, PostgreSQL, Edge Functions) on the back end, deployed on Vercel.

## Architecture

| Layer | What it does |
| --- | --- |
| `src/` | SPA. Hash routing (`#/earn`, `#/wallet`, ...), Supabase Auth, no business rules. |
| `supabase/migrations/` | Schema alignment, RLS, secure SQL functions. **All balance changes go through `credit_wallet()`**, which clients cannot call. |
| `supabase/functions/provider-callback/` | Verifies provider HMAC signatures, then calls `process_provider_event()` with the service role. |
| `supabase/tests/` | Local test suite (plain PostgreSQL + Supabase stub, and Deno for the Edge Function). |

Security rules enforced in the database: users can only read their own rows; wallets, transactions, referrals, provider events
and withdrawals are not writable by clients; rewards use `tasks.reward` (never a client/provider amount); every movement has a
unique idempotency key; admins live in `admin_users` and every admin RPC re-checks `is_admin()`.

## Local development

```bash
cp .env.example .env.local   # fill VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY
npm install
npm run dev
npm run lint && npm run build
```

## Documentation

- `docs/DEPLOYMENT_REVIEW.md`: what changed, exact deployment order, risks (requires approval before production).
- `docs/PROVIDER_INTEGRATION.md`: how to connect an offerwall/survey provider.
- `supabase/inspect_schema.sql`: read-only schema inspection to run before the migration.
