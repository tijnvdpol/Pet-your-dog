-- Phase 3: photo uploads (private bucket) and their AI analysis.

create table public.uploads (
  id uuid primary key default gen_random_uuid(),
  dog_id uuid not null references public.dogs (id) on delete cascade,
  owner_id uuid not null references auth.users (id) on delete cascade,
  storage_path text not null,
  type text not null default 'photo' check (type in ('photo', 'video')),
  analysis jsonb,
  created_at timestamptz not null default now()
);
create index uploads_dog_id_idx on public.uploads (dog_id);
create index uploads_owner_id_idx on public.uploads (owner_id);

alter table public.uploads enable row level security;

create policy "uploads: own select" on public.uploads for select to authenticated
  using ((select auth.uid()) = owner_id);
create policy "uploads: own insert" on public.uploads for insert to authenticated
  with check (
    (select auth.uid()) = owner_id
    and exists (select 1 from public.dogs d where d.id = dog_id and d.owner_id = (select auth.uid()))
  );
create policy "uploads: own update" on public.uploads for update to authenticated
  using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id);
create policy "uploads: own delete" on public.uploads for delete to authenticated
  using ((select auth.uid()) = owner_id);

revoke all on public.uploads from anon;
grant select, insert, update, delete on public.uploads to authenticated;

-- Cost control: analysis costs money per upload, so cap uploads per dog.
create function public.limit_uploads_per_dog()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (select count(*) from public.uploads where dog_id = new.dog_id) >= 5 then
    raise exception 'Upload limit reached (5 per dog)' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
create trigger uploads_limit before insert on public.uploads
  for each row execute function public.limit_uploads_per_dog();

-- Private bucket: 5 MB, images only. Files live under <user id>/...
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('dog-photos', 'dog-photos', false, 5242880, array['image/jpeg', 'image/png', 'image/webp']);

create policy "dog-photos: own read" on storage.objects for select to authenticated
  using (bucket_id = 'dog-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "dog-photos: own upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'dog-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "dog-photos: own delete" on storage.objects for delete to authenticated
  using (bucket_id = 'dog-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);
