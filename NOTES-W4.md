# NOTES-W4 (v18, branch v18/w4)

Running log of W4's work: shop and prices, legal and store texts.

## Log
- CALM-10: shop-ui `Sheet` closes on Back through useBackClose (item, price, scan, recipes, new list, stores rename sheets all use it).
- UNIT-02: list item sheet uses AmountInput (food's choices) when linked; rules listAmountChoices/amountToField/fieldToAmount in shopping-rules.ts, checks in shopping.check.mjs.
- SHOP-22: rail-actions tick → shopping.offerStockAfterTrip → Undo bar's new offerAction('…', 'Put in stock') (Undo.tsx: small additive export). No sheet.
- PRICE-05: open-prices-rules.ts (pure, openprices.check.mjs), open-prices-account.ts (OFF sign-in; token SecureStorage/sessionStorage; opt-in meta 'openprices:on'; reset hook), open-prices-share.ts (places search, Nominatim 1/s + cache, shrinkPhoto, uploadProof, postPrice), sections/SharePrice.tsx (flow in the price sheet), ShoppingSettings OpenPricesSharing row.
- GEN-52 Stock: cherry-picked W1's useSelection commit (e133c9a, without NOTES-W1). Stock rows: hold → select; ⋮ Select; bar: Move to…, Best before…, Export…, Remove (Undo). stock.ts setStockDetailsMany/removeStockMany; stock-rules bulkSaid/stockExportRows (+checks).
- G2#16: src/legal/notice-rules.ts (+policynotice.check.mjs), src/legal/PolicyNotice.tsx mounted once in App.tsx (after WhatMoved). Read stored as user_metadata.policy_read + local meta 'policy:read'; privacy_version (consent record) never overwritten.
- Part 2: policy.ts rewritten (POLICY_VERSION 2026-10-05: lead sets it to the day the v18 pages go live, any day after 2026-10-04), ANDROID_PERMISSIONS from the merged manifest; site/delete.ts lists everything deleted + what stays with a household; site/privacy.ts and screens/Privacy.tsx show the date in words; docs/privacy/* (processors: Netlify replaces Cloudflare Pages, Open Prices sharing, Nominatim; records; retention; data-requests SQL; DPIA review row); docs/android-release.md: Netlify Drop steps; store/play-console-answers.md and listing.json for v18.
- Harness (scratchpad/harness-w4, port 5404, every outside request mocked or aborted; nothing reached Open Prices/OSM/OFF) walked: policy notice, item sheets, sharing (off, not signed in, offline, refused token, full share), settings sign-in, Stock selection and bulk actions, trip tick offer on Today, Back on every shop sheet; the built site's privacy and delete pages. Shots in scratchpad/shots18/w4. Harness deleted.
- Final: npx tsc -b, npm run check, npx vite build pass.
