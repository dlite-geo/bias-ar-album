-- PinViz schema v1
-- Tables: spaces (per-user saved photo arrangements)

create table if not exists public.spaces (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  name         text not null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  layout_seed  bigint not null,
  photo_meta   jsonb not null default '[]'::jsonb
  -- photo_meta = [{ name, size, contentHash, aspectRatio, scale, position: {x,y,z} }]
);

create index if not exists spaces_user_id_idx on public.spaces (user_id, created_at desc);

-- Row-Level Security
alter table public.spaces enable row level security;

drop policy if exists "spaces_select_own" on public.spaces;
create policy "spaces_select_own" on public.spaces
  for select using (auth.uid() = user_id);

drop policy if exists "spaces_insert_own" on public.spaces;
create policy "spaces_insert_own" on public.spaces
  for insert with check (auth.uid() = user_id);

drop policy if exists "spaces_update_own" on public.spaces;
create policy "spaces_update_own" on public.spaces
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "spaces_delete_own" on public.spaces;
create policy "spaces_delete_own" on public.spaces
  for delete using (auth.uid() = user_id);

-- Auto-update updated_at
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists spaces_set_updated_at on public.spaces;
create trigger spaces_set_updated_at
  before update on public.spaces
  for each row execute procedure public.set_updated_at();
