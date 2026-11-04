# TOKENHUB — Deployment review (NOTHING has been pushed, migrated or deployed)

Migration: `supabase/migrations/20261104020000_tokenhub_complete_backend.sql` (sha256 7099793e52196e07…) — this file IS the exact SQL.
The pre-existing empty file `20261104011849_tokenhub_core_fixes.sql` was left untouched.

## 1. Implemented
Auth (register/login/logout/recovery/resend confirmation/persistent session/auto-provisioning), Dashboard, Earn Tokens (real tasks, start/track, provider architecture),
Wallet, Transactions (filters + pagination), Referrals (code, link, tracking), Withdrawals, Notifications, Settings (profile, password, global sign-out), Admin (overview, users, tasks, withdrawals, transactions, provider events, settings).

## 2. Files
Created: src/{auth,components,hooks,pages,pages/admin}/*, src/lib/{api,format,types}.ts, src/routes.ts, src/app.css, supabase/{migrations/20261104020000_*.sql, functions/provider-callback/index.ts, inspect_schema.sql, create_first_admin.sql, tests/*}, docs/*, .env.example, vercel.json.
Modified: App.tsx (rewritten shell), main.tsx, index.css (demo CSS removed), index.html (title), lib/supabase.ts (line endings), .gitignore, README.md, package-lock.json.
Removed (dead template/demo): src/App.css, src/assets/*, public/icons.svg, stray empty file `ynpx`.

## 3. Migration summary (additive; no DROP TABLE/COLUMN, no row deletion)
ADD COLUMN IF NOT EXISTS on existing tables; new tables notifications, app_settings, admin_users, admin_audit_log; secure functions; trigger on auth.users; backfill of missing profiles/wallets/referral codes.
Seeded product defaults (YOUR DECISION): min withdrawal 1000 tokens, referral reward 100 tokens, payout methods paypal/bank_transfer/usdt_trc20.

## 4. Security / RLS
Replaces ALL existing policies on the TOKENHUB tables. Revokes table privileges from anon/authenticated, grants SELECT only (+ UPDATE on profiles.username/full_name, admin-gated writes on tasks/app_settings).
Wallet, transactions, referrals, completions, provider events, withdrawals: no client writes. credit_wallet/process_provider_event: service_role only. tokenhub_test: RLS on, access revoked (not dropped).

## 5. Build / lint
npm run lint: 0 warnings, 0 errors. npm run build: success.

## 6. Tests actually run
- PostgreSQL 16 local with Supabase stub: 95/95 pass on a simulated legacy schema; fresh DB 92/95 (3 failures are legacy-fixture-only tests); migration re-applied twice with no error.
- Concurrency: 2 parallel withdrawals of 800 on 1000 balance → exactly 1 succeeded; 3 parallel identical provider events → 1 processed, 2 duplicate, 1 credit.
- Deno: Edge Function signature gate 9/9.
NOT tested: real Supabase (network blocked), live auth/email flows, browser rendering/responsive layouts, real provider.

## 7. Needs credentials / inputs
Provider account + postback spec + PROVIDER_SECRET_<NAME>; SMTP/redirect URLs for emails; first admin email.

## 8. Limitations
Legacy column types/names unknown (schema not inspectable from here): run inspect_schema.sql first. No chargeback handling, no IP/device fraud signals, email-alias farming not prevented, payouts are manual.

## 9. Production deployment (ONLY after approval)
1. Backup (Supabase dashboard) and run supabase/inspect_schema.sql; review output.
2. supabase link --project-ref ztsdsofpudtbuorhzvix && supabase db push   (or paste the migration in SQL editor)
3. Run supabase/create_first_admin.sql with your email.
4. supabase secrets set PROVIDER_SECRET_<NAME>=... ; supabase functions deploy provider-callback --no-verify-jwt
5. Supabase Auth > URL config: Site URL + Redirect URLs = Vercel domain (and localhost).
6. git add -A && git commit -m "TOKENHUB backend + app" && git push origin main
7. Vercel env: VITE_SUPABASE_URL, VITE_SUPABASE_PUBLISHABLE_KEY → vercel --prod (or auto-deploy from GitHub).

## 10. Risks
Policy replacement and privilege revocation could break any other client using these tables; an existing auth.users trigger may conflict with on_auth_user_created; .env.local in your ZIP holds your keys (ignored by git, not committed historically).
