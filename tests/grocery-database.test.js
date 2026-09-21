import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';

const migrationUrl=new URL('../migrations/20260921212102_editable_groceries_v0210.sql',import.meta.url);

test('editable grocery migration is idempotent and enforces generated source identity',async()=>{
  const db=new PGlite();
  await db.exec(`
    create table public.weekly_plans(id uuid primary key);
    create table public.grocery_items(
      id uuid primary key,
      weekly_plan_id uuid not null references public.weekly_plans(id) on delete cascade,
      name text not null,
      quantity numeric,
      unit text,
      category text not null default 'Other',
      checked boolean not null default false,
      created_at timestamptz not null default now()
    );
  `);
  const migration=await readFile(migrationUrl,'utf8');
  await db.exec(migration);
  await db.exec(migration);
  const plan='00000000-0000-0000-0000-000000000001';
  await db.query('insert into weekly_plans(id) values ($1)',[plan]);
  await db.query(`insert into grocery_items(id,weekly_plan_id,name,source_key) values
    ('00000000-0000-0000-0000-000000000002',$1,'tomato','tomato::count')`,[plan]);
  await assert.rejects(()=>db.query(`insert into grocery_items(id,weekly_plan_id,name,source_key) values
    ('00000000-0000-0000-0000-000000000003',$1,'tomatoes','tomato::count')`,[plan]));
  await db.query(`insert into grocery_items(id,weekly_plan_id,name,source,source_key,user_modified) values
    ('00000000-0000-0000-0000-000000000004',$1,'tomatoes','manual',null,true),
    ('00000000-0000-0000-0000-000000000005',$1,'tomatoes','manual',null,true)`,[plan]);
  const result=await db.query('select source,user_modified,deleted from grocery_items order by id');
  assert.deepEqual(result.rows,[
    {source:'generated',user_modified:false,deleted:false},
    {source:'manual',user_modified:true,deleted:false},
    {source:'manual',user_modified:true,deleted:false}
  ]);
  await db.close();
});
