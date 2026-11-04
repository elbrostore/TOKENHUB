-- Run MANUALLY, once, in the Supabase SQL editor after the migration is applied.
-- Replace the email with the account that must become the first administrator.
-- (Admins cannot be created from the app: this is intentional.)
insert into public.admin_users (user_id)
select id from auth.users where email = 'REPLACE_WITH_ADMIN_EMAIL'
on conflict do nothing;
