Not legal advice: drafted from public sources, and to be checked by someone qualified before GetIt launches publicly.

# Processors and other services

Every outside party that receives personal data from GetIt, what it gets, where,
and the contract that covers it. Checked on 24 September 2026; the public site's
host (Netlify) and the optional Open Prices sharing checked on 4 October 2026
(version 18). A new service
that receives user data is added here, to `records-of-processing.md` and to
`src/legal/policy.ts` before it goes live.

## Supabase: database, authentication and logs

| | |
| --- | --- |
| Role | Processor (art. 28). |
| Receives | Everything the app stores: account, profile, plan and health data (see `records-of-processing.md`, activity 1), the tester allowlist, and request logs with IP addresses and user agents. |
| Where | Project region `eu-central-1`, Frankfurt, Germany, which hosts "your project's primary Postgres database, Auth service, and Storage objects" ([Supabase GDPR guide](https://supabase.com/docs/guides/security/gdpr-compliance)). API requests pass through Cloudflare's network first: the API gateway logs carry `cf_connecting_ip` and Cloudflare geolocation fields ([log field reference](https://supabase.com/docs/guides/observability/log-field-reference)). |
| Plan | Free. No automatic backups, log retention 1 day, project paused after a week without activity ([pricing](https://supabase.com/pricing)). |
| Contracting entity | Supabase Pte. Ltd. (Singapore), per the DPA. |
| DPA | [Data Processing Addendum](https://supabase.com/legal/dpa), Version 1, 1 August 2026. It "supplements and forms part of the Supabase Terms of Service", and the Terms say "The Parties agree to comply with the Data Processing Addendum, which is incorporated into this Agreement" ([Terms](https://supabase.com/terms), section 7(b)). |
| How it is accepted | By accepting Supabase's Terms of Service when creating the organisation. The DPA adds that "acceptance of the Agreement shall have the same effect as signing the SCCs". Neither the DPA nor the Terms limit it to paid plans, so it applies to the free plan as well. There is no separate signature step described on Supabase's public pages; if a countersigned copy is wanted for the file, ask Supabase support. |
| Breach notice to GetIt | "without undue delay, and where feasible, within forty-eight (48) hours" (DPA). |
| Sub-processor changes | At least 30 days' notice; objection within 5 days of notice (DPA). Subscribe to updates on the [sub-processor page](https://supabase.com/legal/customer-resources/subprocessor-list). |
| End of contract | Data can be requested back within 30 days, after which Supabase deletes all copies (DPA). |
| Transfers | Standard Contractual Clauses are part of the DPA (Schedule 2). Supabase publishes a [transfer impact assessment](https://supabase.com/downloads/docs/Supabase+TIA+250314.pdf). |
| Certifications | SOC 2 and ISO 27001 reports are available only on the Team and Enterprise plans ([pricing](https://supabase.com/pricing)). |

### Supabase sub-processors

From the [list dated 1 June 2026](https://supabase.com/legal/subprocessor-list/June-1-2026.pdf). The list does not give locations. The ones that can touch a project's data or traffic:

| Sub-processor | Stated purpose | Relevance to GetIt |
| --- | --- | --- |
| Amazon Web Services, Inc. | Hosting | Runs the Frankfurt database (`eu-central-1` is an AWS region). |
| Cloudflare, Inc. | Hosting | Carries API traffic to the project (see the log fields above). |
| Google, LLC | Hosting | Listed; which services use it is not stated. |
| Fly.io, Inc. | Hosting | Listed; not known to host `eu-central-1` databases. |
| Vercel, Inc. | Hosting | Listed; most likely Supabase's own website and dashboard. |
| Upstash, Inc. | Serverless data hosting | Listed; use not stated. |
| Supabase, Inc. | Support services | Staff who may access a project when handling support. |
| Functional Software, Inc. (Sentry) | Error monitoring | Errors in Supabase's own services, which may include request details. |
| Braintrust Data, Inc. | Monitoring and tracing | Listed; likely Supabase's own AI features. |
| OpenAI, LLC | Natural language processing | Supabase's AI assistant in the dashboard. Do not paste user data into the dashboard assistant. |
| Latacora, LLC | Managed security service | Security operations. |

The remaining entries (Postmark, FrontApp, HubSpot, Notion, Slack, PandaDoc, Atlassian, Clay, Clazar, ConfigCat, GitHub, Hex, Sublime Security) are described as communication with, or services for, Supabase's own customers ("Authorized Users"), not GetIt's users.

## Email delivery for sign-up and password reset: not chosen yet

Supabase's built-in email service "will refuse to deliver messages to addresses
that are not part of the project's team", is limited to 2 messages an hour, and
is "intended for ... non-production use" ([Supabase SMTP guide](https://supabase.com/docs/guides/auth/auth-smtp)).
Testers therefore cannot receive their confirmation email until a custom SMTP
provider is configured. That provider becomes a processor: it receives each
user's email address and the confirmation or reset link.

Supabase names Resend, AWS SES, Postmark, Twilio SendGrid, ZeptoMail and Brevo.
When choosing, prefer one that sends from an EU region and offers a DPA that
applies without negotiation; record here its name, the DPA link, how it was
accepted, the region, and its log retention. Then add it to the policy's
"Where your data is kept" section by name.

## Netlify: the public privacy and deletion pages

The pages built by `npm run build:site` (`site/`) are published with Netlify
(a manual upload with Netlify Drop, no Git connection and no build on Netlify).

| | |
| --- | --- |
| Role | Processor for the site's visitors (art. 28). Netlify's DPA covers the personal data a customer's site processes, listing IP address among the data categories ([Netlify DPA](https://www.netlify.com/pdf/netlify-dpa.pdf), Exhibit 1). |
| Receives | IP address and request details of each visitor. Not the email or password typed on the deletion page: `site/delete.ts` sends those from the browser straight to Supabase. |
| Where | Netlify's network, the location nearest to the visitor; Netlify, Inc. is a US company and its sub-processors are mostly in the US ([sub-processors](https://www.netlify.com/legal/subprocessors/)). |
| DPA | [Netlify Data Processing Agreement](https://www.netlify.com/pdf/netlify-dpa.pdf), last updated 9 June 2026. |
| How it is accepted | Automatically: the DPA "forms part of the Enterprise Master Subscription Agreement and the Self-Serve Subscription Agreement", and Netlify's [GDPR page](https://www.netlify.com/gdpr-ccpa/) says it "is incorporated by reference in Netlify's terms and conditions". |
| Breach notice to GetIt | "without undue delay, but in any event within forty-eight (48) hours" (DPA 10.1). |
| Sub-processor changes | At least 30 days' notice before a new one may process data (DPA 6.2); subscribe to the RSS feed on the [sub-processor page](https://www.netlify.com/legal/subprocessors/). |
| Transfers | The EU-US Data Privacy Framework; if it falls away, the EU Standard Contractual Clauses in the DPA apply (DPA section 14). |
| Settings to keep | No Netlify Analytics, no forms, no functions, no identity, no snippet injection, no extra scripts. The site sets no cookies. |

## Google: Play distribution, Play Console and Google Groups

Google is not a processor of the data users enter in GetIt: the app sends
nothing to Google. Google receives, under its own terms and as its own
controller:

- install, update and store data about people who download GetIt from Play;
- the testers' addresses, through the Google Group or email list attached to the closed test;
- the answers in Play Console (Data safety, App access with the reviewer account's credentials).

Nothing to sign. Keep the Data safety form true to `store/play-console-answers.md`.

## Contact mailbox

The address in `VITE_CONTACT_EMAIL` receives data requests, which can include
health details. If it is a business mailbox (for example Google Workspace or a
paid Proton plan), accept the provider's DPA and record it here. A free consumer
mailbox has no DPA; use it only until a business mailbox is set up.

## Open Food Facts and Open Prices: product and price lookups, and optional price sharing

Not processors: independent controllers of their own public services
(openfoodfacts.org, prices.openfoodfacts.org), run by Open Food Facts, a French
non-profit ([privacy policy](https://world.openfoodfacts.org/privacy)).

- Lookups (always, when the person searches, scans or opens a product): the search words or barcode go from the
  device straight to them, with the IP address and device type any website sees. No account, name or health data.
- Price sharing (v18, PRICE-05, off by default, per price, on the person's tap): the person's Open Food Facts user
  name and password go once to `POST /api/v1/auth` (the password is never kept; the token is kept in Android's secure
  storage, or a browser tab's session storage, and forgotten on sign-out). For each shared price: the photo of the
  price tag or receipt (resized and re-encoded on the device, which drops its EXIF data such as GPS position), the
  barcode, price, currency, date, offer flag and normal price, the shop's OpenStreetMap id, and the app's name
  (`app_name=GetIt`). Open Prices publishes these under the ODbL with the person's Open Food Facts user name; Open Food
  Facts is the controller of the publication. GetIt keeps on the device only which of its prices were shared (the
  Open Prices id) and the last place picked per shop. Code: `src/lib/open-prices-*.ts`, `src/sections/SharePrice.tsx`.
- Adding an unknown product (v19, PROD-05, off by default, per product, on the person's tap after ticking "Also add it
  to Open Food Facts"): a form POST to `world.openfoodfacts.org/cgi/product_jqm2.pl` with the barcode, the name and
  brand typed, the figures per 100 g or 100 ml (and any vitamins and minerals typed), `app_name=GetIt`,
  `app_version=19`, a random `app_uuid` per GetIt account and device (not derived from the account; kept in the
  device's database) and the person's own Open Food Facts `user_id` and `password` (typed each time, never stored;
  the v18 Open Prices token does not work for Open Food Facts writes); then, if a photo of the nutrition table was
  taken, `cgi/product_image_upload.pl` with the same credentials and the photo (resized and re-encoded on the device,
  which drops EXIF). Open Food Facts publishes it (ODbL, photo CC BY-SA) with the person's user name and is the
  controller of the publication. Code: `src/lib/products-write-rules.ts`, `src/ui/FoodOffShare.tsx`.

## OpenStreetMap search (Nominatim): finding a shop for a shared price

Not a processor: the OpenStreetMap Foundation (UK) runs nominatim.openstreetmap.org as its own service
([privacy policy](https://osmfoundation.org/wiki/Privacy_Policy)). Used only while sharing a price, only when the
person taps "Search OpenStreetMap", one request per tap, at most one a second, cached, with an identifying
User-Agent on the phone and the page's Referer in a browser, as its
[usage policy](https://operations.osmfoundation.org/policies/nominatim/) asks. It receives the shop name and town
typed, and the IP address. The UK has an adequacy decision.

## Not processors

- GitHub: builds the app from the repository and stores the build secrets. No user data passes through it. If the web client is ever served from GitHub Pages, GitHub becomes a host for visitor IP addresses and must be added here.
- Fonts: bundled into the app (`@fontsource`), so no request goes to Google Fonts.

## What the developer must still do

Before the closed test:

- [ ] Configure custom SMTP in the Supabase project's Authentication settings ([guide](https://supabase.com/docs/guides/auth/auth-smtp)) with an EU-region provider, accept its DPA, and fill in the email delivery section above. Without this, testers never get their confirmation email.
- [ ] Supabase DPA: nothing to sign, it applies through the Terms accepted when the organisation was created. Save a PDF of the current DPA (Version 1, 1 August 2026) and of the sub-processor list, dated, with these records, so you can show which terms applied.
- [ ] Subscribe to Supabase sub-processor updates on the [sub-processor page](https://supabase.com/legal/customer-resources/subprocessor-list).
- [ ] Authentication → Audit logs: turn off "Write audit logs to the database" ([Supabase audit logs](https://supabase.com/docs/guides/auth/audit-logs)), or keep it on and add the purge described in `retention.md`. The policy states the one-day log retention, which is only true with this off.
- [ ] Turn on two-factor sign-in for the Supabase, Netlify, Google (Play Console) and GitHub accounts, and the contact mailbox.
- [ ] Save a PDF of the Netlify DPA (last updated 9 June 2026) and of its sub-processor list with the records.
- [ ] Netlify site settings: no analytics, forms, functions or snippet injection (see the Netlify section).

Before opening to the public:

- [ ] Backups. Either move to Supabase Pro (daily backups kept 7 days, log retention 7 days), or run a weekly `supabase db dump`, encrypt it, and keep at most two copies in the EU. Update `retention.md` and the policy's backup sentence either way.
- [ ] Move the contact address to a business mailbox with a DPA.
- [ ] A purge for soft-deleted rows (see `retention.md`), designed with the sync layer so a device that was offline cannot bring purged rows back.
- [ ] Revisit `dpia-screening.md` if the number of users grows past a few hundred, or if managed profiles, AI features or any sharing are added.
