-- =====================================================================
--  Public Witnessing Organizer — UPDATE v1.1
--  Run ONCE in the Supabase SQL Editor, AFTER pwo_schema_v1.sql.
--  Safe to run again. Keeps all existing data.
--
--  What changes:
--   1. Access levels: Super Admin (Elders) = 'overseer',
--      MT Assistant = 'assistant', Publisher = 'publisher'.
--      Service type: publisher / auxiliary pioneer / regular pioneer /
--      full-time pioneer.
--   2. Booking deadline: a day's sessions can be booked until 04:30 AM that
--      morning. After 04:30 you can still JOIN someone who is alone (1/3),
--      so lone publishers can be rescued on the day.
--   3. Invitations: a publisher can invite the same companion only once
--      per week (Mon–Sat). Pioneers (all three types) have no limit.
--      Invitations expire at the 04:30 deadline of the session day.
--   4. "You are already booked at this time at <location>".
--   5. Schedule board: shows where you are booked at the same time,
--      who invited you, and whether a slot can still be booked.
--   6. A publisher's bookings for one month (tap a name).
--   7. Locations and time slots: add / delete (a location or slot with
--      booking history is hidden instead, so records stay correct).
--   8. Pre-registration: the Super Admin or MT Assistant adds a name +
--      phone; when that person signs up with that number they are
--      approved automatically.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Columns and tables
-- ---------------------------------------------------------------------
alter table public.congregations
  add column if not exists booking_cutoff time not null default '04:30';

alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check
  check (role in ('publisher','assistant','overseer'));

alter table public.profiles
  add column if not exists service_type text not null default 'publisher';
alter table public.profiles drop constraint if exists profiles_service_type_check;
alter table public.profiles add constraint profiles_service_type_check
  check (service_type in ('publisher','auxiliary_pioneer','regular_pioneer','fulltime_pioneer'));

alter table public.locations  add column if not exists archived boolean not null default false;
alter table public.time_slots add column if not exists archived boolean not null default false;

create table if not exists public.preapprovals (
  id               uuid primary key default gen_random_uuid(),
  congregation_id  uuid not null references public.congregations(id),
  full_name        text not null check (length(trim(full_name)) between 2 and 80),
  phone            text not null,
  service_type     text not null default 'publisher'
                   check (service_type in ('publisher','auxiliary_pioneer','regular_pioneer','fulltime_pioneer')),
  created_by       uuid references public.profiles(id) on delete set null,
  created_at       timestamptz not null default now(),
  used_by          uuid references public.profiles(id) on delete set null,
  used_at          timestamptz,
  unique (congregation_id, phone)
);

-- ---------------------------------------------------------------------
-- 2. Helpers
-- ---------------------------------------------------------------------
-- Super Admin or MT Assistant
create or replace function public.is_staff() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles
                 where id = auth.uid() and status = 'approved' and role in ('overseer','assistant'))
$$;

-- the moment booking for a day closes (04:30 local time that morning)
create or replace function public.booking_deadline(p_cong uuid, p_date date) returns timestamptz
language sql stable set search_path = public as $$
  select (p_date + c.booking_cutoff) at time zone c.timezone from congregations c where c.id = p_cong
$$;

create or replace function public.day_open(p_cong uuid, p_date date) returns boolean
language sql stable set search_path = public as $$
  select now() < booking_deadline(p_cong, p_date)
$$;

-- staff (Super Admin + MT Assistants) receive the alerts that used to go to overseers
create or replace function public.notify_overseers(p_cong uuid, p_kind text, p_title text,
                                                   p_body text default null, p_link text default null)
returns void language sql security definer set search_path = public as $$
  insert into notifications (user_id, kind, title, body, link)
  select id, p_kind, p_title, p_body, p_link from profiles
  where congregation_id = p_cong and role in ('overseer','assistant') and status = 'approved'
$$;

-- same rules as v1; the "already booked" message now names the location
create or replace function public.assert_bookable(p_user uuid, p_location uuid, p_date date, p_slot uuid)
returns void language plpgsql stable security definer set search_path = public as $$
declare
  v_prof profiles; v_loc locations; v_ts time_slots; v_today date; v_where text;
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
  select l.name into v_where from bookings b join locations l on l.id = b.location_id
   where b.publisher_id = p_user and b.slot_date = p_date and b.time_slot_id = p_slot
     and b.status = 'active' limit 1;
  if v_where is not null then
    raise exception 'You are already booked at this time at %', v_where;
  end if;
  if slot_count(p_location, p_date, p_slot) >= 3 then
    raise exception 'This slot is full (3 of 3). Please choose another time or location';
  end if;
