begin;

create extension if not exists pgcrypto;

create table if not exists profiles (
  id uuid primary key default gen_random_uuid(),
  profile_key text not null default 'default',
  adults integer not null default 0 check (adults >= 0),
  children integer not null default 0 check (children >= 0),
  household_size integer not null default 1 check (household_size >= 1),
  diet_tags text[] not null default '{}',
  equipment text[] not null default '{}',
  stores text[] not null default array['Trader Joe''s','Wegmans'],
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table profiles add column if not exists owner_user_id uuid references auth.users(id) on delete cascade;
alter table weekly_plans add column if not exists owner_user_id uuid references auth.users(id) on delete cascade;

-- This prototype has historically had one shared household. Only auto-claim legacy
-- rows when exactly one Supabase Auth user exists, so we never guess ownership.
do $$
declare
  auth_user_count integer;
  sole_user uuid;
begin
  select count(*) into auth_user_count from auth.users;
  if auth_user_count = 1 then
    select id into sole_user from auth.users order by created_at asc limit 1;
    update profiles set owner_user_id = sole_user where owner_user_id is null;
    update weekly_plans set owner_user_id = sole_user where owner_user_id is null;
  elsif exists(select 1 from profiles where owner_user_id is null)
     or exists(select 1 from weekly_plans where owner_user_id is null) then
    raise exception 'mealz ownership migration stopped: found unowned data with % auth users. Assign owner_user_id manually, then rerun.', auth_user_count;
  end if;
end $$;

-- Replace the old global profile-key uniqueness with per-user uniqueness.
alter table profiles drop constraint if exists profiles_profile_key_key;
create unique index if not exists profiles_owner_profile_key_idx on profiles(owner_user_id, profile_key);
create index if not exists weekly_plans_owner_week_idx on weekly_plans(owner_user_id, week_start desc);

-- Once legacy rows have been claimed, ownership becomes mandatory.
do $$
begin
  if exists(select 1 from profiles where owner_user_id is null)
     or exists(select 1 from weekly_plans where owner_user_id is null) then
    raise exception 'mealz ownership migration stopped: unowned rows remain.';
  end if;
end $$;

alter table profiles alter column owner_user_id set not null;
alter table weekly_plans alter column owner_user_id set not null;

alter table profiles enable row level security;
alter table weekly_plans enable row level security;
alter table meals enable row level security;
alter table ingredients enable row level security;
alter table recipe_steps enable row level security;
alter table grocery_items enable row level security;

drop policy if exists profiles_owner_all on profiles;
create policy profiles_owner_all on profiles for all to authenticated
using (owner_user_id = auth.uid())
with check (owner_user_id = auth.uid());

drop policy if exists weekly_plans_owner_all on weekly_plans;
create policy weekly_plans_owner_all on weekly_plans for all to authenticated
using (owner_user_id = auth.uid())
with check (owner_user_id = auth.uid());

drop policy if exists meals_owner_all on meals;
create policy meals_owner_all on meals for all to authenticated
using (exists(select 1 from weekly_plans p where p.id = meals.weekly_plan_id and p.owner_user_id = auth.uid()))
with check (exists(select 1 from weekly_plans p where p.id = meals.weekly_plan_id and p.owner_user_id = auth.uid()));

drop policy if exists ingredients_owner_all on ingredients;
create policy ingredients_owner_all on ingredients for all to authenticated
using (exists(select 1 from meals m join weekly_plans p on p.id = m.weekly_plan_id where m.id = ingredients.meal_id and p.owner_user_id = auth.uid()))
with check (exists(select 1 from meals m join weekly_plans p on p.id = m.weekly_plan_id where m.id = ingredients.meal_id and p.owner_user_id = auth.uid()));

drop policy if exists recipe_steps_owner_all on recipe_steps;
create policy recipe_steps_owner_all on recipe_steps for all to authenticated
using (exists(select 1 from meals m join weekly_plans p on p.id = m.weekly_plan_id where m.id = recipe_steps.meal_id and p.owner_user_id = auth.uid()))
with check (exists(select 1 from meals m join weekly_plans p on p.id = m.weekly_plan_id where m.id = recipe_steps.meal_id and p.owner_user_id = auth.uid()));

drop policy if exists grocery_items_owner_all on grocery_items;
create policy grocery_items_owner_all on grocery_items for all to authenticated
using (exists(select 1 from weekly_plans p where p.id = grocery_items.weekly_plan_id and p.owner_user_id = auth.uid()))
with check (exists(select 1 from weekly_plans p where p.id = grocery_items.weekly_plan_id and p.owner_user_id = auth.uid()));

grant select, insert, update, delete on profiles, weekly_plans, meals, ingredients, recipe_steps, grocery_items to authenticated;

commit;
