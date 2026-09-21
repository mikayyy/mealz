begin;

create table if not exists public.mealz_trusted_devices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  email text not null,
  label text not null,
  device_token_hash text not null unique,
  pin_salt text not null,
  pin_hash text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_used_at timestamptz,
  revoked_at timestamptz
);

create index if not exists mealz_trusted_devices_user_idx
  on public.mealz_trusted_devices(user_id)
  where revoked_at is null;

alter table public.mealz_trusted_devices enable row level security;
revoke all on public.mealz_trusted_devices from public, anon, authenticated;

commit;
