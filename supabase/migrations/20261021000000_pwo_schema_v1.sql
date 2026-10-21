-- =====================================================================
--  Public Witnessing Organizer — database, security and booking rules
--  Version 1 (pilot: one congregation, free in-app notifications only)
--  Target: Supabase (PostgreSQL 15+). Run once in the SQL Editor.
--
--  Rules enforced here (not just in the app):
--   * Only approved publishers can book. Approval happens once.
--   * Mon–Sat, six 2-hour slots 6:30 AM – 6:30 PM (Africa/Dar_es_Salaam).
--   * Max 3 publishers per location/slot. One place per person per slot.
--   * No double booking, even when two people tap at the same moment.
--   * Invitations: sender must be booked; at least 2 days before the day;
--     invitee must be free; accept = booked automatically.
--   * Companion cancels and one person is left: booking stays active,
--     that person and every Service Overseer get a notification, and
--     same-day alternatives are offered. Still alone 1 hour before start
--     → released automatically (scheduled job, section 9).
--   * Multi-congregation ready: every row carries congregation_id.
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------
-- 1. Tables
-- ---------------------------------------------------------------------
create table if not exists public.congregations (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  timezone    text not null default 'Africa/Dar_es_Salaam',
  created_at  timestamptz not null default now()
);

create table if not exists public.profiles (
  id               uuid primary key references auth.users(id) on delete cascade,
  congregation_id  uuid not null references public.congregations(id),
  full_name        text not null check (length(trim(full_name)) between 2 and 80),
  phone            text not null,
  email            text,
  role             text not null default 'publisher' check (role in ('publisher','overseer')),
  status           text not null default 'pending'
                   check (status in ('pending','approved','declined','deactivated')),
  consent_at       timestamptz,
  created_at       timestamptz not null default now()
);
create unique index if not exists profiles_phone_key on public.profiles (phone);
create unique index if not exists profiles_email_key on public.profiles (lower(email)) where email is not null;

create table if not exists public.locations (
  id               uuid primary key default gen_random_uuid(),
  congregation_id  uuid not null references public.congregations(id),
  name             text not null,
  description      text,
  cart_storage     text,
  latitude         double precision,
  longitude        double precision,
  active           boolean not null default true,
  sort_order       int not null default 0,
  created_at       timestamptz not null default now()
);

create table if not exists public.time_slots (
  id               uuid primary key default gen_random_uuid(),
  congregation_id  uuid not null references public.congregations(id),
  start_time       time not null,
  end_time         time not null,
  active           boolean not null default true,
  check (end_time > start_time)
);

create table if not exists public.closures (
  id           uuid primary key default gen_random_uuid(),
  location_id  uuid not null references public.locations(id) on delete cascade,
  closed_on    date not null,
  reason       text,
  created_by   uuid references public.profiles(id),
  created_at   timestamptz not null default now(),
  unique (location_id, closed_on)
);

create table if not exists public.bookings (
  id                 uuid primary key default gen_random_uuid(),
  congregation_id    uuid not null references public.congregations(id),
  location_id        uuid not null references public.locations(id),
  time_slot_id       uuid not null references public.time_slots(id),
  slot_date          date not null,
  publisher_id       uuid not null references public.profiles(id) on delete cascade,
  status             text not null default 'active' check (status in ('active','cancelled','released')),
  help_requested_at  timestamptz,
  created_at         timestamptz not null default now(),
  ended_at           timestamptz
);
-- one place per person per date+slot (any location)
create unique index if not exists bookings_one_place_per_time
  on public.bookings (publisher_id, slot_date, time_slot_id) where status = 'active';
create index if not exists bookings_slot_idx
  on public.bookings (location_id, slot_date, time_slot_id) where status = 'active';