end $$;

-- the 04:30 rule for new bookings. Joining someone who is alone stays allowed.
create or replace function public.assert_deadline(p_location uuid, p_date date, p_slot uuid)
returns void language plpgsql stable security definer set search_path = public as $$
declare v_cong uuid; v_cut time;
begin
  select l.congregation_id, c.booking_cutoff into v_cong, v_cut
    from locations l join congregations c on c.id = l.congregation_id where l.id = p_location;
  if not day_open(v_cong, p_date) and slot_count(p_location, p_date, p_slot) <> 1 then
    raise exception 'Booking for % closed at % that morning. You can still join a publisher who is alone.',
      to_char(p_date, 'Dy DD/MM/YY'), to_char(v_cut, 'FMHH12:MI AM');
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 3. Sign-up: pre-registered phone numbers are approved automatically
-- ---------------------------------------------------------------------
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare m jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb); v_cong uuid; v_pre preapprovals;
        v_phone text := normalize_phone(m->>'phone');
begin
  v_cong := nullif(m->>'congregation_id', '')::uuid;
  if v_cong is null then
    select id into v_cong from congregations order by created_at limit 1;
  end if;
  insert into profiles (id, congregation_id, full_name, phone, email, consent_at)
  values (new.id, v_cong, coalesce(nullif(trim(m->>'full_name'), ''), 'New publisher'),
          v_phone, nullif(lower(trim(m->>'email')), ''),
          case when (m->>'consent')::boolean then now() end);

  select * into v_pre from preapprovals
   where congregation_id = v_cong and phone = v_phone and used_at is null;
  if v_pre.id is not null then
    update profiles set status = 'approved', service_type = v_pre.service_type where id = new.id;
    update preapprovals set used_by = new.id, used_at = now() where id = v_pre.id;
    perform notify(new.id, 'approved', 'Welcome — your account is ready',
                   'You can now book public witnessing sessions.', '/home');
    perform notify_overseers(v_cong, 'registration', 'Pre-registered publisher joined',
                             coalesce(m->>'full_name', v_pre.full_name) || ' signed up and was approved automatically',
                             '/admin');
  else
    perform notify_overseers(v_cong, 'registration', 'New registration waiting',
                             coalesce(m->>'full_name', 'A publisher') || ' asked to join', '/admin');
  end if;
  return new;
end $$;

-- ---------------------------------------------------------------------
-- 4. Publisher actions
-- ---------------------------------------------------------------------
create or replace function public.book_slot(p_location uuid, p_date date, p_slot uuid)
returns uuid language plpgsql security definer set search_path = public as $$
begin
  perform lock_slot(p_location, p_date, p_slot);
  perform assert_deadline(p_location, p_date, p_slot);
  return insert_booking(auth.uid(), p_location, p_date, p_slot);
end $$;

create or replace function public.cancel_booking(p_booking uuid)
returns int language plpgsql security definer set search_path = public as $$
declare b bookings; v_left int; v_alone uuid; v_name text;
begin
  select * into b from bookings where id = p_booking;
  if b.id is null or b.status <> 'active' then raise exception 'Booking not found'; end if;
  if b.publisher_id <> auth.uid()
     and not (is_staff() and b.congregation_id = my_congregation()) then
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

-- free publishers, with a flag for "you already invited them this week"
drop function if exists public.available_companions(date, uuid);
create function public.available_companions(p_date date, p_slot uuid)
returns table (id uuid, full_name text, phone text, invited_this_week boolean)
language sql stable security definer set search_path = public as $$
  select p.id, p.full_name, p.phone,
         exists (select 1 from invitations i
                 where i.from_id = auth.uid() and i.to_id = p.id
                   and i.status in ('pending','accepted')
                   and date_trunc('week', i.slot_date) = date_trunc('week', p_date))
  from profiles p
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
  if v_me.service_type = 'publisher' and exists (
       select 1 from invitations where from_id = v_me.id and to_id = p_to
          and status in ('pending','accepted')
          and date_trunc('week', slot_date) = date_trunc('week', p_date)) then
    raise exception 'You already invited % this week. A companion can be invited once a week (pioneers have no limit).',
      v_to.full_name;
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
  if now() >= booking_deadline(i.congregation_id, i.slot_date) then
    raise exception 'This invitation expired at % on %',
      (select to_char(booking_cutoff, 'FMHH12:MI AM') from congregations where id = i.congregation_id),
      to_char(i.slot_date, 'DD/MM/YY');
  end if;
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

