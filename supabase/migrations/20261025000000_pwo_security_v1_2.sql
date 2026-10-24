-- =====================================================================
--  Public Witnessing Organizer — SECURITY UPDATE v1.2
--  Run ONCE in the Supabase SQL Editor, AFTER pwo_update_v1_1.sql.
--  Safe to run again. Keeps all existing data.
--
--  IMPORTANT: update the app at the same time (patch v1.2). Step 3 below
--  changes how profiles are read, and the old app version will show
--  "We couldn't load your account" until the new version is published.
--
--  What changes:
--   1. Pre-registration needs a 6-digit join code. The code goes in the
--      WhatsApp message. Signing up with a pre-registered number but no
--      code (or a wrong one) no longer approves anyone: the account waits
--      for approval and staff are warned to check the person.
--      Pre-registrations expire after 14 days.
--   2. Account lookup at sign-in is rate limited: 30 lookups per
--      15 minutes per device network, 10 per number or email.
--   3. Members can no longer read other members' email address or consent
--      date. Names, phone numbers and roles stay visible as before.
--      The app reads its own profile with my_profile(), and staff read the
--      full list with staff_profiles().
--   4. Functions created in future are NOT callable by app users until
--      they are granted on purpose (Supabase grants them by default).
--   5. Profile edits are checked: valid Tanzanian mobile number, name
--      length, email format.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Pre-registration join codes and expiry
-- ---------------------------------------------------------------------
create or replace function public.new_join_code() returns text
language sql volatile set search_path = public as $$
  -- 6 random digits from the built-in random UUID generator
  select lpad(((('x' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 8))::bit(32)::bigint)
               % 1000000)::text, 6, '0')
$$;

alter table public.preapprovals add column if not exists join_code  text;
alter table public.preapprovals add column if not exists expires_at timestamptz;
update public.preapprovals set join_code = public.new_join_code()
 where join_code is null and used_at is null;
update public.preapprovals set expires_at = created_at + interval '14 days'
 where expires_at is null;

-- pre-register (or re-send): returns the phone as before; the code is in
-- the preapprovals row (staff can read it) and is renewed on every call
create or replace function public.preregister_publisher(p_full_name text, p_phone text,
                                                        p_service_type text default 'publisher')
returns text language plpgsql security definer set search_path = public as $$
declare v_phone text := normalize_phone(p_phone); v_existing text;
begin
  if not is_staff() then raise exception 'Only the Service Overseer can do this'; end if;
  if v_phone is null or v_phone !~ '^\+255[67][0-9]{8}$' then
    raise exception 'Please enter a valid mobile number';
  end if;
  if length(trim(coalesce(p_full_name, ''))) < 2 then raise exception 'Please enter the full name'; end if;
  if p_service_type not in ('publisher','auxiliary_pioneer','regular_pioneer','fulltime_pioneer') then
    raise exception 'Unknown service type';
  end if;
  select full_name into v_existing from profiles where phone = v_phone;
  if v_existing is not null then
    raise exception '% already has an account with this number', v_existing;
  end if;
  insert into preapprovals (congregation_id, full_name, phone, service_type, created_by, join_code, expires_at)
  values (my_congregation(), trim(p_full_name), v_phone, p_service_type, auth.uid(),
          new_join_code(), now() + interval '14 days')
  on conflict (congregation_id, phone) do update
    set full_name = excluded.full_name, service_type = excluded.service_type,
        created_by = excluded.created_by, created_at = now(), used_by = null, used_at = null,
        join_code = excluded.join_code, expires_at = excluded.expires_at;
  return v_phone;
end $$;

-- sign-up: automatic approval only with the right join code
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare m jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb); v_cong uuid; v_pre preapprovals;
        v_phone text := normalize_phone(m->>'phone');
        v_code  text := regexp_replace(coalesce(m->>'join_code', ''), '\D', '', 'g');
        v_name  text := coalesce(nullif(trim(m->>'full_name'), ''), 'New publisher');