create table if not exists public.invitations (
  id                uuid primary key default gen_random_uuid(),
  congregation_id   uuid not null references public.congregations(id),
  from_id           uuid not null references public.profiles(id) on delete cascade,
  to_id             uuid not null references public.profiles(id) on delete cascade,
  location_id       uuid not null references public.locations(id),
  time_slot_id      uuid not null references public.time_slots(id),
  slot_date         date not null,
  message           text check (length(message) <= 500),
  status            text not null default 'pending'
                    check (status in ('pending','accepted','declined','expired','cancelled')),
  response_comment  text check (length(response_comment) <= 300),
  created_at        timestamptz not null default now(),
  responded_at      timestamptz
);
create index if not exists invitations_to_idx on public.invitations (to_id, status);

create table if not exists public.notifications (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles(id) on delete cascade,
  kind        text not null,
  title       text not null,
  body        text,
  link        text,
  read_at     timestamptz,
  created_at  timestamptz not null default now()
);
create index if not exists notifications_user_idx on public.notifications (user_id, created_at desc);

create table if not exists public.announcements (
  id               uuid primary key default gen_random_uuid(),
  congregation_id  uuid not null references public.congregations(id),
  title            text not null,
  body             text,
  pinned           boolean not null default false,
  created_by       uuid references public.profiles(id),
  created_at       timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- 2. Helpers (security definer so RLS policies can use them safely)
-- ---------------------------------------------------------------------
create or replace function public.my_congregation() returns uuid
language sql stable security definer set search_path = public as $$
  select congregation_id from profiles where id = auth.uid()
$$;

create or replace function public.is_approved() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and status = 'approved')
$$;

create or replace function public.is_overseer() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles
                 where id = auth.uid() and status = 'approved' and role = 'overseer')
$$;

-- +255 7XX XXX XXX in any common form → +2557XXXXXXXX
create or replace function public.normalize_phone(p text) returns text
language plpgsql immutable as $$
declare d text := regexp_replace(coalesce(p, ''), '\D', '', 'g');
begin
  if d = '' then return null; end if;
  if length(d) = 10 and left(d, 1) = '0' then d := '255' || substr(d, 2); end if;
  if length(d) = 9 then d := '255' || d; end if;
  return '+' || d;
end $$;

create or replace function public.local_today(p_cong uuid) returns date
language sql stable set search_path = public as $$
  select (now() at time zone c.timezone)::date from congregations c where c.id = p_cong
$$;

create or replace function public.slot_start(p_date date, p_slot uuid) returns timestamptz
language sql stable set search_path = public as $$
  select (p_date + ts.start_time) at time zone c.timezone
  from time_slots ts join congregations c on c.id = ts.congregation_id
  where ts.id = p_slot
$$;

create or replace function public.slot_count(p_location uuid, p_date date, p_slot uuid) returns int
language sql stable set search_path = public as $$
  select count(*)::int from bookings
  where location_id = p_location and slot_date = p_date and time_slot_id = p_slot and status = 'active'
$$;

create or replace function public.slot_label(p_location uuid, p_date date, p_slot uuid) returns text
language sql stable set search_path = public as $$
  select to_char(p_date, 'Dy DD/MM/YY') || ' · ' ||
         to_char(ts.start_time, 'FMHH12:MI AM') || '–' || to_char(ts.end_time, 'FMHH12:MI AM') ||
         ' · ' || l.name
  from time_slots ts, locations l where ts.id = p_slot and l.id = p_location
$$;

create or replace function public.notify(p_user uuid, p_kind text, p_title text,
                                         p_body text default null, p_link text default null)
returns void language sql security definer set search_path = public as $$
  insert into notifications (user_id, kind, title, body, link)
  values (p_user, p_kind, p_title, p_body, p_link)
$$;

create or replace function public.notify_overseers(p_cong uuid, p_kind text, p_title text,
                                                   p_body text default null, p_link text default null)
returns void language sql security definer set search_path = public as $$
  insert into notifications (user_id, kind, title, body, link)
  select id, p_kind, p_title, p_body, p_link from profiles
  where congregation_id = p_cong and role = 'overseer' and status = 'approved'
$$;

create or replace function public.lock_slot(p_location uuid, p_date date, p_slot uuid) returns void
language sql as $$
  select pg_advisory_xact_lock(hashtext(p_location::text || p_date::text || p_slot::text))
$$;

