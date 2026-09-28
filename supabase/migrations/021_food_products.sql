-- GetIt 021: supermarket products as foods.
--
-- A food can now be a product from Open Food Facts, found by search or by
-- scanning its barcode. It is added to the person's own foods (owner_id is
-- them), so the row-level security from 012 already covers it: your own
-- foods are yours alone, the shared catalogue stays read-only. No policy
-- changes here.
--
--  * barcode: the product's EAN/UPC as digits, 8 to 14 of them. The app
--    checks the check digit; the database only checks the shape.
--  * brand, stores (the shops Open Food Facts lists, at most 20), image_url
--    (Open Food Facts' picture, https only).
--  * source already exists (003: 'catalogue' by default, 'import' for the
--    Excel import); a product is 'off'. source_ref is the product's code
--    there, kept apart from barcode so another source can be added later.
--  * One live food per barcode per person, so scanning the same pack twice
--    finds the food instead of adding a second. Deleted rows are left out of
--    that rule: the app brings a deleted one back rather than making another,
--    and a deleted row must never block it.
--
-- Order: apply this before shipping the build that scans. A build that has
-- the feature, run against a database without these columns, keeps a
-- scanned food on the device and waiting to be sent (PostgREST refuses the
-- unknown columns, which the sync retries); it is sent once this is applied.

alter table public.food
  add column if not exists barcode text,
  add column if not exists brand text,
  add column if not exists stores text[],
  add column if not exists source_ref text,
  add column if not exists image_url text;

alter table public.food drop constraint if exists food_barcode_check;
alter table public.food add constraint food_barcode_check
  check (barcode is null or barcode ~ '^[0-9]{8,14}$');
alter table public.food drop constraint if exists food_brand_check;
alter table public.food add constraint food_brand_check
  check (brand is null or length(brand) <= 120);
alter table public.food drop constraint if exists food_stores_check;
alter table public.food add constraint food_stores_check
  check (stores is null or (cardinality(stores) <= 20 and array_position(stores, null) is null));
alter table public.food drop constraint if exists food_source_ref_check;
alter table public.food add constraint food_source_ref_check
  check (source_ref is null or length(source_ref) <= 64);
alter table public.food drop constraint if exists food_image_url_check;
alter table public.food add constraint food_image_url_check
  check (image_url is null or (image_url like 'https://%' and length(image_url) <= 500));
create unique index if not exists food_owner_barcode_idx
  on public.food (owner_id, barcode)
  where barcode is not null and deleted_at is null;

-- updated_at and its trigger already exist for food (003 and 011); this only
-- makes sure, for a database built another way.
alter table public.food add column if not exists updated_at timestamptz not null default now();
drop trigger if exists food_touch on public.food;
create trigger food_touch before update on public.food
  for each row execute function touch_updated_at();
