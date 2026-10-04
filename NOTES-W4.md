# NOTES-W4 (v18, branch v18/w4)

Running log of W4's work: shop and prices, legal and store texts.

## Log
- CALM-10: shop-ui `Sheet` closes on Back through useBackClose (item, price, scan, recipes, new list, stores rename sheets all use it).
- UNIT-02: list item sheet uses AmountInput (food's choices) when linked; rules listAmountChoices/amountToField/fieldToAmount in shopping-rules.ts, checks in shopping.check.mjs.
- SHOP-22: rail-actions tick → shopping.offerStockAfterTrip → Undo bar's new offerAction('…', 'Put in stock') (Undo.tsx: small additive export). No sheet.
- PRICE-05: open-prices-rules.ts (pure, openprices.check.mjs), open-prices-account.ts (OFF sign-in; token SecureStorage/sessionStorage; opt-in meta 'openprices:on'; reset hook), open-prices-share.ts (places search, Nominatim 1/s + cache, shrinkPhoto, uploadProof, postPrice), sections/SharePrice.tsx (flow in the price sheet), ShoppingSettings OpenPricesSharing row.
- GEN-52 Stock: cherry-picked W1's useSelection commit (e133c9a, without NOTES-W1). Stock rows: hold → select; ⋮ Select; bar: Move to…, Best before…, Export…, Remove (Undo). stock.ts setStockDetailsMany/removeStockMany; stock-rules bulkSaid/stockExportRows (+checks).
- G2#16: src/legal/notice-rules.ts (+policynotice.check.mjs), src/legal/PolicyNotice.tsx mounted once in App.tsx (after WhatMoved). Read stored as user_metadata.policy_read + local meta 'policy:read'; privacy_version (consent record) never overwritten.
