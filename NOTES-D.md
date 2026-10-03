# Engineer D — shopping, stores, stock (running log)

## Done
- 028: shopping_entry.list/bought_at/done_until; stock.place/best_before/min_grams; shop_price (RLS, touch,
  one live per household+shop+item_key); household invite codes (hashed, 2 days, once, 10 tries an hour)
  with create/cancel/join/leave/remove RPCs; household_foods() also opens foods on the list and in prices.
- Types, Dexie 9 (shop_price), sync CHILDREN/NATURAL_KEYS/LIVE_ONLY/REFERENCES (+ sync check).
- shopping-rules.ts, shops-rules.ts, stock-rules additions; checks: shopping (new), stock (extended).
- shopping.ts (list, adds, ticks, basket, prices, recipes to list, trip task watcher), household.ts.
- Shop page: List / Stock / Stores; ShoppingSettings + HouseholdShare in More; App mounts watchShoppingTrip.
- STK-02: consumeForMeal handles one-food meals; consumeForLog for logged food (C1 to call).
- bundle: list, bought history and prices travel. stock.e2e updated. Screenshots in scratchpad/shots/d.

## Left
- Nothing for D. Lead: wire task tap (source 'shopping') to /shop in A1's TaskRow; C1 calls consumeForLog.
