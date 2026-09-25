begin;

alter table public.grocery_items
  add column if not exists needed_this_week boolean not null default false;

-- Mirror the shopping-facing normalization for the seven legacy salt/pepper
-- names. Include generated rows with null source_key in the identity check:
-- those predate source keys, and deleted ones must never be resurrected.
with raw as (
  select p.id as plan_id, i.id as row_id, false as existing,
         i.name, i.unit, i.quantity, i.category, null::text as source_key
  from public.weekly_plans p
  join public.meals m on m.weekly_plan_id = p.id
  join public.ingredients i on i.meal_id = m.id
  where p.status = 'active' and not coalesce(i.optional, false)
  union all
  select p.id, g.id, true, g.name, g.unit, g.quantity, g.category, g.source_key
  from public.weekly_plans p
  join public.grocery_items g on g.weekly_plan_id = p.id
  where p.status = 'active' and g.source = 'generated'
), cleaned as (
  select raw.*,
         trim(regexp_replace(
           regexp_replace(
             regexp_replace(
               regexp_replace(lower(trim(name)), '\([^)]*\)', ' ', 'g'),
               ',.*$', ' '),
             '\mfor (serving|garnish)\M.*$', ' '),
           '[^a-z0-9''-]+', ' ', 'g')) as words,
         regexp_replace(lower(trim(coalesce(unit, ''))), '\.$', '') as raw_unit
  from raw
), names as (
  select c.*,
         regexp_replace(
           coalesce(string_agg(word, ' ' order by position) filter (
             where word not in (
               'chopped','diced','minced','sliced','grated','shredded','peeled','seeded',
               'cored','cubed','julienned','crushed','drained','rinsed','thawed','softened',
               'melted','divided','finely','roughly','thinly','coarsely','fresh','freshly'
             )), ''), '(salt|pepper)s$', '\1') as shopping_name
  from cleaned c
  left join lateral regexp_split_to_table(c.words, ' +') with ordinality as token(word, position) on true
  group by c.plan_id, c.row_id, c.existing, c.name, c.unit, c.quantity,
           c.category, c.source_key, c.words, c.raw_unit
), units as (
  select n.*,
         case
           when raw_unit in ('teaspoon','teaspoons','tsp') then 'tsp'
           when raw_unit in ('tablespoon','tablespoons','tbsp','tbsps') then 'tbsp'
           when raw_unit in ('cup','cups') then 'cup'
           when raw_unit in ('ounce','ounces','oz') then 'oz'
           when raw_unit in ('pound','pounds','lb','lbs') then 'lb'
           when raw_unit in ('whole','each','count','piece','pieces','small','medium','large') then 'whole'
           when raw_unit in ('clove','cloves') then 'clove'
           when raw_unit in ('bulb','bulbs','head','heads') then 'bulb'
           else raw_unit
         end as shopping_unit
  from names n
), keyed as (
  select u.*,
         case
           when shopping_unit in ('tsp','tbsp','cup') then 'volume'
           when shopping_unit in ('oz','lb') then 'weight'
           when shopping_unit = 'whole' then 'count'
           else coalesce(nullif(shopping_unit, ''), 'unspecified')
         end as family
  from units u
), requirements as (
  select k.plan_id, k.shopping_name, k.family,
         k.shopping_name || '::' || k.family as generated_key,
         case when count(*) filter (where quantity is null) > 0 then null
              else sum(quantity::double precision * case shopping_unit
                when 'tbsp' then 3 when 'cup' then 48 when 'lb' then 16 else 1 end)
         end as base_quantity,
         (array_agg(coalesce(category, 'Other') order by
           case when coalesce(category, 'Other') in ('Other', 'Misc') then 1 else 0 end,
           row_id))[1] as category
  from keyed k
  where not existing and shopping_name in (
    'salt','table salt','kosher salt','sea salt',
    'pepper','black pepper','ground black pepper'
  )
  group by plan_id, shopping_name, family
), absent as (
  select r.* from requirements r
  where not exists (
    select 1 from keyed g
    where g.existing and g.plan_id = r.plan_id
      and coalesce(nullif(g.source_key, ''), g.shopping_name || '::' || g.family) = r.generated_key
  )
), amounts as (
  select a.*,
         case
           when base_quantity is null then null
           when family = 'volume' and base_quantity >= 48 then floor(base_quantity / 48 * 100 + 0.5) / 100
           when family = 'volume' and base_quantity >= 3 then floor(base_quantity / 3 * 100 + 0.5) / 100
           when family = 'weight' and base_quantity >= 16 then floor(base_quantity / 16 * 100 + 0.5) / 100
           else floor(base_quantity * 100 + 0.5) / 100
         end as shopping_quantity,
         case
           when base_quantity is null then nullif(family, 'unspecified')
           when family = 'volume' and base_quantity >= 48 then 'cup'
           when family = 'volume' and base_quantity >= 3 then 'tbsp'
           when family = 'volume' then 'tsp'
           when family = 'weight' and base_quantity >= 16 then 'lb'
           when family = 'weight' then 'oz'
           when family = 'count' then 'whole'
           when family = 'unspecified' then null
           else family
         end as display_unit
  from absent a
)
insert into public.grocery_items
  (weekly_plan_id, name, quantity, unit, category, source, source_key, needed_this_week)
select plan_id, shopping_name, shopping_quantity, display_unit,
       category, 'generated', generated_key, false
from amounts
on conflict do nothing;

commit;
