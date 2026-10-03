# NOTES-K5 — calm Shop, and prices on the shopping list

Running log (newest last).

- Read preamble17, tasks17/k5, prices17, docs/calm.md, audit17 (A2/A5/A6, B Shop), v16 shots. Harness at
  scratchpad/harness-k5 (port 5305); before shots in shots17/k5/*-before.png.
- Before counts (360 px, chrome = tappable things on the first screen, nav included, list rows apart):
  List 21, Stock 22, Stores (no shops) 28, Stores (2 shops) 26, Settings → Shopping 20.
- Step 1: pure price-rules.ts (+ price.check.mjs, in the check loop and README), offersUrl in shops-rules.ts,
  Dexie 13 price_cache, open-prices.ts (fetch, X-User-Agent / User-Agent "GetIt/17 (app.getit.planner)", 10 a minute),
  prices.ts (device cache, background refresh, hook).
