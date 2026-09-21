-- GetIt 003: nutrition, shopping, training, health
-- Catalogue tables are shared reference data: owner_id null = global, readable by all.

create table if not exists food (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references auth.users(id) on delete cascade,  -- null = shared catalogue
  name text not null,
  kcal numeric(7,2), carbs_g numeric(7,2), fiber_g numeric(7,2),
  fat_g numeric(7,2), protein_g numeric(7,2),
  state text not null default 'raw' check (state in ('raw','cooked','canned','dried','frozen')),
  cook_yield numeric(4,2),
  pack_size_g numeric(8,2), pack_label text,
  store_section text, shelf_days int, freezer_ok boolean,
  source text not null default 'catalogue',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create unique index if not exists food_global_name_idx on food(lower(name)) where owner_id is null;
create index if not exists food_name_trgm on food using gin (name gin_trgm_ops);

create table if not exists recipe (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references auth.users(id) on delete cascade,
  name text not null,
  role text check (role in ('breakfast','lunch','dinner','snack','shake','egg_meal','main','kwark')),
  portions_per_batch numeric(5,2) not null default 1,
  cook_minutes int, fridge_days int, freezer_ok boolean,
  steps text,
  kcal numeric(7,2), carbs_g numeric(7,2), fiber_g numeric(7,2),
  fat_g numeric(7,2), protein_g numeric(7,2),  -- as stated in source; live values are computed
  shared_with_partner boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table if not exists recipe_line (
  id uuid primary key default gen_random_uuid(),
  recipe_id uuid not null references recipe(id) on delete cascade,
  food_id uuid references food(id) on delete set null,
  raw_text text,
  grams_per_portion numeric(8,2),
  state text,
  note text,
  sort_order int not null default 0
);

create table if not exists meal_plan_slot (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profile(id) on delete cascade,
  slot_date date not null,
  slot text not null,
  recipe_id uuid references recipe(id) on delete set null,
  portion_multiplier numeric(4,2) not null default 1,
  status text not null default 'planned' check (status in ('planned','eaten','skipped')),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index if not exists meal_plan_day_idx on meal_plan_slot(profile_id, slot_date);

create table if not exists food_log (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profile(id) on delete cascade,
  log_date date not null,
  log_time time,
  food_id uuid references food(id) on delete set null,
  recipe_id uuid references recipe(id) on delete set null,
  grams numeric(8,2),
  portions numeric(5,2),
  planned boolean not null default true,
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index if not exists food_log_day_idx on food_log(profile_id, log_date);

-- ---------- shopping ------------------------------------------------------
create table if not exists store (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references auth.users(id) on delete cascade,
  name text not null, country text default 'NL',
  catalogue_source text, preferred boolean not null default false
);

create table if not exists store_product (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references store(id) on delete cascade,
  food_id uuid references food(id) on delete set null,
  product_name text not null,
  pack_size_g numeric(8,2), price numeric(8,2),
  valid_from date, valid_to date, link text
);

create table if not exists stock (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references household(id) on delete cascade,
  food_id uuid not null references food(id) on delete cascade,
  grams_on_hand numeric(9,2) not null default 0,
  updated_at timestamptz not null default now(),
  unique (household_id, food_id)
);

create table if not exists shopping_trip (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references household(id) on delete cascade,
  trip_date date,
  weekday int check (weekday between 0 and 6),
  covers_from date, covers_to date,
  store_id uuid references store(id) on delete set null,
  status text not null default 'planned' check (status in ('planned','shopping','done','skipped')),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table if not exists shopping_item (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references shopping_trip(id) on delete cascade,
  food_id uuid references food(id) on delete set null,
  manual_name text,
  needed_g numeric(9,2),
  from_stock_g numeric(9,2) not null default 0,
  packs_to_buy numeric(6,2),
  estimated_price numeric(8,2),
  checked boolean not null default false,
  sort_order int not null default 0
);

-- ---------- training ------------------------------------------------------
create table if not exists exercise (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references auth.users(id) on delete cascade,
  name text not null,
  type text check (type in ('push','pull','legs','core','mobility','cardio','full_body')),
  equipment text, notes text
);
create unique index if not exists exercise_global_name_idx on exercise(lower(name)) where owner_id is null;

create table if not exists workout (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references auth.users(id) on delete cascade,
  name text not null,
  weekday_pattern int[] default '{}',
  duration_min int,
  phase_id uuid references phase(id) on delete set null,
  deleted_at timestamptz
);

create table if not exists workout_line (
  id uuid primary key default gen_random_uuid(),
  workout_id uuid not null references workout(id) on delete cascade,
  exercise_id uuid references exercise(id) on delete set null,
  sets int, reps int, seconds int, rest_s int, tempo text,
  sort_order int not null default 0
);

create table if not exists workout_log (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profile(id) on delete cascade,
  log_date date not null,
  exercise_id uuid references exercise(id) on delete set null,
  workout_id uuid references workout(id) on delete set null,
  set_number int, reps_achieved int, load_kg numeric(6,2), seconds int,
  note text,
  created_at timestamptz not null default now()
);
create index if not exists workout_log_day_idx on workout_log(profile_id, log_date);

-- ---------- health, habits, supplements -----------------------------------
create table if not exists body_log (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profile(id) on delete cascade,
  log_date date not null,
  weight_kg numeric(5,2), waist_cm numeric(5,1), note text,
  unique (profile_id, log_date)
);

create table if not exists target (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profile(id) on delete cascade,
  from_date date not null,
  kcal numeric(7,1), protein_g numeric(6,1), fat_g numeric(6,1),
  carbs_g numeric(6,1), fiber_g numeric(6,1),
  reason text,
  unique (profile_id, from_date)
);

create table if not exists habit (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profile(id) on delete cascade,
  name text not null,
  schedule text not null default 'daily',
  sort_order int not null default 0,
  active boolean not null default true
);

create table if not exists habit_log (
  id uuid primary key default gen_random_uuid(),
  habit_id uuid not null references habit(id) on delete cascade,
  log_date date not null,
  done boolean not null default true,
  unique (habit_id, log_date)
);

create table if not exists supplement (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profile(id) on delete cascade,
  name text not null,
  dose_text text,
  time_slot text,
  active boolean not null default true,
  sort_order int not null default 0
);

create table if not exists supplement_log (
  id uuid primary key default gen_random_uuid(),
  supplement_id uuid not null references supplement(id) on delete cascade,
  log_date date not null,
  done boolean not null default true,
  unique (supplement_id, log_date)
);

create table if not exists sleep_log (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profile(id) on delete cascade,
  log_date date not null,
  went_to_bed time, woke_at time, hours numeric(4,2), quality int,
  unique (profile_id, log_date)
);