begin
  v_cong := nullif(m->>'congregation_id', '')::uuid;
  if v_cong is null then
    select id into v_cong from congregations order by created_at limit 1;
  end if;
  insert into profiles (id, congregation_id, full_name, phone, email, consent_at)
  values (new.id, v_cong, v_name, v_phone, nullif(lower(trim(m->>'email')), ''),
          case when (m->>'consent')::boolean then now() end);

  select * into v_pre from preapprovals
   where congregation_id = v_cong and phone = v_phone and used_at is null
     and (expires_at is null or expires_at > now());

  if v_pre.id is not null and v_code <> '' and v_code = v_pre.join_code then
    update profiles set status = 'approved', service_type = v_pre.service_type where id = new.id;
    update preapprovals set used_by = new.id, used_at = now() where id = v_pre.id;
    perform notify(new.id, 'approved', 'Welcome — your account is ready',
                   'You can now book public witnessing sessions.', '/home');
    perform notify_overseers(v_cong, 'registration', 'Pre-registered publisher joined',
                             v_name || ' signed up with the join code and was approved automatically', '/admin');
  elsif v_pre.id is not null then
    perform notify_overseers(v_cong, 'registration', 'Check this registration',
                             v_name || ' used the pre-registered number of ' || v_pre.full_name ||
                             ' but without the right join code. Phone them before approving.', '/admin');
  else
    perform notify_overseers(v_cong, 'registration', 'New registration waiting',
                             v_name || ' asked to join', '/admin');
  end if;
  return new;
end $$;

-- approving a pending person by hand also uses their pre-registration
-- (service type) when one exists for the same number
create or replace function public.set_member_status(p_user uuid, p_status text)
returns void language plpgsql security definer set search_path = public as $$
declare v_target profiles; r record;
begin
  select * into v_target from profiles where id = p_user;
  if not is_staff() or v_target.congregation_id is distinct from my_congregation() then
    raise exception 'Only the Service Overseer can do this';
  end if;
  if p_status not in ('approved','declined','deactivated') then raise exception 'Unknown status'; end if;
  if not is_overseer() and (v_target.status <> 'pending' or p_status = 'deactivated') then
    raise exception 'Only a Super Admin can change an existing publisher';
  end if;
  if p_user = auth.uid() and p_status <> 'approved' then
    raise exception 'You cannot remove your own access';
  end if;
  update profiles set status = p_status where id = p_user;
  if p_status = 'deactivated' then
    for r in select id from bookings where publisher_id = p_user and status = 'active'
             and slot_start(slot_date, time_slot_id) > now() loop
      perform cancel_booking(r.id);
    end loop;
    update invitations set status = 'cancelled'
     where status = 'pending' and (from_id = p_user or to_id = p_user);
  end if;
  if p_status = 'approved' and v_target.status = 'pending' then
    update profiles p set service_type = pa.service_type
      from preapprovals pa
     where p.id = p_user and pa.congregation_id = v_target.congregation_id
       and pa.phone = v_target.phone and pa.used_at is null;
    update preapprovals set used_by = p_user, used_at = now()
     where congregation_id = v_target.congregation_id and phone = v_target.phone and used_at is null;
    perform notify(p_user, 'approved', 'Your account is approved',
                   'You can now book public witnessing sessions.', '/home');
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 2. Rate-limited account lookup (sign-in and sign-up)
-- ---------------------------------------------------------------------
create table if not exists public.login_lookups (
  id          bigint generated always as identity primary key,
  ip          text,
  identifier  text,
  created_at  timestamptz not null default now()
);
create index if not exists login_lookups_ip_idx  on public.login_lookups (ip, created_at);
create index if not exists login_lookups_id_idx  on public.login_lookups (identifier, created_at);
alter table public.login_lookups enable row level security;   -- no policies: nobody reads it directly
revoke all on public.login_lookups from public;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on public.login_lookups from anon, authenticated';
  end if;
end $$;

drop function if exists public.login_email_for(text);
create function public.login_email_for(p_identifier text) returns text
language plpgsql volatile security definer set search_path = public as $$
declare v_ip text; v_key text; v_email text;
begin
  begin
    v_ip := nullif(trim(split_part(
              nullif(current_setting('request.headers', true), '')::json->>'x-forwarded-for', ',', 1)), '');
  exception when others then v_ip := null;
  end;
  v_key := case when position('@' in coalesce(p_identifier, '')) > 0
                then lower(trim(p_identifier)) else normalize_phone(p_identifier) end;
  if v_key is null then return null; end if;

  delete from login_lookups where created_at < now() - interval '1 day';
  if v_ip is not null and (select count(*) from login_lookups
                           where ip = v_ip and created_at > now() - interval '15 minutes') >= 30 then
    raise exception 'Too many attempts. Please wait 15 minutes and try again.';
  end if;
  if (select count(*) from login_lookups
      where identifier = v_key and created_at > now() - interval '15 minutes') >= 10 then
    raise exception 'Too many attempts for this account. Please wait 15 minutes and try again.';
  end if;
  insert into login_lookups (ip, identifier) values (v_ip, v_key);

  select u.email into v_email from auth.users u join profiles p on p.id = u.id
   where (position('@' in v_key) > 0 and lower(p.email) = v_key)
      or (position('@' in v_key) = 0 and p.phone = v_key)
   limit 1;
  return v_email;
