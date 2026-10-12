-- Local prototype baseline; do not apply this file to production.
    create table if not exists public.weekly_plans (
      id uuid primary key default gen_random_uuid(),
      owner_user_id uuid,
      week_start date,
      status text,
      notes text,
      household_size integer,
      equipment text[],
      cooking_days text[],
      use_up text,
      updated_at timestamptz not null default now(),
      created_at timestamptz not null default now()
    );
    create table if not exists public.meals (
      id uuid primary key default gen_random_uuid(),
      weekly_plan_id uuid references public.weekly_plans(id) on delete cascade,
      meal_key text, day text, title text not null default '', description text,
      emoji text, servings integer, total_minutes integer, difficulty text,
      tags text[], kid_note text, sort_order integer,
      created_at timestamptz not null default now()
    );
    create table if not exists public.ingredients (
      id uuid primary key default gen_random_uuid(),
      meal_id uuid references public.meals(id) on delete cascade,
      name text not null default '',
      quantity numeric,
      unit text,
      category text default 'Other',
      optional boolean not null default false
    );
    create table if not exists public.recipe_steps (
      id uuid primary key default gen_random_uuid(),
      meal_id uuid references public.meals(id) on delete cascade,
      step_number integer, instruction text not null default ''
    );
    create table if not exists public.grocery_items (
      id uuid primary key default gen_random_uuid(),
      weekly_plan_id uuid references public.weekly_plans(id) on delete cascade,
      name text not null default '',
      quantity numeric,
      unit text,
      category text not null default 'Other',
      checked boolean not null default false,
      created_at timestamptz not null default now()
    );
