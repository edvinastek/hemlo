# Engineer D — shopping, stores, stock (running log)

## Done
- 028 migration: shopping_entry.list/bought_at/done_until; stock.place/best_before/min_grams;
  shop_price table (RLS, touch, unique live per household+shop+item_key); household invite codes
  (private tables, create/cancel/join/leave/remove RPCs, hashed codes, 2 days, once, 10 tries an hour);
  household_foods() also opens foods on the list and in prices. Security suite: 169 checks pass locally.

## Left
- types, Dexie v9, sync (CHILDREN, NATURAL_KEYS, REFERENCES) for shop_price and new columns
- shopping-rules.ts (+check), shops-rules.ts, stock-rules additions (+check)
- shopping.ts (list, entries, ticks, stock, recent, recipes, trip task watcher)
- Shop.tsx List/Stock/Stores; ShoppingSettings; household invite UI
- STK-02 foods/ready meals; bundle export; e2e; screenshots; report