-- All booking rules in one place. Raises a readable error if not allowed.
create or replace function public.assert_bookable(p_user uuid, p_location uuid, p_date date, p_slot uuid)
returns void language plpgsql stable security definer set search_path = public as $$
declare
  v_prof profiles; v_loc locations; v_ts time_slots; v_today date;
begin
  select * into v_prof from profiles where id = p_user;
  if v_prof.id is null or v_prof.status <> 'approved' then
    raise exception 'Only approved publishers can book sessions';
  end if;
  select * into v_loc from locations where id = p_location;
  if v_loc.id is null or not v_loc.active or v_loc.congregation_id <> v_prof.congregation_id then
    raise exception 'This location is not available';
  end if;
  select * into v_ts from time_slots where id = p_slot;
  if v_ts.id is null or not v_ts.active or v_ts.congregation_id <> v_prof.congregation_id then
    raise exception 'This time slot is not available';
  end if;
  if extract(isodow from p_date) = 7 then
    raise exception 'Sessions run Monday to Saturday only';
  end if;
  v_today := local_today(v_prof.congregation_id);
  if p_date > v_today + 28 then
    raise exception 'You can book up to 4 weeks ahead';
  end if;
  if slot_start(p_date, p_slot) <= now() then
    raise exception 'This session has already started';
  end if;
  if exists (select 1 from closures where location_id = p_location and closed_on = p_date) then
    raise exception 'This location is closed on that day';
  end if;
  if exists (select 1 from bookings where publisher_id = p_user and slot_date = p_date
             and time_slot_id = p_slot and status = 'active') then
    raise exception 'You are already booked at this time';
  end if;
  if slot_count(p_location, p_date, p_slot) >= 3 then
    raise exception 'This slot is full (3 of 3). Please choose another time or location';
  end if;
end $$;

-- inserts the booking and tells the others in the slot; caller holds the lock
create or replace function public.insert_booking(p_user uuid, p_location uuid, p_date date, p_slot uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_cong uuid; v_name text; r record;
begin
  perform assert_bookable(p_user, p_location, p_date, p_slot);
  select congregation_id, full_name into v_cong, v_name from profiles where id = p_user;
  insert into bookings (congregation_id, location_id, time_slot_id, slot_date, publisher_id)
  values (v_cong, p_location, p_slot, p_date, p_user) returning id into v_id;
  for r in select publisher_id from bookings
           where location_id = p_location and slot_date = p_date and time_slot_id = p_slot
             and status = 'active' and publisher_id <> p_user loop
    perform notify(r.publisher_id, 'companion_joined', v_name || ' joined your session',
                   slot_label(p_location, p_date, p_slot), '/profile');
  end loop;
  return v_id;
end $$;

-- ---------------------------------------------------------------------
-- 3. Sign-up: create the profile automatically
--    The app passes full_name, phone, email (optional), consent (true),
--    congregation_id (optional; defaults to the only congregation).
-- ---------------------------------------------------------------------
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare m jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb); v_cong uuid;
begin
  v_cong := nullif(m->>'congregation_id', '')::uuid;
  if v_cong is null then
    select id into v_cong from congregations order by created_at limit 1;
  end if;
  insert into profiles (id, congregation_id, full_name, phone, email, consent_at)
  values (new.id, v_cong, coalesce(nullif(trim(m->>'full_name'), ''), 'New publisher'),
          normalize_phone(m->>'phone'), nullif(lower(trim(m->>'email')), ''),
          case when (m->>'consent')::boolean then now() end);
  perform notify_overseers(v_cong, 'registration', 'New registration waiting',
                           coalesce(m->>'full_name', 'A publisher') || ' asked to join', '/admin');
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- Login with phone OR email: returns the e-mail address used to sign in.
create or replace function public.login_email_for(p_identifier text) returns text
language sql stable security definer set search_path = public as $$
  select u.email from auth.users u join profiles p on p.id = u.id
  where (position('@' in p_identifier) > 0 and lower(p.email) = lower(trim(p_identifier)))
     or (position('@' in p_identifier) = 0 and p.phone = normalize_phone(p_identifier))
  limit 1
$$;

