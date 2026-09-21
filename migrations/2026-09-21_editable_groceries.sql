begin;

alter table public.grocery_items
  add column if not exists source text not null default 'generated',
  add column if not exists source_key text,
  add column if not exists user_modified boolean not null default false,
  add column if not exists deleted boolean not null default false,
  add column if not exists updated_at timestamptz not null default now();

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.grocery_items'::regclass
      and conname = 'grocery_items_source_check'
  ) then
    alter table public.grocery_items
      add constraint grocery_items_source_check
      check (source in ('generated', 'manual'));
  end if;
end
$$;

create unique index if not exists grocery_items_generated_source_key_unique
  on public.grocery_items (weekly_plan_id, source_key)
  where source = 'generated' and source_key is not null;

create index if not exists grocery_items_plan_visible_idx
  on public.grocery_items (weekly_plan_id, deleted, category, name);

commit;