-- the whole week: v1 columns + booking_open, bookable, mine_elsewhere, invited_by
drop function if exists public.week_board(date, date);
create function public.week_board(p_from date, p_to date)
returns table (slot_date date, location_id uuid, location_name text, time_slot_id uuid,
               start_time time, end_time time, booked int, publishers jsonb,
               is_mine boolean, my_booking_id uuid, closed boolean, is_past boolean,
               booking_open boolean, bookable boolean, mine_elsewhere text, invited_by jsonb)
language sql stable security definer set search_path = public as $$
  with d as (
    select g::date as slot_date from generate_series(p_from, least(p_to, p_from + 13), interval '1 day') g
    where extract(isodow from g) between 1 and 6
  ),
  base as (
    select d.slot_date, l.id as location_id, l.name as location_name, l.sort_order,
           l.congregation_id, ts.id as time_slot_id, ts.start_time, ts.end_time,
           count(b.id)::int as booked,
           coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'full_name', p.full_name)
                              order by b.created_at) filter (where b.id is not null), '[]'::jsonb) as publishers,
           bool_or(b.publisher_id = auth.uid()) is true as is_mine,
           (array_agg(b.id) filter (where b.publisher_id = auth.uid()))[1] as my_booking_id,
           exists (select 1 from closures c where c.location_id = l.id and c.closed_on = d.slot_date) as closed,
           slot_start(d.slot_date, ts.id) <= now() as is_past
    from d
    cross join locations l
    join time_slots ts on ts.congregation_id = l.congregation_id and ts.active
    left join bookings b on b.location_id = l.id and b.slot_date = d.slot_date
                        and b.time_slot_id = ts.id and b.status = 'active'
    left join profiles p on p.id = b.publisher_id
    where is_approved() and l.active and l.congregation_id = my_congregation()
    group by d.slot_date, l.id, l.name, l.sort_order, l.congregation_id, ts.id, ts.start_time, ts.end_time
  ),
  ext as (
    select base.*,
           day_open(base.congregation_id, base.slot_date) as booking_open,
           (select l2.name from bookings mb join locations l2 on l2.id = mb.location_id
             where mb.publisher_id = auth.uid() and mb.status = 'active'
               and mb.slot_date = base.slot_date and mb.time_slot_id = base.time_slot_id
               and mb.location_id <> base.location_id limit 1) as mine_elsewhere,
           coalesce((select jsonb_agg(jsonb_build_object('invitation_id', i.id, 'id', fp.id,
                                                         'full_name', fp.full_name) order by i.created_at)
                     from invitations i join profiles fp on fp.id = i.from_id
                     where i.to_id = auth.uid() and i.status = 'pending'
                       and i.location_id = base.location_id and i.slot_date = base.slot_date
                       and i.time_slot_id = base.time_slot_id), '[]'::jsonb) as invited_by
    from base
  )
  select slot_date, location_id, location_name, time_slot_id, start_time, end_time, booked, publishers,
         is_mine, my_booking_id, closed, is_past, booking_open,
         (not closed and not is_past and not is_mine and mine_elsewhere is null and booked < 3
          and slot_date <= local_today(congregation_id) + 28
          and (booking_open or booked = 1)) as bookable,
         mine_elsewhere, invited_by
  from ext
  order by slot_date, sort_order, location_name, start_time
$$;

-- one publisher's bookings in a month (tap a name on the board)
create or replace function public.publisher_month_bookings(p_user uuid, p_month date)
returns table (booking_id uuid, slot_date date, start_time time, end_time time,
               location_name text, booked int, is_past boolean)