-- ---------------------------------------------------------------------
-- 4. Publisher actions (call these from the app with supabase.rpc)
-- ---------------------------------------------------------------------
create or replace function public.book_slot(p_location uuid, p_date date, p_slot uuid)
returns uuid language plpgsql security definer set search_path = public as $$
begin
  perform lock_slot(p_location, p_date, p_slot);
  return insert_booking(auth.uid(), p_location, p_date, p_slot);
end $$;

-- returns how many publishers remain in the slot
create or replace function public.cancel_booking(p_booking uuid)
returns int language plpgsql security definer set search_path = public as $$
declare b bookings; v_left int; v_alone uuid; v_name text;
begin
  select * into b from bookings where id = p_booking;
  if b.id is null or b.status <> 'active' then raise exception 'Booking not found'; end if;
  if b.publisher_id <> auth.uid()
     and not (is_overseer() and b.congregation_id = my_congregation()) then
    raise exception 'You can only cancel your own booking';
  end if;
  perform lock_slot(b.location_id, b.slot_date, b.time_slot_id);
  update bookings set status = 'cancelled', ended_at = now() where id = b.id;
  update invitations set status = 'cancelled'
   where from_id = b.publisher_id and status = 'pending' and location_id = b.location_id
     and slot_date = b.slot_date and time_slot_id = b.time_slot_id;
  v_left := slot_count(b.location_id, b.slot_date, b.time_slot_id);
  if v_left = 1 and slot_start(b.slot_date, b.time_slot_id) > now() then
    select publisher_id into v_alone from bookings
     where location_id = b.location_id and slot_date = b.slot_date
       and time_slot_id = b.time_slot_id and status = 'active';
    select full_name into v_name from profiles where id = b.publisher_id;
    perform notify(v_alone, 'left_alone', v_name || ' cancelled — you are alone',
      slot_label(b.location_id, b.slot_date, b.time_slot_id) ||
      '. Join a pair the same day or find a companion. If no one joins, the booking is released 1 hour before start.',
      '/alone/' || (select id from bookings where publisher_id = v_alone and location_id = b.location_id
                    and slot_date = b.slot_date and time_slot_id = b.time_slot_id and status = 'active'));
    perform notify_overseers(b.congregation_id, 'companion_needed', 'A publisher is left alone',
      (select full_name from profiles where id = v_alone) || ' · ' ||
      slot_label(b.location_id, b.slot_date, b.time_slot_id), '/admin');
  end if;
  return v_left;
end $$;