end $$;

-- ---------------------------------------------------------------------
-- 3. Profile privacy: other members see name, phone, role, service type
--    and status — never email or consent date
-- ---------------------------------------------------------------------
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'revoke select on public.profiles from anon, authenticated';
    execute 'grant select (id, congregation_id, full_name, phone, role, status, service_type, created_at)
             on public.profiles to authenticated';
  end if;
end $$;

-- my own full profile (used by the app after sign-in)
create or replace function public.my_profile() returns setof public.profiles
language sql stable security definer set search_path = public as $$
  select * from profiles where id = auth.uid()
$$;

-- full profiles for Super Admin and MT Assistants (Publishers and Registrations screens)
create or replace function public.staff_profiles(p_status text default null)
returns setof public.profiles
language sql stable security definer set search_path = public as $$
  select * from profiles
  where is_staff() and congregation_id = my_congregation()
    and (p_status is null or status = p_status)
  order by case when p_status = 'pending' then created_at end, full_name
$$;

-- ---------------------------------------------------------------------
-- 5. Profile edits are validated
-- ---------------------------------------------------------------------
create or replace function public.update_my_profile(p_full_name text, p_phone text, p_email text)
returns void language plpgsql security definer set search_path = public as $$
declare v_phone text := normalize_phone(p_phone); v_email text := nullif(lower(trim(p_email)), '');
begin
  if length(trim(coalesce(p_full_name, ''))) not between 2 and 80 then
    raise exception 'Please enter your full name';
  end if;
  if v_phone is null or v_phone !~ '^\+255[67][0-9]{8}$' then
    raise exception 'Please enter a valid Tanzanian mobile number';
  end if;
  if v_email is not null and v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'That email address doesn''t look right';
  end if;
  if exists (select 1 from profiles where phone = v_phone and id <> auth.uid()) then
    raise exception 'This mobile number is already used by another account';
  end if;
  if v_email is not null and exists (select 1 from profiles where lower(email) = v_email and id <> auth.uid()) then
    raise exception 'This email is already used by another account';
  end if;
  update profiles set full_name = trim(p_full_name), phone = v_phone, email = v_email
  where id = auth.uid();
end $$;

-- ---------------------------------------------------------------------
-- 4. Who may call which function (full list, replaces v1.1's)
-- ---------------------------------------------------------------------
-- future functions: not callable by app users until granted on purpose
do $$ begin
  -- the PUBLIC grant is a global default, so it must be revoked globally
  execute 'alter default privileges revoke execute on functions from public';
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'alter default privileges in schema public revoke execute on functions from anon, authenticated';
  end if;
exception when insufficient_privilege then
  raise notice 'Could not change default privileges (not critical): %', sqlerrm;
end $$;

revoke execute on all functions in schema public from public;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke execute on all functions in schema public from anon';
    execute 'grant execute on function public.login_email_for(text) to anon';
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'revoke execute on all functions in schema public from authenticated';
    execute 'grant execute on function
      public.my_congregation(), public.is_approved(), public.is_overseer(), public.is_staff(),
      public.login_email_for(text), public.my_profile(), public.staff_profiles(text),
      public.book_slot(uuid,date,uuid), public.cancel_booking(uuid),
      public.move_booking(uuid,uuid,uuid), public.same_day_alternatives(date),
      public.available_companions(date,uuid),
      public.send_invitation(uuid,uuid,date,uuid,text),
      public.respond_invitation(uuid,boolean,text), public.ask_all_free(uuid),
      public.mark_notifications_read(uuid[]), public.update_my_profile(text,text,text),
      public.week_board(date,date), public.publisher_month_bookings(uuid,date),
      public.set_member_status(uuid,text), public.set_member_role(uuid,text),
      public.set_service_type(uuid,text), public.close_location_day(uuid,date,text),
      public.preregister_publisher(text,text,text), public.delete_location(uuid),
      public.add_time_slot(time,time), public.delete_time_slot(uuid)
      to authenticated';
  end if;
end $$;

-- =====================================================================
--  End of security update v1.2
-- =====================================================================
