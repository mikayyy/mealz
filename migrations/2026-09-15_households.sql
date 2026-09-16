begin;

create extension if not exists pgcrypto;

create table if not exists households (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_by uuid not null references auth.users(id) on delete restrict,
  join_code_hash text,
  join_code_hint text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists household_members (
  household_id uuid not null references households(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'member' check (role in ('owner','member')),
  created_at timestamptz not null default now(),
  primary key (household_id,user_id),
  unique (user_id)
);

alter table profiles add column if not exists household_id uuid references households(id) on delete cascade;
alter table weekly_plans add column if not exists household_id uuid references households(id) on delete cascade;

-- v0.16.0 made data user-owned. Convert each owner into one household and
-- preserve every existing profile/week under that household.
do $$
declare
  r record;
  h uuid;
begin
  for r in
    select distinct owner_user_id
    from (
      select owner_user_id from profiles
      union
      select owner_user_id from weekly_plans
    ) x
    where owner_user_id is not null
  loop
    select household_id into h from household_members where user_id = r.owner_user_id limit 1;
    if h is null then
      insert into households(name,created_by)
      values ('My household',r.owner_user_id)
      returning id into h;

      insert into household_members(household_id,user_id,role)
      values (h,r.owner_user_id,'owner');
    end if;

    update profiles set household_id = h where owner_user_id = r.owner_user_id and household_id is null;
    update weekly_plans set household_id = h where owner_user_id = r.owner_user_id and household_id is null;
  end loop;
end $$;

-- Refuse to complete if anything would become orphaned.
do $$
begin
  if exists(select 1 from profiles where household_id is null)
     or exists(select 1 from weekly_plans where household_id is null) then
    raise exception 'mealz household migration stopped: unassigned profile or weekly plan rows remain.';
  end if;
end $$;

alter table profiles alter column household_id set not null;
alter table weekly_plans alter column household_id set not null;

-- Household ownership is authoritative now. Keep owner_user_id temporarily for
-- diagnostics/rollback, but allow it to be null so new household-owned rows do not
-- fail the NOT NULL constraint introduced by v0.16.0.
alter table profiles alter column owner_user_id drop not null;
alter table weekly_plans alter column owner_user_id drop not null;

-- Keep owner_user_id temporarily for rollback/diagnostics, but household_id is now authoritative.
drop index if exists profiles_owner_profile_key_idx;
create unique index if not exists profiles_household_profile_key_idx on profiles(household_id,profile_key);
create index if not exists weekly_plans_household_week_idx on weekly_plans(household_id,week_start desc);
create unique index if not exists households_join_code_hash_idx on households(join_code_hash) where join_code_hash is not null;

alter table households enable row level security;
alter table household_members enable row level security;
alter table profiles enable row level security;
alter table weekly_plans enable row level security;
alter table meals enable row level security;
alter table ingredients enable row level security;
alter table recipe_steps enable row level security;
alter table grocery_items enable row level security;

-- A user may read their own membership row. Membership mutations go through the server API.
drop policy if exists household_members_self_select on household_members;
create policy household_members_self_select on household_members for select to authenticated
using (user_id = auth.uid());

drop policy if exists households_member_select on households;
create policy households_member_select on households for select to authenticated
using (exists(select 1 from household_members hm where hm.household_id = households.id and hm.user_id = auth.uid()));

-- Replace v0.16 user-owner policies with household membership policies.
drop policy if exists profiles_owner_all on profiles;
drop policy if exists weekly_plans_owner_all on weekly_plans;
drop policy if exists meals_owner_all on meals;
drop policy if exists ingredients_owner_all on ingredients;
drop policy if exists recipe_steps_owner_all on recipe_steps;
drop policy if exists grocery_items_owner_all on grocery_items;

drop policy if exists profiles_household_all on profiles;
create policy profiles_household_all on profiles for all to authenticated
using (exists(select 1 from household_members hm where hm.household_id = profiles.household_id and hm.user_id = auth.uid()))
with check (exists(select 1 from household_members hm where hm.household_id = profiles.household_id and hm.user_id = auth.uid()));

drop policy if exists weekly_plans_household_all on weekly_plans;
create policy weekly_plans_household_all on weekly_plans for all to authenticated
using (exists(select 1 from household_members hm where hm.household_id = weekly_plans.household_id and hm.user_id = auth.uid()))
with check (exists(select 1 from household_members hm where hm.household_id = weekly_plans.household_id and hm.user_id = auth.uid()));

drop policy if exists meals_household_all on meals;
create policy meals_household_all on meals for all to authenticated
using (exists(select 1 from weekly_plans p join household_members hm on hm.household_id = p.household_id where p.id = meals.weekly_plan_id and hm.user_id = auth.uid()))
with check (exists(select 1 from weekly_plans p join household_members hm on hm.household_id = p.household_id where p.id = meals.weekly_plan_id and hm.user_id = auth.uid()));

drop policy if exists ingredients_household_all on ingredients;
create policy ingredients_household_all on ingredients for all to authenticated
using (exists(select 1 from meals m join weekly_plans p on p.id = m.weekly_plan_id join household_members hm on hm.household_id = p.household_id where m.id = ingredients.meal_id and hm.user_id = auth.uid()))
with check (exists(select 1 from meals m join weekly_plans p on p.id = m.weekly_plan_id join household_members hm on hm.household_id = p.household_id where m.id = ingredients.meal_id and hm.user_id = auth.uid()));

drop policy if exists recipe_steps_household_all on recipe_steps;
create policy recipe_steps_household_all on recipe_steps for all to authenticated
using (exists(select 1 from meals m join weekly_plans p on p.id = m.weekly_plan_id join household_members hm on hm.household_id = p.household_id where m.id = recipe_steps.meal_id and hm.user_id = auth.uid()))
with check (exists(select 1 from meals m join weekly_plans p on p.id = m.weekly_plan_id join household_members hm on hm.household_id = p.household_id where m.id = recipe_steps.meal_id and hm.user_id = auth.uid()));

drop policy if exists grocery_items_household_all on grocery_items;
create policy grocery_items_household_all on grocery_items for all to authenticated
using (exists(select 1 from weekly_plans p join household_members hm on hm.household_id = p.household_id where p.id = grocery_items.weekly_plan_id and hm.user_id = auth.uid()))
with check (exists(select 1 from weekly_plans p join household_members hm on hm.household_id = p.household_id where p.id = grocery_items.weekly_plan_id and hm.user_id = auth.uid()));

grant select on households, household_members to authenticated;
grant select, insert, update, delete on profiles, weekly_plans, meals, ingredients, recipe_steps, grocery_items to authenticated;

commit;
