# NOTES-S1 — shop links (v21)

Task: offers sheet in the Shop ⋮, a one-line offers link when the list is filtered to one shop, "Search at <shop>" in an item's ⋮ and on product/food pages, `searchUrl()` beside `offersUrl()`, a monthly link check (script + GitHub workflow), requirement rows PRICE-07/08/09 (R9) and one policy sentence.

## Log
- Started from main 0.20.0 (1148f5c). Read the task, the house rules, shops-rules.ts, Stores.tsx, ShopList.tsx, shop-ui.tsx, ProductSearch.tsx, FoodUnits.tsx.
- Researched each chain's offers page and search URL (5 Oct 2026), see the table below. Only the address shape was learnt: status codes, page titles, the site's own search form, its schema.org SearchAction, or the route in its own scripts. No page content kept.
- shops-rules.ts: `LINKS` (offers + search per country and chain) replaces `OFFERS`; `shopLinks`, `offersUrl`, `searchWords`, `searchUrl`, `linkShops`; Aldi Süd added to the German chains. Node check `shoplinks`.
- UI: src/sections/ShopLinks.tsx (offers sheet hook, search menu lines, links sheet, offers line), src/ui/ShopNameLinks.tsx (shop names on product/food pages search that shop).
- scripts/check-shop-links.mjs + .github/workflows/shop-links.yml. Run here: 56 links, 42 fine, 14 warnings (bot protection or robots.txt), 0 broken.
- requirements.md: R9 source row, PRICE-07/08/09 Done (v21). policy.ts: one sentence in the supermarket paragraph.
- Harness (scratchpad/harness-s1, port 5522, deleted after) at 360 px light and dark: screenshots in scratchpad/shots21/s1.

## The chain table (checked 5 October 2026)
`{q}` = the item's name, URL-encoded.

| Country | Chain | Offers | Search | Note |
|---|---|---|---|---|
| NL | Albert Heijn | ah.nl/bonus | ah.nl/zoeken?query={q} | site blocks robots (Akamai); search shape from search-engine index |
| NL | Jumbo | jumbo.com/aanbiedingen/nu (was /aanbiedingen, redirects) | jumbo.com/producten/?searchType=keyword&searchTerms={q} | schema.org SearchAction |
| NL | Lidl | lidl.nl/c/aanbiedingen/a10008785 | lidl.nl/q/search?q={q} | |
| NL | Aldi | aldi.nl/aanbiedingen.html | aldi.nl/zoeken.html?query={q} | param read by its own script |
| NL | Plus (and Coop) | plus.nl/aanbiedingen | plus.nl/zoekresultaten?SearchTerm={q} | OutSystems screen input SearchTerm |
| NL | Dirk | dirk.nl/aanbiedingen | dirk.nl/zoeken/producten/{q} | route in its own script |
| NL | DekaMarkt | dekamarkt.nl/aanbiedingen | dekamarkt.nl/zoeken/{q} | route in its own script |
| NL | Hoogvliet | hoogvliet.nl/aanbiedingen (moved from hoogvliet.com) | hoogvliet.nl/search/{q} | |
| NL | Spar | spar.nl/aanbiedingen/ | spar.nl/zoek/?fq={q} | site's own search form |
| NL | Vomar | vomar.nl/folders | vomar.nl/zoeken?search={q} | route in its own script |
| NL | Poiesz | webwinkel.poiesz-supermarkten.nl/aanbiedingen | …/boodschappen/zoeken?query={q} | route in its own script |
| NL | Picnic | none | none | app only |
| DE | Edeka | edeka.de/angebote/ (moved from /eh/angebote.jsp) | none | product search could not be confirmed (bot check) |
| DE | Rewe | rewe.de/angebote/ | rewe.de/shop/productList?search={q} | 403 to robots; shape from index |
| DE | Lidl | lidl.de/c/online-prospekte/s10005610 | lidl.de/q/search?q={q} | |
| DE | Aldi (Nord) | aldi-nord.de/angebote.html | aldi-nord.de/suchergebnisse.html?query={q} | |
| DE | Aldi Süd (new) | aldi-sued.de/angebote | none | search could not be confirmed (robots disallowed, bot check) |
| DE | Kaufland | filiale.kaufland.de/angebote/uebersicht.html | filiale.kaufland.de/suche.html?q={q} | site's own form |
| DE | Penny | penny.de/angebote | none | site has no product search |
| DE | Netto | netto-online.de/filialangebote (was /angebote) | netto-online.de/INTERSHOP/…/ViewMMPParametricSearch-SimpleOfferSearch?SearchTerm={q} | shape from index |
| DE | Norma | norma-online.de/de/angebote/ | norma-online.de/de/suchergebnis?q={q} | its own search script |
| DE | Globus | globus.de/angebote (asks which hall) | globus.de/searchdetail.php?query={q} | its own search script |
| BE | Colruyt | colruyt.be/nl/acties | colruyt.be/nl/producten?searchTerm={q} | |
| BE | Delhaize | delhaize.be/nl/Promolandingpage | delhaize.be/nl/shop/search?q={q} | schema.org SearchAction |
| BE | Carrefour | carrefour.be/nl/al-onze-promoties | carrefour.be/nl/search?q={q} | Cloudflare; checked with one page visit |
| BE | Lidl | lidl.be/c/nl-BE/acties-deze-week/a10082242 | lidl.be/q/nl-BE/search?q={q} | |
| BE | Aldi | aldi.be/aanbiedingen.html (old /nl/onze-aanbiedingen.html was 404) | aldi.be/zoekresultaten.html?query={q} | param read by its own script |
| BE | Albert Heijn | ah.be/bonus | ah.be/zoeken?query={q} | same site software as ah.nl |
| BE | Intermarché | intermarche.be/nl/folders/ | intermarche.be/nl/?s={q} | site search (offers, folders; no web shop) |
| BE | Spar | spar.be/promoties | none | no site search |
| BE | Okay | okay.be/nl/promos/promoties | none | bot check (GeeTest); search could not be confirmed |
| BE | Jumbo | jumbo.com/nl-be/aanbiedingen | none | no Belgian product search; no Dutch one instead (different range) |