-- move my booking to another slot on the same day (atomic: all or nothing)
create or replace function public.move_booking(p_booking uuid, p_location uuid, p_slot uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare b bookings;
begin
  select * into b from bookings where id = p_booking and publisher_id = auth.uid() and status = 'active';
  if b.id is null then raise exception 'Booking not found'; end if;
  perform cancel_booking(p_booking);
  perform lock_slot(p_location, b.slot_date, p_slot);
  return insert_booking(auth.uid(), p_location, b.slot_date, p_slot);
end $$;

-- same-day sessions with room: pairs (2/3) first, then lone publishers (1/3)
create or replace function public.same_day_alternatives(p_date date)
returns table (location_id uuid, location_name text, time_slot_id uuid,
               start_time time, end_time time, booked int, publishers text[])
language sql stable security definer set search_path = public as $$
  select l.id, l.name, ts.id, ts.start_time, ts.end_time, count(b.id)::int,
         array_agg(p.full_name order by b.created_at)
  from bookings b
  join locations l on l.id = b.location_id
  join time_slots ts on ts.id = b.time_slot_id
  join profiles p on p.id = b.publisher_id
  where is_approved() and b.status = 'active' and b.slot_date = p_date
    and b.congregation_id = my_congregation()
    and slot_start(p_date, ts.id) > now()
    and not exists (select 1 from closures c where c.location_id = l.id and c.closed_on = p_date)
    and not exists (select 1 from bookings mine where mine.publisher_id = auth.uid()
                    and mine.status = 'active' and mine.slot_date = p_date
                    and mine.time_slot_id = ts.id and mine.location_id = l.id)
  group by l.id, l.name, ts.id, ts.start_time, ts.end_time
  having count(b.id) between 1 and 2
  order by count(b.id) desc, ts.start_time
$$;

-- approved publishers who are free at that date+slot (for invites)
create or replace function public.available_companions(p_date date, p_slot uuid)
returns table (id uuid, full_name text)
language sql stable security definer set search_path = public as $$
  select p.id, p.full_name from profiles p
  where is_approved() and p.congregation_id = my_congregation()
    and p.status = 'approved' and p.id <> auth.uid()
    and not exists (select 1 from bookings b where b.publisher_id = p.id and b.status = 'active'
                    and b.slot_date = p_date and b.time_slot_id = p_slot)
  order by p.full_name
$$;

create or replace function public.send_invitation(p_to uuid, p_location uuid, p_date date,
                                                  p_slot uuid, p_message text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_me profiles; v_to profiles; v_id uuid;
begin
  select * into v_me from profiles where id = auth.uid();
  select * into v_to from profiles where id = p_to;
  if not exists (select 1 from bookings where publisher_id = v_me.id and location_id = p_location
                 and slot_date = p_date and time_slot_id = p_slot and status = 'active') then
    raise exception 'Book the slot first, then invite a companion';
  end if;
  if p_date - local_today(v_me.congregation_id) < 2 then
    raise exception 'Invitations must be sent at least 2 days before the session';
  end if;
  if v_to.id is null or v_to.status <> 'approved' or v_to.congregation_id <> v_me.congregation_id
     or v_to.id = v_me.id then
    raise exception 'This publisher cannot be invited';
  end if;
  if exists (select 1 from bookings where publisher_id = p_to and slot_date = p_date
             and time_slot_id = p_slot and status = 'active') then
    raise exception '% is already booked at that time', v_to.full_name;
  end if;
  if slot_count(p_location, p_date, p_slot) >= 3 then raise exception 'This slot is already full'; end if;
  if exists (select 1 from invitations where from_id = v_me.id and to_id = p_to and status = 'pending'
             and location_id = p_location and slot_date = p_date and time_slot_id = p_slot) then
    raise exception 'You already invited % to this session', v_to.full_name;
  end if;
  insert into invitations (congregation_id, from_id, to_id, location_id, time_slot_id, slot_date, message)
  values (v_me.congregation_id, v_me.id, p_to, p_location, p_slot, p_date, nullif(trim(p_message), ''))
  returning id into v_id;
  perform notify(p_to, 'invitation', v_me.full_name || ' invited you',
                 slot_label(p_location, p_date, p_slot), '/invites');
  return v_id;
end $$;

create or replace function public.respond_invitation(p_invitation uuid, p_accept boolean,
                                                     p_comment text default null)
returns void language plpgsql security definer set search_path = public as $$
declare i invitations; v_name text;
begin
  select * into i from invitations where id = p_invitation;
  if i.id is null or i.to_id <> auth.uid() then raise exception 'Invitation not found'; end if;
  if i.status <> 'pending' then raise exception 'This invitation is no longer open'; end if;
  if p_accept then
    perform lock_slot(i.location_id, i.slot_date, i.time_slot_id);
    perform insert_booking(auth.uid(), i.location_id, i.slot_date, i.time_slot_id);
  end if;
  update invitations set status = case when p_accept then 'accepted' else 'declined' end,
         response_comment = nullif(trim(p_comment), ''), responded_at = now()
   where id = i.id;
  select full_name into v_name from profiles where id = auth.uid();
  perform notify(i.from_id, case when p_accept then 'invite_accepted' else 'invite_declined' end,
                 v_name || case when p_accept then ' accepted your invitation' else ' declined your invitation' end,
                 coalesce('"' || nullif(trim(p_comment), '') || '" · ', '') ||
                 slot_label(i.location_id, i.slot_date, i.time_slot_id), '/invites');
end $$;

-- "Ask all free": notify every free approved publisher (once per hour per booking)
create or replace function public.ask_all_free(p_booking uuid)
returns int language plpgsql security definer set search_path = public as $$
declare b bookings; v_n int := 0; v_name text; r record;
begin
  select * into b from bookings where id = p_booking and publisher_id = auth.uid() and status = 'active';
  if b.id is null then raise exception 'Booking not found'; end if;
  if b.help_requested_at > now() - interval '1 hour' then
    raise exception 'Help was already requested in the last hour';
  end if;
  select full_name into v_name from profiles where id = auth.uid();
  for r in select id from available_companions(b.slot_date, b.time_slot_id) loop
    perform notify(r.id, 'help_request', v_name || ' needs a companion',
                   slot_label(b.location_id, b.slot_date, b.time_slot_id), '/home');
    v_n := v_n + 1;
  end loop;
  update bookings set help_requested_at = now() where id = b.id;
  return v_n;
end $$;

create or replace function public.mark_notifications_read(p_ids uuid[] default null)
returns void language sql security definer set search_path = public as $$
  update notifications set read_at = now()
  where user_id = auth.uid() and read_at is null and (p_ids is null or id = any(p_ids))
$$;

create or replace function public.update_my_profile(p_full_name text, p_phone text, p_email text)
returns void language sql security definer set search_path = public as $$
  update profiles set full_name = trim(p_full_name), phone = normalize_phone(p_phone),
         email = nullif(lower(trim(p_email)), '')
  where id = auth.uid()
$$;

-- The whole week in one call: every location × slot × day (Mon–Sat)
create or replace function public.week_board(p_from date, p_to date)
returns table (slot_date date, location_id uuid, location_name text, time_slot_id uuid,
               start_time time, end_time time, booked int, publishers jsonb,
               is_mine boolean, my_booking_id uuid, closed boolean, is_past boolean)
language sql stable security definer set search_path = public as $$
  with d as (
    select g::date as slot_date from generate_series(p_from, least(p_to, p_from + 13), interval '1 day') g
    where extract(isodow from g) between 1 and 6
  )
  select d.slot_date, l.id, l.name, ts.id, ts.start_time, ts.end_time,
         count(b.id)::int,
         coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'full_name', p.full_name)
                            order by b.created_at) filter (where b.id is not null), '[]'::jsonb),
         bool_or(b.publisher_id = auth.uid()) is true,
         (array_agg(b.id) filter (where b.publisher_id = auth.uid()))[1],
         exists (select 1 from closures c where c.location_id = l.id and c.closed_on = d.slot_date),
         slot_start(d.slot_date, ts.id) <= now()
  from d
  cross join locations l
  join time_slots ts on ts.congregation_id = l.congregation_id and ts.active
  left join bookings b on b.location_id = l.id and b.slot_date = d.slot_date
                      and b.time_slot_id = ts.id and b.status = 'active'
  left join profiles p on p.id = b.publisher_id
  where is_approved() and l.active and l.congregation_id = my_congregation()
  group by d.slot_date, l.id, l.name, l.sort_order, ts.id, ts.start_time, ts.end_time
  order by d.slot_date, l.sort_order, l.name, ts.start_time
