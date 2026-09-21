-- GetIt 010: table privileges.
-- Row-level security decides WHICH rows a signed-in user sees; it does not
-- grant access to the table at all. Without these the app gets "permission
-- denied" on every query, whatever the policies say.
grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant select on all tables in schema public to anon;
grant usage, select on all sequences in schema public to authenticated;

-- Anything added later inherits the same.
alter default privileges in schema public
  grant select, insert, update, delete on tables to authenticated;
alter default privileges in schema public grant select on tables to anon;

-- The catalogue is reference data: readable by everyone, changed by no one.
revoke insert, update, delete on food, exercise, recipe, recipe_line, module from authenticated;
grant insert, update, delete on food, exercise, recipe, recipe_line to authenticated;  -- own rows only; RLS confines them