language sql stable security definer set search_path = public as $$
  select b.id, b.slot_date, ts.start_time, ts.end_time, l.name,
         slot_count(b.location_id, b.slot_date, b.time_slot_id),
         slot_start(b.slot_date, b.time_slot_id) <= now()
  from bookings b
  join time_slots ts on ts.id = b.time_slot_id
  join locations l on l.id = b.location_id
  where is_approved() and b.congregation_id = my_congregation()
    and b.publisher_id = p_user and b.status = 'active'
    and b.slot_date >= date_trunc('month', p_month)::date
    and b.slot_date <  (date_trunc('month', p_month) + interval '1 month')::date
  order by b.slot_date, ts.start_time
$$;

-- ---------------------------------------------------------------------
-- 5. Super Admin / MT Assistant actions
-- ---------------------------------------------------------------------
-- MT Assistants can approve or decline new registrations.
-- Only the Super Admin can deactivate or re-activate.
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
    perform notify(p_user, 'approved', 'Your account is approved',
                   'You can now book public witnessing sessions.', '/home');
  end if;
end $$;

create or replace function public.set_member_role(p_user uuid, p_role text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not is_overseer() or (select congregation_id from profiles where id = p_user) is distinct from my_congregation() then
    raise exception 'Only a Super Admin can do this';
  end if;
  if p_role not in ('publisher','assistant','overseer') then raise exception 'Unknown access level'; end if;
  if p_user = auth.uid() and p_role <> 'overseer' then
    raise exception 'Ask another Super Admin to change your access level';
  end if;
  update profiles set role = p_role where id = p_user;
end $$;

create or replace function public.set_service_type(p_user uuid, p_type text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not is_overseer() or (select congregation_id from profiles where id = p_user) is distinct from my_congregation() then
    raise exception 'Only a Super Admin can do this';
  end if;
  if p_type not in ('publisher','auxiliary_pioneer','regular_pioneer','fulltime_pioneer') then
    raise exception 'Unknown service type';
  end if;
  update profiles set service_type = p_type where id = p_user;
end $$;

create or replace function public.close_location_day(p_location uuid, p_date date, p_reason text)
returns int language plpgsql security definer set search_path = public as $$
declare r record; v_n int := 0; v_label text;
begin
  if not is_staff() or (select congregation_id from locations where id = p_location) is distinct from my_congregation() then
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

-- pre-register a publisher (then send them the app link on WhatsApp)
create or replace function public.preregister_publisher(p_full_name text, p_phone text,
                                                        p_service_type text default 'publisher')
returns text language plpgsql security definer set search_path = public as $$
declare v_phone text := normalize_phone(p_phone); v_existing text;
begin
  if not is_staff() then raise exception 'Only the Service Overseer can do this'; end if;
  if v_phone is null or length(v_phone) < 12 then raise exception 'Please enter a valid mobile number'; end if;
  if length(trim(coalesce(p_full_name, ''))) < 2 then raise exception 'Please enter the full name'; end if;
  if p_service_type not in ('publisher','auxiliary_pioneer','regular_pioneer','fulltime_pioneer') then
    raise exception 'Unknown service type';
  end if;
  select full_name into v_existing from profiles where phone = v_phone;
  if v_existing is not null then
    raise exception '% already has an account with this number', v_existing;
  end if;
  insert into preapprovals (congregation_id, full_name, phone, service_type, created_by)
  values (my_congregation(), trim(p_full_name), v_phone, p_service_type, auth.uid())
  on conflict (congregation_id, phone) do update
    set full_name = excluded.full_name, service_type = excluded.service_type,
        created_by = excluded.created_by, created_at = now(), used_by = null, used_at = null;
  return v_phone;
end $$;

-- delete a location. If it has any booking history it is hidden instead,
-- its future bookings are cancelled and the publishers are told.
create or replace function public.delete_location(p_location uuid)
returns text language plpgsql security definer set search_path = public as $$
declare v_loc locations; r record;
begin
  select * into v_loc from locations where id = p_location;
  if not is_overseer() or v_loc.congregation_id is distinct from my_congregation() then
    raise exception 'Only a Super Admin can do this';
  end if;
  if not exists (select 1 from bookings where location_id = p_location)
     and not exists (select 1 from invitations where location_id = p_location) then
    delete from locations where id = p_location;
    return 'deleted';
  end if;
  for r in select id, publisher_id, slot_date, time_slot_id from bookings
           where location_id = p_location and status = 'active'
             and slot_start(slot_date, time_slot_id) > now() loop
    update bookings set status = 'cancelled', ended_at = now() where id = r.id;
    perform notify(r.publisher_id, 'closure', v_loc.name || ' is no longer used',
                   'Your booking was cancelled: ' || slot_label(p_location, r.slot_date, r.time_slot_id),
                   '/home');
  end loop;
  update invitations set status = 'cancelled' where status = 'pending' and location_id = p_location;
  update locations set active = false, archived = true where id = p_location;
  return 'archived';
end $$;

create or replace function public.add_time_slot(p_start time, p_end time)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_clash time_slots;
begin
  if not is_overseer() then raise exception 'Only a Super Admin can do this'; end if;
  if p_end <= p_start then raise exception 'The end time must be after the start time'; end if;
  select * into v_clash from time_slots
   where congregation_id = my_congregation() and not archived
     and start_time < p_end and end_time > p_start limit 1;
  if v_clash.id is not null then
    raise exception 'This overlaps the % – % slot', to_char(v_clash.start_time, 'FMHH12:MI AM'),
      to_char(v_clash.end_time, 'FMHH12:MI AM');
  end if;
  insert into time_slots (congregation_id, start_time, end_time)
  values (my_congregation(), p_start, p_end) returning id into v_id;
  return v_id;
end $$;

create or replace function public.delete_time_slot(p_slot uuid)
returns text language plpgsql security definer set search_path = public as $$
declare v_ts time_slots; r record;
begin
  select * into v_ts from time_slots where id = p_slot;
  if not is_overseer() or v_ts.congregation_id is distinct from my_congregation() then
    raise exception 'Only a Super Admin can do this';
  end if;
  if not exists (select 1 from bookings where time_slot_id = p_slot)
     and not exists (select 1 from invitations where time_slot_id = p_slot) then
    delete from time_slots where id = p_slot;
    return 'deleted';
  end if;
  for r in select id, publisher_id, location_id, slot_date from bookings
           where time_slot_id = p_slot and status = 'active'
             and slot_start(slot_date, time_slot_id) > now() loop
    update bookings set status = 'cancelled', ended_at = now() where id = r.id;
    perform notify(r.publisher_id, 'closure', 'A time slot was removed',
                   'Your booking was cancelled: ' || slot_label(r.location_id, r.slot_date, p_slot),
                   '/home');
  end loop;
  update invitations set status = 'cancelled' where status = 'pending' and time_slot_id = p_slot;
  update time_slots set active = false, archived = true where id = p_slot;
  return 'archived';
end $$;

-- ---------------------------------------------------------------------
-- 6. Scheduled job: invitations now expire at the 04:30 deadline
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
   where status = 'pending' and booking_deadline(congregation_id, slot_date) <= now();
  return v_n;
end $$;

-- ---------------------------------------------------------------------
-- 7. Row Level Security: MT Assistants see what overseers see
-- ---------------------------------------------------------------------
alter table public.preapprovals enable row level security;

drop policy if exists profiles_read on public.profiles;
create policy profiles_read on public.profiles for select using (
  id = auth.uid()
  or (congregation_id = my_congregation() and (is_staff() or (is_approved() and status = 'approved')))
);

drop policy if exists closures_delete on public.closures;
create policy closures_delete on public.closures for delete using (
  is_staff() and exists (select 1 from locations l where l.id = location_id
                         and l.congregation_id = my_congregation()));

drop policy if exists invitations_read on public.invitations;
create policy invitations_read on public.invitations for select using (
  from_id = auth.uid() or to_id = auth.uid()
  or (is_staff() and congregation_id = my_congregation()));

drop policy if exists preapprovals_read on public.preapprovals;
create policy preapprovals_read on public.preapprovals for select
  using (is_staff() and congregation_id = my_congregation());
drop policy if exists preapprovals_delete on public.preapprovals;
create policy preapprovals_delete on public.preapprovals for delete
  using (is_staff() and congregation_id = my_congregation() and used_at is null);

-- ---------------------------------------------------------------------
-- 8. Who may call which function (full list, replaces v1's)
-- ---------------------------------------------------------------------
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
      public.login_email_for(text),
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
--  End of update v1.1
-- =====================================================================
