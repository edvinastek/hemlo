# NOTES-K5 — calm Shop, and prices on the shopping list

Running log (newest last).

- Read preamble17, tasks17/k5, prices17, docs/calm.md, audit17 (A2/A5/A6, B Shop), v16 shots. Harness at
  scratchpad/harness-k5 (port 5305); before shots in shots17/k5/*-before.png.
- Before counts (360 px, chrome = tappable things on the first screen, nav included, list rows apart):
  List 21, Stock 22, Stores (no shops) 28, Stores (2 shops) 26, Settings → Shopping 20.
- Step 1: pure price-rules.ts (+ price.check.mjs, in the check loop and README), offersUrl in shops-rules.ts,
  Dexie 13 price_cache, open-prices.ts (fetch, X-User-Agent / User-Agent "GetIt/17 (app.getit.planner)", 10 a minute),
  prices.ts (device cache, background refresh, hook).
- Step 2: calm Shop. Shop.tsx: no subtitle, no round +, the title row carries the one ⋮ (each tab portals its items via
  TabMenu in shop-ui.tsx). List: scan icon in the add field (Add takes its place once typed), recently bought shows while
  the field has the focus, "From recipes" / "New list" / Export → ⋮, one summary line "N to get · €X + N unpriced" that
  opens to the rest (meals window, covered by stock, other shops, priced count), prices on rows (own "€", shared "≈ €"),
  price sheet (detail, quick add, own prices, attribution), item sheet stages aisle/shop/list/note/food in More options.
  Stock: one "Add to stock" field with scan in it; amount/unit/place/date/note after a food is picked; filter from 16
  items; grouping, "take from stock when meals are eaten" and Export → ⋮. Stores: 4 chains + More shops, no paragraphs,
  offers link per shop (official pages), Your aisles folded and only with a shop.
