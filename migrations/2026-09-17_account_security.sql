begin;

-- Apply after the household migration. Existing household data is preserved.
create table if not exists public.mealz_rate_limits (
  bucket_key text primary key,
  window_start timestamptz not null,
  hits integer not null
);
alter table public.mealz_rate_limits enable row level security;
revoke all on public.mealz_rate_limits from public, anon, authenticated;

create or replace function public.mealz_take_rate_limit(p_key text,p_limit integer,p_window_seconds integer)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare instant timestamptz := clock_timestamp(); counter public.mealz_rate_limits;
begin
  if p_key is null or length(p_key)>200 or p_limit<1 or p_limit>200 or p_window_seconds<1 or p_window_seconds>86400 then
    raise exception 'Invalid rate limit';
  end if;
  delete from public.mealz_rate_limits where window_start < instant - interval '1 day';
  insert into public.mealz_rate_limits as limits(bucket_key,window_start,hits)
  values(p_key,instant,1)
  on conflict(bucket_key) do update set
    hits=case when limits.window_start <= instant-make_interval(secs=>p_window_seconds) then 1 else least(limits.hits+1,p_limit+1) end,
    window_start=case when limits.window_start <= instant-make_interval(secs=>p_window_seconds) then instant else limits.window_start end
  returning * into counter;
  return jsonb_build_object('allowed',counter.hits<=p_limit,'retry_after',greatest(1,ceil(extract(epoch from counter.window_start+make_interval(secs=>p_window_seconds)-instant))));
end $$;
revoke all on function public.mealz_take_rate_limit(text,integer,integer) from public,anon,authenticated;
grant execute on function public.mealz_take_rate_limit(text,integer,integer) to service_role;

-- Atomic membership changes prevent partial households and concurrent double joins.
-- The server supplies the verified user ID; browsers cannot execute this function.
create or replace function public.mealz_manage_household(p_user_id uuid,p_action text,p_name text default null,p_hash text default null,p_hint text default null)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare member public.household_members; home public.households;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text,0));
  select * into member from public.household_members where user_id=p_user_id;
  if p_action in ('create','join') and member.user_id is not null then
    return jsonb_build_object('error','This account is already linked to a household.','status',409);
  end if;
  if p_hash is null or p_hash !~ '^[a-f0-9]{64}$' then raise exception 'Invalid code hash'; end if;
  if p_action='create' then
    if p_name is null or length(btrim(p_name))<1 or length(p_name)>60 then raise exception 'Invalid household name'; end if;
    insert into public.households(name,created_by,join_code_hash,join_code_hint)
    values(btrim(p_name),p_user_id,p_hash,p_hint) returning * into home;
    insert into public.household_members(household_id,user_id,role) values(home.id,p_user_id,'owner');
  elsif p_action='join' then
    select * into home from public.households where join_code_hash=p_hash for update;
    if home.id is null then return jsonb_build_object('error','That household code was not found.','status',404); end if;
    insert into public.household_members(household_id,user_id,role) values(home.id,p_user_id,'member');
  elsif p_action='rotate' then
    if member.role is distinct from 'owner' then return jsonb_build_object('error','Only the household owner can replace the invitation code.','status',403); end if;
    update public.households set join_code_hash=p_hash,join_code_hint=p_hint,updated_at=now() where id=member.household_id returning * into home;
  else
    return jsonb_build_object('error','Unknown household action.','status',400);
  end if;
  return jsonb_build_object('household',jsonb_build_object('id',home.id,'name',home.name),'role',case when p_action='join' then 'member' else 'owner' end);
end $$;
revoke all on function public.mealz_manage_household(uuid,text,text,text,text) from public,anon,authenticated;
grant execute on function public.mealz_manage_household(uuid,text,text,text,text) to service_role;

-- Explicit grants protect membership and invite hashes from direct browser writes.
revoke all on public.households,public.household_members from public,anon,authenticated;
grant select(id,name,join_code_hint,created_by,created_at,updated_at) on public.households to authenticated;
grant select on public.household_members to authenticated;

commit;
