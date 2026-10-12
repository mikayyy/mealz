begin;

-- Refuse to guess which existing week is authoritative. Resolve duplicates
-- explicitly before applying this migration; never delete household data here.
do $$ begin
  if exists(select 1 from public.weekly_plans where status='active' and household_id is not null group by household_id,week_start having count(*)>1) then
    raise exception 'Resolve duplicate active household weeks before transactional-save migration';
  end if;
end $$;

alter table public.weekly_plans add column if not exists revision bigint not null default 1;
create unique index if not exists weekly_plans_active_household_week_unique
  on public.weekly_plans(household_id,week_start) where status='active' and household_id is not null;

create table if not exists public.mealz_plan_save_receipts (
  household_id uuid not null references public.households(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  request_key uuid not null,
  week_start date not null,
  request_hash text not null,
  plan_id uuid not null references public.weekly_plans(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key(household_id,user_id,request_key)
);
alter table public.mealz_plan_save_receipts enable row level security;
revoke all on public.mealz_plan_save_receipts from anon,authenticated;
grant select,insert on public.mealz_plan_save_receipts to authenticated;
-- Runtime/live readiness use a service-role, read-only schema probe.
grant select on public.mealz_plan_save_receipts to service_role;
drop policy if exists save_receipts_select on public.mealz_plan_save_receipts;
create policy save_receipts_select on public.mealz_plan_save_receipts for select to authenticated
  using(user_id=(select auth.uid()) and exists(select 1 from public.household_members hm where hm.household_id=mealz_plan_save_receipts.household_id and hm.user_id=(select auth.uid())));
drop policy if exists save_receipts_insert on public.mealz_plan_save_receipts;
create policy save_receipts_insert on public.mealz_plan_save_receipts for insert to authenticated
  with check(user_id=(select auth.uid()) and exists(select 1 from public.household_members hm where hm.household_id=mealz_plan_save_receipts.household_id and hm.user_id=(select auth.uid()))
    and exists(select 1 from public.weekly_plans p where p.id=plan_id and p.household_id=mealz_plan_save_receipts.household_id and p.week_start=mealz_plan_save_receipts.week_start));

-- Transaction locks work even for the first save, before a plan row exists.
create or replace function public.mealz_lock_week(p_household uuid,p_week date)
returns void language plpgsql security invoker set search_path='' as $$
declare v_lock bigint;
begin
  if auth.uid() is null or not exists(select 1 from public.household_members where household_id=p_household and user_id=auth.uid()) then
    raise sqlstate 'PT403' using message='Household access denied.';
  end if;
  v_lock:=pg_catalog.hashtextextended(p_household::text||':'||p_week::text,0);
  perform pg_advisory_xact_lock(v_lock);
end $$;

create or replace function public.mealz_bump_plan_revision()
returns trigger language plpgsql security invoker set search_path='' as $$
begin
  new.revision:=old.revision+1;
  new.updated_at:=now();
  return new;
end $$;
drop trigger if exists mealz_plan_revision on public.weekly_plans;
create trigger mealz_plan_revision before update on public.weekly_plans
  for each row execute function public.mealz_bump_plan_revision();

-- Protect against stale snapshots even when a caller writes through REST
-- rather than the mutation RPC. RPCs lock the week BEFORE touching child rows.
create or replace function public.mealz_child_revision()
returns trigger language plpgsql security invoker set search_path='' as $$
declare v_plan uuid; v_parent public.weekly_plans; v_meal uuid;
begin
  if tg_table_name in ('ingredients','recipe_steps') then
    if tg_op='DELETE' then v_meal:=old.meal_id; else v_meal:=new.meal_id; end if;
    if tg_op='UPDATE' and new.meal_id<>old.meal_id then raise sqlstate 'PT400' using message='Moving recipe rows between meals is not supported.'; end if;
    select weekly_plan_id into v_plan from public.meals where id=v_meal;
  else
    if tg_op='DELETE' then v_plan:=old.weekly_plan_id; else v_plan:=new.weekly_plan_id; end if;
    if tg_op='UPDATE' and new.weekly_plan_id<>old.weekly_plan_id then raise sqlstate 'PT400' using message='Moving rows between weeks is not supported.'; end if;
  end if;
  select * into v_parent from public.weekly_plans where id=v_plan;
  if found and v_parent.status='active' then
    perform public.mealz_lock_week(v_parent.household_id,v_parent.week_start);
    update public.weekly_plans set revision=revision+1 where id=v_plan;
  end if;
  if tg_op='DELETE' then return old; end if;
  return new;
end $$;
drop trigger if exists mealz_grocery_revision on public.grocery_items;
create trigger mealz_grocery_revision before insert or update or delete on public.grocery_items for each row execute function public.mealz_child_revision();
drop trigger if exists mealz_meal_revision on public.meals;
create trigger mealz_meal_revision before insert or update or delete on public.meals for each row execute function public.mealz_child_revision();
drop trigger if exists mealz_ingredient_revision on public.ingredients;
create trigger mealz_ingredient_revision before insert or update or delete on public.ingredients for each row execute function public.mealz_child_revision();
drop trigger if exists mealz_step_revision on public.recipe_steps;
create trigger mealz_step_revision before insert or update or delete on public.recipe_steps for each row execute function public.mealz_child_revision();

-- One SQL snapshot returns recipes, groceries and their matching revision.
create or replace function public.mealz_week_result(p_plan uuid,p_replayed boolean)
returns jsonb language sql stable security invoker set search_path='' as $$
  select jsonb_build_object('planId',p.id,'revision',p.revision,'plan',to_jsonb(p),'replayed',p_replayed,
    'meals',coalesce((select jsonb_agg(to_jsonb(m)||jsonb_build_object('id',coalesce(m.meal_key,m.id::text),
      'ingredients',coalesce((select jsonb_agg(jsonb_build_object('name',i.name,'quantity',i.quantity,'unit',i.unit,'category',i.category,'optional',i.optional) order by i.id) from public.ingredients i where i.meal_id=m.id),'[]'::jsonb),
      'steps',coalesce((select jsonb_agg(s.instruction order by s.step_number) from public.recipe_steps s where s.meal_id=m.id),'[]'::jsonb)) order by m.sort_order,m.id) from public.meals m where m.weekly_plan_id=p.id),'[]'::jsonb),
    'groceryItems',coalesce((select jsonb_agg(to_jsonb(g) order by g.category,g.name,g.id) from public.grocery_items g where g.weekly_plan_id=p.id and g.deleted=false),'[]'::jsonb))
  from public.weekly_plans p where p.id=p_plan and p.status='active';
$$;

create or replace function public.mealz_save_week(p_household uuid,p_week date,p_expected_revision bigint,p_request_key uuid,p_payload jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare
  v_plan public.weekly_plans; v_receipt public.mealz_plan_save_receipts; v_hash text;
  v_meal jsonb; v_grocery jsonb; v_meal_id uuid; v_item_id uuid; v_retained uuid[]:='{}'; v_index integer:=0;
begin
  if p_week is null or extract(isodow from p_week)<>1 or p_expected_revision is null or p_expected_revision<0 or p_request_key is null then
    raise sqlstate 'PT400' using message='A Monday week, revision, and request key are required.';
  end if;
  if jsonb_typeof(p_payload->'meals') is distinct from 'array' or jsonb_array_length(p_payload->'meals') not between 1 and 7
     or jsonb_typeof(p_payload->'groceries') is distinct from 'array' or jsonb_array_length(p_payload->'groceries')>1000
     or octet_length(p_payload::text)>1000000 then
    raise sqlstate 'PT400' using message='Invalid week payload.';
  end if;
  perform public.mealz_lock_week(p_household,p_week);
  -- Reconciliation rows are derived from a revision-checked database snapshot.
  -- Exclude those rows from retry identity: retries may see newer groceries.
  v_hash:=encode(sha256(convert_to(jsonb_build_object('week',p_week,'revision',p_expected_revision,'payload',p_payload-'groceries'-'snapshot_revision')::text,'UTF8')),'hex');
  select * into v_receipt from public.mealz_plan_save_receipts where household_id=p_household and user_id=auth.uid() and request_key=p_request_key;
  if found then
    if v_receipt.request_hash<>v_hash or v_receipt.week_start<>p_week then raise sqlstate 'PT409' using message='This retry key belongs to a different request.'; end if;
    select * into v_plan from public.weekly_plans where id=v_receipt.plan_id and household_id=p_household and week_start=p_week and status='active';
    if not found then raise sqlstate 'PT409' using message='The saved week has changed. Reload it before continuing.'; end if;
    return public.mealz_week_result(v_plan.id,true);
  end if;
  select * into v_plan from public.weekly_plans where household_id=p_household and week_start=p_week and status='active' for update;
  if coalesce(v_plan.revision,0)<>p_expected_revision or coalesce((p_payload->>'snapshot_revision')::bigint,-1)<>p_expected_revision then
    raise sqlstate 'PT409' using message='Someone changed this week. Reload the saved week before continuing.';
  end if;
  if v_plan.id is null then
    insert into public.weekly_plans(household_id,owner_user_id,week_start,status,household_size,cooking_days,equipment,use_up,notes)
      values(p_household,auth.uid(),p_week,'active',(p_payload->>'householdSize')::integer,array(select jsonb_array_elements_text(p_payload->'days')),array(select jsonb_array_elements_text(p_payload->'equipment')),nullif(p_payload->>'useUp',''),nullif(p_payload->>'notes','')) returning * into v_plan;
  else
    update public.weekly_plans set household_size=(p_payload->>'householdSize')::integer,cooking_days=array(select jsonb_array_elements_text(p_payload->'days')),
      equipment=array(select jsonb_array_elements_text(p_payload->'equipment')),use_up=nullif(p_payload->>'useUp',''),notes=nullif(p_payload->>'notes','') where id=v_plan.id;
    delete from public.meals where weekly_plan_id=v_plan.id;
  end if;
  for v_meal in select value from jsonb_array_elements(p_payload->'meals') loop
    if jsonb_typeof(v_meal->'ingredients') is distinct from 'array' or jsonb_typeof(v_meal->'steps') is distinct from 'array'
      or jsonb_array_length(v_meal->'ingredients')>100 or jsonb_array_length(v_meal->'steps')>100 or length(v_meal->>'title') not between 1 and 200 then
      raise sqlstate 'PT400' using message='Invalid recipe.';
    end if;
    insert into public.meals(weekly_plan_id,meal_key,day,title,description,emoji,servings,total_minutes,difficulty,tags,kid_note,sort_order)
      values(v_plan.id,v_meal->>'id',v_meal->>'day',v_meal->>'title',v_meal->>'description',v_meal->>'emoji',(v_meal->>'servings')::integer,(v_meal->>'total_minutes')::integer,
        v_meal->>'difficulty',array(select jsonb_array_elements_text(v_meal->'tags')),v_meal->>'kid_note',v_index) returning id into v_meal_id;
    insert into public.ingredients(meal_id,name,quantity,unit,category,optional)
      select v_meal_id,x.name,x.quantity,x.unit,x.category,coalesce(x.optional,false) from jsonb_to_recordset(v_meal->'ingredients') as x(name text,quantity numeric,unit text,category text,optional boolean);
    insert into public.recipe_steps(meal_id,step_number,instruction)
      select v_meal_id,ordinality::integer,value from jsonb_array_elements_text(v_meal->'steps') with ordinality;
    v_index:=v_index+1;
  end loop;
  for v_grocery in select value from jsonb_array_elements(p_payload->'groceries') loop
    v_item_id:=nullif(v_grocery->>'id','')::uuid;
    if v_item_id is not null then
      -- Never accept another plan's grocery ID, even in the same household.
      if not exists(select 1 from public.grocery_items where id=v_item_id and weekly_plan_id=v_plan.id) then raise sqlstate 'PT400' using message='Invalid retained grocery row.'; end if;
      update public.grocery_items set name=v_grocery->>'name',quantity=(v_grocery->>'quantity')::numeric,unit=v_grocery->>'unit',category=v_grocery->>'category',
        checked=coalesce((v_grocery->>'checked')::boolean,false),needed_this_week=coalesce((v_grocery->>'needed_this_week')::boolean,false),source=v_grocery->>'source',
        source_key=v_grocery->>'source_key',user_modified=coalesce((v_grocery->>'user_modified')::boolean,false),deleted=coalesce((v_grocery->>'deleted')::boolean,false),updated_at=now() where id=v_item_id;
    else
      insert into public.grocery_items(weekly_plan_id,name,quantity,unit,category,checked,needed_this_week,source,source_key,user_modified,deleted)
        values(v_plan.id,v_grocery->>'name',(v_grocery->>'quantity')::numeric,v_grocery->>'unit',v_grocery->>'category',coalesce((v_grocery->>'checked')::boolean,false),
          coalesce((v_grocery->>'needed_this_week')::boolean,false),v_grocery->>'source',v_grocery->>'source_key',coalesce((v_grocery->>'user_modified')::boolean,false),coalesce((v_grocery->>'deleted')::boolean,false)) returning id into v_item_id;
    end if;
    v_retained:=array_append(v_retained,v_item_id);
  end loop;
  delete from public.grocery_items where weekly_plan_id=v_plan.id and not(id=any(v_retained));
  -- Cache cleanup is part of this transaction: failure rolls back the entire save.
  delete from public.weekly_plans where household_id=p_household and week_start=p_week and status='ideas';
  insert into public.mealz_plan_save_receipts(household_id,user_id,request_key,week_start,request_hash,plan_id)
    values(p_household,auth.uid(),p_request_key,p_week,v_hash,v_plan.id);
  select * into v_plan from public.weekly_plans where id=v_plan.id;
  return public.mealz_week_result(v_plan.id,false);
end $$;

create or replace function public.mealz_mutate_grocery(p_plan uuid,p_item uuid,p_expected_revision bigint,p_action text,p_fields jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare v_plan public.weekly_plans; v_item public.grocery_items;
begin
  select * into v_plan from public.weekly_plans where id=p_plan and status='active';
  if not found then raise sqlstate 'PT403' using message='Saved week access denied.'; end if;
  perform public.mealz_lock_week(v_plan.household_id,v_plan.week_start);
  select * into v_plan from public.weekly_plans where id=p_plan for update;
  if p_expected_revision is null or p_expected_revision<>v_plan.revision then raise sqlstate 'PT409' using message='Someone changed this week. Reload the saved week before continuing.'; end if;
  if p_action='add' then
    insert into public.grocery_items(weekly_plan_id,name,quantity,unit,category,source,user_modified,needed_this_week)
      values(p_plan,p_fields->>'name',(p_fields->>'quantity')::numeric,p_fields->>'unit',p_fields->>'category','manual',true,coalesce((p_fields->>'needed_this_week')::boolean,false)) returning * into v_item;
  else
    select * into v_item from public.grocery_items where id=p_item and weekly_plan_id=p_plan and deleted=false for update;
    if not found then raise sqlstate 'PT404' using message='Grocery item was not found.'; end if;
    if p_action='toggle' then
      update public.grocery_items set checked=(p_fields->>'checked')::boolean,updated_at=now() where id=v_item.id returning * into v_item;
    elsif p_action='set_needed' then
      update public.grocery_items set needed_this_week=(p_fields->>'needed_this_week')::boolean,checked=case when (p_fields->>'needed_this_week')::boolean then checked else false end,updated_at=now() where id=v_item.id returning * into v_item;
    elsif p_action='edit' then
      update public.grocery_items set name=p_fields->>'name',quantity=(p_fields->>'quantity')::numeric,unit=p_fields->>'unit',category=p_fields->>'category',user_modified=true,updated_at=now() where id=v_item.id returning * into v_item;
    elsif p_action='delete' then
      update public.grocery_items set deleted=true,updated_at=now() where id=v_item.id returning * into v_item;
    else raise sqlstate 'PT400' using message='Unknown grocery action.';
    end if;
  end if;
  select * into v_plan from public.weekly_plans where id=p_plan;
  return jsonb_build_object('item',to_jsonb(v_item),'revision',v_plan.revision,'ok',true);
end $$;

create or replace function public.mealz_set_feedback(p_plan uuid,p_meal_key text,p_expected_revision bigint,p_make_again boolean)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare v_plan public.weekly_plans; v_meal public.meals;
begin
  select * into v_plan from public.weekly_plans where id=p_plan and status='active';
  if not found then raise sqlstate 'PT403' using message='Saved week access denied.'; end if;
  perform public.mealz_lock_week(v_plan.household_id,v_plan.week_start);
  select * into v_plan from public.weekly_plans where id=p_plan for update;
  if p_expected_revision is null or p_expected_revision<>v_plan.revision then raise sqlstate 'PT409' using message='Someone changed this week. Reload the saved week before continuing.'; end if;
  if p_make_again is null then raise sqlstate 'PT400' using message='Choose a valid meal preference.'; end if;
  update public.meals set tags=array_remove(coalesce(tags,'{}'),'Make again')||case when p_make_again then array['Make again'] else '{}'::text[] end
    where weekly_plan_id=p_plan and meal_key=p_meal_key returning * into v_meal;
  if not found then raise sqlstate 'PT404' using message='Meal not found.'; end if;
  select * into v_plan from public.weekly_plans where id=p_plan;
  return jsonb_build_object('ok',true,'makeAgain',p_make_again,'tags',v_meal.tags,'revision',v_plan.revision);
end $$;

revoke all on function public.mealz_set_feedback(uuid,text,bigint,boolean),public.mealz_week_result(uuid,boolean),public.mealz_lock_week(uuid,date),public.mealz_save_week(uuid,date,bigint,uuid,jsonb),public.mealz_mutate_grocery(uuid,uuid,bigint,text,jsonb),
  public.mealz_bump_plan_revision(),public.mealz_child_revision() from public,anon;
grant execute on function public.mealz_set_feedback(uuid,text,bigint,boolean),public.mealz_week_result(uuid,boolean),public.mealz_lock_week(uuid,date),public.mealz_save_week(uuid,date,bigint,uuid,jsonb),public.mealz_mutate_grocery(uuid,uuid,bigint,text,jsonb),
  public.mealz_bump_plan_revision(),public.mealz_child_revision() to authenticated,service_role;
commit;
