-- Phase 2: accounts, dogs and meters. RLS is enabled on every table.

-- ---------------------------------------------------------------- profiles
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  push_subscription jsonb,
  -- Quiet hours for push notifications, local hour of day (0-23).
  quiet_hours_start smallint not null default 22 check (quiet_hours_start between 0 and 23),
  quiet_hours_end smallint not null default 8 check (quiet_hours_end between 0 and 23),
  created_at timestamptz not null default now()
);

-- -------------------------------------------------------------------- dogs
create table public.dogs (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  name text not null default 'Max' check (char_length(name) between 1 and 40),
  base_model text not null default 'large',
  appearance jsonb not null default '{}'::jsonb,
  character jsonb not null default '{}'::jsonb,
  level integer not null default 1 check (level >= 1),
  xp integer not null default 0 check (xp >= 0),
  created_at timestamptz not null default now()
);
create index dogs_owner_id_idx on public.dogs (owner_id);

-- --------------------------------------------------------------- dog_stats
-- Each meter stores its last value plus the time of that value; the app
-- computes the current value on open (no server timers).
create table public.dog_stats (
  dog_id uuid primary key references public.dogs (id) on delete cascade,
  hunger real not null default 80 check (hunger between 0 and 100),
  hunger_at timestamptz not null default now(),
  energy real not null default 80 check (energy between 0 and 100),
  energy_at timestamptz not null default now(),
  happiness real not null default 70 check (happiness between 0 and 100),
  happiness_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

-- --------------------------------------------------------------------- RLS
alter table public.profiles enable row level security;
alter table public.dogs enable row level security;
alter table public.dog_stats enable row level security;

create policy "profiles: own row select" on public.profiles for select to authenticated
  using ((select auth.uid()) = id);
create policy "profiles: own row insert" on public.profiles for insert to authenticated
  with check ((select auth.uid()) = id);
create policy "profiles: own row update" on public.profiles for update to authenticated
  using ((select auth.uid()) = id) with check ((select auth.uid()) = id);

create policy "dogs: own select" on public.dogs for select to authenticated
  using ((select auth.uid()) = owner_id);
create policy "dogs: own insert" on public.dogs for insert to authenticated
  with check ((select auth.uid()) = owner_id);
create policy "dogs: own update" on public.dogs for update to authenticated
  using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id);
create policy "dogs: own delete" on public.dogs for delete to authenticated
  using ((select auth.uid()) = owner_id);

create policy "dog_stats: own select" on public.dog_stats for select to authenticated
  using (exists (select 1 from public.dogs d where d.id = dog_id and d.owner_id = (select auth.uid())));
create policy "dog_stats: own insert" on public.dog_stats for insert to authenticated
  with check (exists (select 1 from public.dogs d where d.id = dog_id and d.owner_id = (select auth.uid())));
create policy "dog_stats: own update" on public.dog_stats for update to authenticated
  using (exists (select 1 from public.dogs d where d.id = dog_id and d.owner_id = (select auth.uid())))
  with check (exists (select 1 from public.dogs d where d.id = dog_id and d.owner_id = (select auth.uid())));

-- Signed-in users only; anonymous visitors get nothing.
revoke all on public.profiles, public.dogs, public.dog_stats from anon;
grant select, insert, update on public.profiles to authenticated;
grant select, insert, update, delete on public.dogs to authenticated;
grant select, insert, update on public.dog_stats to authenticated;

-- ------------------------------------------- create a profile on sign-up
create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id) values (new.id);
  return new;
end;
$$;
-- Only the trigger should call this; it is not an API endpoint.
revoke execute on function public.handle_new_user() from public, anon, authenticated;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
