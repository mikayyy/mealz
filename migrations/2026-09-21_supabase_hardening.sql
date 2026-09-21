begin;

-- Browser clients never need anonymous table access. Reset inherited/default
-- grants, then restore only the authenticated CRUD surface used by mealz.
revoke all on public.profiles,
  public.weekly_plans,
  public.meals,
  public.ingredients,
  public.recipe_steps,
  public.grocery_items
from public, anon, authenticated;

grant select, insert, update, delete on public.profiles,
  public.weekly_plans,
  public.meals,
  public.ingredients,
  public.recipe_steps,
  public.grocery_items
to authenticated;

-- Membership and invitation changes remain service-only. Authenticated users
-- may read only the columns already protected by household RLS policies.
revoke all on public.households, public.household_members
from public, anon, authenticated;
grant select(id, name, join_code_hint, created_by, created_at, updated_at)
  on public.households to authenticated;
grant select on public.household_members to authenticated;

-- These operational tables are intentionally default-deny under RLS and are
-- accessed only with the server secret.
revoke all on public.mealz_rate_limits, public.mealz_trusted_devices
from public, anon, authenticated;

-- PostgreSQL does not create indexes for foreign keys automatically.
create index if not exists households_created_by_idx
  on public.households(created_by);
create index if not exists profiles_owner_user_id_idx
  on public.profiles(owner_user_id);

-- Trusted devices should disappear when their Auth user is deleted. Add the
-- constraint idempotently, then validate it after the inexpensive catalog edit.
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'mealz_trusted_devices_user_id_fkey'
      and conrelid = 'public.mealz_trusted_devices'::regclass
  ) then
    alter table public.mealz_trusted_devices
      add constraint mealz_trusted_devices_user_id_fkey
      foreign key (user_id) references auth.users(id)
      on delete cascade not valid;
  end if;
end $$;
alter table public.mealz_trusted_devices
  validate constraint mealz_trusted_devices_user_id_fkey;

-- Wrap auth.uid() in a scalar subquery so Postgres evaluates it once per
-- statement rather than once per candidate row.
drop policy if exists household_members_self_select on public.household_members;
create policy household_members_self_select
on public.household_members for select to authenticated
using (user_id = (select auth.uid()));

drop policy if exists households_member_select on public.households;
create policy households_member_select
on public.households for select to authenticated
using (exists(
  select 1 from public.household_members hm
  where hm.household_id = households.id
    and hm.user_id = (select auth.uid())
));

drop policy if exists profiles_household_all on public.profiles;
create policy profiles_household_all
on public.profiles for all to authenticated
using (exists(
  select 1 from public.household_members hm
  where hm.household_id = profiles.household_id
    and hm.user_id = (select auth.uid())
))
with check (exists(
  select 1 from public.household_members hm
  where hm.household_id = profiles.household_id
    and hm.user_id = (select auth.uid())
));

drop policy if exists weekly_plans_household_all on public.weekly_plans;
create policy weekly_plans_household_all
on public.weekly_plans for all to authenticated
using (exists(
  select 1 from public.household_members hm
  where hm.household_id = weekly_plans.household_id
    and hm.user_id = (select auth.uid())
))
with check (exists(
  select 1 from public.household_members hm
  where hm.household_id = weekly_plans.household_id
    and hm.user_id = (select auth.uid())
));

drop policy if exists meals_household_all on public.meals;
create policy meals_household_all
on public.meals for all to authenticated
using (exists(
  select 1
  from public.weekly_plans p
  join public.household_members hm on hm.household_id = p.household_id
  where p.id = meals.weekly_plan_id
    and hm.user_id = (select auth.uid())
))
with check (exists(
  select 1
  from public.weekly_plans p
  join public.household_members hm on hm.household_id = p.household_id
  where p.id = meals.weekly_plan_id
    and hm.user_id = (select auth.uid())
));

drop policy if exists ingredients_household_all on public.ingredients;
create policy ingredients_household_all
on public.ingredients for all to authenticated
using (exists(
  select 1
  from public.meals m
  join public.weekly_plans p on p.id = m.weekly_plan_id
  join public.household_members hm on hm.household_id = p.household_id
  where m.id = ingredients.meal_id
    and hm.user_id = (select auth.uid())
))
with check (exists(
  select 1
  from public.meals m
  join public.weekly_plans p on p.id = m.weekly_plan_id
  join public.household_members hm on hm.household_id = p.household_id
  where m.id = ingredients.meal_id
    and hm.user_id = (select auth.uid())
));

drop policy if exists recipe_steps_household_all on public.recipe_steps;
create policy recipe_steps_household_all
on public.recipe_steps for all to authenticated
using (exists(
  select 1
  from public.meals m
  join public.weekly_plans p on p.id = m.weekly_plan_id
  join public.household_members hm on hm.household_id = p.household_id
  where m.id = recipe_steps.meal_id
    and hm.user_id = (select auth.uid())
))
with check (exists(
  select 1
  from public.meals m
  join public.weekly_plans p on p.id = m.weekly_plan_id
  join public.household_members hm on hm.household_id = p.household_id
  where m.id = recipe_steps.meal_id
    and hm.user_id = (select auth.uid())
));

drop policy if exists grocery_items_household_all on public.grocery_items;
create policy grocery_items_household_all
on public.grocery_items for all to authenticated
using (exists(
  select 1
  from public.weekly_plans p
  join public.household_members hm on hm.household_id = p.household_id
  where p.id = grocery_items.weekly_plan_id
    and hm.user_id = (select auth.uid())
))
with check (exists(
  select 1
  from public.weekly_plans p
  join public.household_members hm on hm.household_id = p.household_id
  where p.id = grocery_items.weekly_plan_id
    and hm.user_id = (select auth.uid())
));

commit;
