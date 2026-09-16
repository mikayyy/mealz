begin;

-- v0.16.0 made owner_user_id mandatory. v0.16.1 moved ownership to households,
-- so these legacy columns must no longer block household-owned inserts.
alter table profiles alter column owner_user_id drop not null;
alter table weekly_plans alter column owner_user_id drop not null;

commit;
