create extension if not exists pgcrypto;

create table if not exists profiles (
  id uuid primary key default gen_random_uuid(),
  profile_key text not null unique default 'default',
  adults integer not null default 0 check (adults >= 0),
  children integer not null default 0 check (children >= 0),
  household_size integer not null default 1 check (household_size >= 1),
  diet_tags text[] not null default '{}',
  equipment text[] not null default '{}',
  stores text[] not null default array['Trader Joe''s','Wegmans'],
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table profiles enable row level security;

-- Migrate the existing single-household prototype profile, if present.
with legacy as (
  select
    household_size,
    equipment,
    case
      when notes is not null and left(trim(notes),1) = '{' then notes::jsonb
      else '{}'::jsonb
    end as meta
  from weekly_plans
  where status = 'profile' and week_start = date '1970-01-01'
  order by created_at desc
  limit 1
)
insert into profiles (
  profile_key,
  adults,
  children,
  household_size,
  diet_tags,
  equipment,
  stores
)
select
  'default',
  greatest(0, coalesce((meta->>'adults')::integer, 0)),
  greatest(0, coalesce((meta->>'children')::integer, 0)),
  greatest(1, coalesce(household_size, 5)),
  coalesce(array(select jsonb_array_elements_text(meta->'dietTags')), '{}'),
  coalesce(equipment, '{}'),
  coalesce(array(select jsonb_array_elements_text(meta->'stores')), array['Trader Joe''s','Wegmans'])
from legacy
on conflict (profile_key) do update set
  adults = excluded.adults,
  children = excluded.children,
  household_size = excluded.household_size,
  diet_tags = excluded.diet_tags,
  equipment = excluded.equipment,
  stores = excluded.stores,
  updated_at = now();

-- The API will also clean up the legacy row after it confirms the new profile works.