$$;

-- ---------------------------------------------------------------------
-- 5. Service Overseer actions
-- ---------------------------------------------------------------------
create or replace function public.set_member_status(p_user uuid, p_status text)
returns void language plpgsql security definer set search_path = public as $$
declare v_target profiles; r record;
begin
  select * into v_target from profiles where id = p_user;
  if not is_overseer() or v_target.congregation_id is distinct from my_congregation() then
    raise exception 'Only the Service Overseer can do this';
  end if;
  if p_status not in ('approved','declined','deactivated') then raise exception 'Unknown status'; end if;
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
    perform notify(p_user, 'approved', 'Your account is approved',
                   'You can now book public witnessing sessions.', '/home');
  end if;
end $$;

create or replace function public.set_member_role(p_user uuid, p_role text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not is_overseer() or (select congregation_id from profiles where id = p_user) is distinct from my_congregation() then
    raise exception 'Only the Service Overseer can do this';
  end if;
  if p_user = auth.uid() and p_role <> 'overseer' then
    raise exception 'Ask another Service Overseer to change your role';
  end if;
  update profiles set role = p_role where id = p_user;
end $$;

-- close a location for one day: cancels its bookings and tells everyone affected
create or replace function public.close_location_day(p_location uuid, p_date date, p_reason text)
returns int language plpgsql security definer set search_path = public as $$
declare r record; v_n int := 0; v_label text;
begin
  if not is_overseer() or (select congregation_id from locations where id = p_location) is distinct from my_congregation() then
    raise exception 'Only the Service Overseer can do this';
  end if;
  insert into closures (location_id, closed_on, reason, created_by)
  values (p_location, p_date, p_reason, auth.uid())
  on conflict (location_id, closed_on) do update set reason = excluded.reason;
  select name into v_label from locations where id = p_location;
  for r in select id, publisher_id from bookings where location_id = p_location
           and slot_date = p_date and status = 'active' loop
    update bookings set status = 'cancelled', ended_at = now() where id = r.id;
    perform notify(r.publisher_id, 'closure', v_label || ' is closed on ' || to_char(p_date, 'DD/MM/YY'),
                   coalesce(p_reason, 'Your booking was cancelled.'), '/notices');
    v_n := v_n + 1;
  end loop;
  update invitations set status = 'cancelled'
   where status = 'pending' and location_id = p_location and slot_date = p_date;
  return v_n;
end $$;

-- ---------------------------------------------------------------------
-- 6. Scheduled job: release lone bookings 1 hour before start,
--    expire invitations whose session has started
-- ---------------------------------------------------------------------
create or replace function public.release_unpaired() returns int
language plpgsql security definer set search_path = public as $$
declare r record; v_n int := 0;
begin
  for r in
    select b.id, b.publisher_id, b.congregation_id, b.location_id, b.slot_date, b.time_slot_id
    from bookings b
    where b.status = 'active'
      and slot_start(b.slot_date, b.time_slot_id) - interval '1 hour' <= now()
      and slot_count(b.location_id, b.slot_date, b.time_slot_id) = 1
  loop
    update bookings set status = 'released', ended_at = now() where id = r.id;
    perform notify(r.publisher_id, 'released', 'Your session was released',
      'No companion joined: ' || slot_label(r.location_id, r.slot_date, r.time_slot_id) ||
      '. Please do not witness alone.', '/home');
    perform notify_overseers(r.congregation_id, 'released', 'Lone booking released',
      (select full_name from profiles where id = r.publisher_id) || ' · ' ||
      slot_label(r.location_id, r.slot_date, r.time_slot_id), '/admin');
    v_n := v_n + 1;
  end loop;
  update invitations set status = 'expired'
   where status = 'pending' and slot_start(slot_date, time_slot_id) <= now();
  return v_n;
end $$;

-- ---------------------------------------------------------------------
-- 7. Row Level Security (direct table reads; all writes go through
--    the functions above, except overseer edits of reference data)
-- ---------------------------------------------------------------------
alter table public.congregations enable row level security;
alter table public.profiles      enable row level security;
alter table public.locations     enable row level security;
alter table public.time_slots    enable row level security;
alter table public.closures      enable row level security;
alter table public.bookings      enable row level security;
alter table public.invitations   enable row level security;
alter table public.notifications enable row level security;
alter table public.announcements enable row level security;

drop policy if exists congregations_read on public.congregations;
create policy congregations_read on public.congregations for select using (true);

drop policy if exists profiles_read on public.profiles;
create policy profiles_read on public.profiles for select using (
  id = auth.uid()
  or (congregation_id = my_congregation() and (is_overseer() or (is_approved() and status = 'approved')))
);

drop policy if exists locations_read on public.locations;
create policy locations_read on public.locations for select using (congregation_id = my_congregation());
drop policy if exists locations_write on public.locations;
create policy locations_write on public.locations for all
  using (is_overseer() and congregation_id = my_congregation())
  with check (is_overseer() and congregation_id = my_congregation());

drop policy if exists time_slots_read on public.time_slots;
create policy time_slots_read on public.time_slots for select using (congregation_id = my_congregation());
drop policy if exists time_slots_write on public.time_slots;
create policy time_slots_write on public.time_slots for all
  using (is_overseer() and congregation_id = my_congregation())
  with check (is_overseer() and congregation_id = my_congregation());

drop policy if exists closures_read on public.closures;
create policy closures_read on public.closures for select using (
  exists (select 1 from locations l where l.id = location_id and l.congregation_id = my_congregation()));
-- re-open a closed day (bookings cancelled by the closure stay cancelled)
drop policy if exists closures_delete on public.closures;
create policy closures_delete on public.closures for delete using (
  is_overseer() and exists (select 1 from locations l where l.id = location_id
                            and l.congregation_id = my_congregation()));

drop policy if exists bookings_read on public.bookings;
create policy bookings_read on public.bookings for select
  using (is_approved() and congregation_id = my_congregation());

drop policy if exists invitations_read on public.invitations;
create policy invitations_read on public.invitations for select using (
  from_id = auth.uid() or to_id = auth.uid()
  or (is_overseer() and congregation_id = my_congregation()));

drop policy if exists notifications_read on public.notifications;
create policy notifications_read on public.notifications for select using (user_id = auth.uid());

drop policy if exists announcements_read on public.announcements;
create policy announcements_read on public.announcements for select
  using (congregation_id = my_congregation());
drop policy if exists announcements_write on public.announcements;
create policy announcements_write on public.announcements for all
  using (is_overseer() and congregation_id = my_congregation())
  with check (is_overseer() and congregation_id = my_congregation());

-- ---------------------------------------------------------------------
-- 8. Who may call which function
-- ---------------------------------------------------------------------
revoke execute on all functions in schema public from public;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke execute on all functions in schema public from anon';
    execute 'grant execute on function public.login_email_for(text) to anon';
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'grant execute on function
      public.my_congregation(), public.is_approved(), public.is_overseer(),
      public.login_email_for(text),
      public.book_slot(uuid,date,uuid), public.cancel_booking(uuid),
      public.move_booking(uuid,uuid,uuid), public.same_day_alternatives(date),
      public.available_companions(date,uuid),
      public.send_invitation(uuid,uuid,date,uuid,text),
      public.respond_invitation(uuid,boolean,text), public.ask_all_free(uuid),
      public.mark_notifications_read(uuid[]), public.update_my_profile(text,text,text),
      public.week_board(date,date), public.set_member_status(uuid,text),
      public.set_member_role(uuid,text), public.close_location_day(uuid,date,text)
      to authenticated';
  end if;
end $$;

-- Live updates for the schedule and notifications (Supabase Realtime)
do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    begin execute 'alter publication supabase_realtime add table public.bookings';
    exception when duplicate_object then null; end;
    begin execute 'alter publication supabase_realtime add table public.notifications';
    exception when duplicate_object then null; end;
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 9. Starting data — edit names before running
-- ---------------------------------------------------------------------
do $$
declare v_cong uuid;
begin
  if not exists (select 1 from congregations) then
    insert into congregations (name) values ('[Your congregation name]') returning id into v_cong;
    insert into locations (congregation_id, name, sort_order) values
      (v_cong, 'Mjimwema', 1), (v_cong, 'Kibada', 2), (v_cong, 'Geza', 3);
    insert into time_slots (congregation_id, start_time, end_time) values
      (v_cong, '06:30', '08:30'), (v_cong, '08:30', '10:30'), (v_cong, '10:30', '12:30'),
      (v_cong, '12:30', '14:30'), (v_cong, '14:30', '16:30'), (v_cong, '16:30', '18:30');
  end if;
end $$;

-- =====================================================================
--  AFTER RUNNING THIS FILE (Supabase dashboard):
--  A) Database → Extensions → enable "pg_cron", then run:
--       select cron.schedule('release-unpaired', '*/10 * * * *',
--                            $$select public.release_unpaired()$$);
--  B) Register your own account in the app, then make yourself the
--     first Service Overseer:
--       update public.profiles set role = 'overseer', status = 'approved'
--       where phone = '+2557XXXXXXXX';
-- =====================================================================