Drugstores (Kruidvat, Etos, dm, Rossmann): not added. The app does not offer them as shops (CHAINS), and their sites turn robots away so nothing could be confirmed.

## Decisions
- A chain the person's country has keeps its own pages even where one is missing (Jumbo in Belgium gets no Dutch search); a chain the country lacks falls back to a neighbour's (Dirk kept by someone in Germany).
- The words searched: the item's name without amounts, pack sizes or brackets (`searchWords`), at most 60 characters.
- Item ⋮: up to three "Search at X ↗" (the item's or the filter's shop first), then "Other shops…" (sheet: all the person's shops, then the country's other chains). With no kept shop that has a search: one "Search at a shop…".
- "Offers this week…" is in the ⋮ of all three Shop tabs (it is the page's one ⋮). Stores now always has a ⋮ (before, only with a shop kept).
- Product and food pages: the "Sold at"/"Shops" names become links to that shop's search (no new control).
- The link check respects robots.txt (the owner's no-scraping stance): such pages are warnings, as are 403/429. 404/410/DNS fail. Node needs `--max-http-header-size=65536` (Lidl Belgium sends big headers).
- Default Shop surface unchanged: 13 tappable things above the fold at 360 px on main and on this branch; filtered to one shop it is 14 (the one offers line).

## Merge notes
- Files: src/lib/shops-rules.ts, src/sections/ShopLinks.tsx (new), src/sections/shop-links.css (new), src/sections/ShopList.tsx, src/sections/Stock.tsx, src/sections/Stores.tsx, src/ui/ShopNameLinks.tsx (new), src/ui/shop-name-links.css (new), src/ui/ProductSearch.tsx, src/ui/FoodUnits.tsx, src/test/shoplinks.check.mjs (new), src/test/price.check.mjs (one expectation), src/test/README.md, package.json (check loop: shoplinks), scripts/check-shop-links.mjs (new), .github/workflows/shop-links.yml (new), docs/requirements.md, src/legal/policy.ts (one sentence).
- Expected conflicts with R1's rename: policy.ts (the supermarket paragraph; keep both: R1's GetIt→Visuma and my added last sentence), possibly ShopList/Stores/Stock if R1 renames strings there; requirements.md source table (R8/R9 rows).
- POLICY_VERSION not bumped (a clarification); R1 may bump it anyway.
