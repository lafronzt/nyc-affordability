# Change log

Multi-file changes, newest first. Each entry gives the user-visible effect and how it was validated.

## 2026-10-04: Ads ready to switch on; README brought up to date

**User-visible changes**
- None while ads stay off (`ADS_ENABLED = false`). Built pages contain no ad markup, and the privacy page now says ads are turned off right now.

**Ads readiness**
- The 8 pages added since the ads decision now opt in with `ads` and have an in-article `<AdSlot>`, so all 212 built pages carry ads when the flag is on: `/plan/`, `/my-data/`, `/data/`, `/explore/`, and the 4 methodology pages. `/my-data/` no longer says "This page loads no ads".
- **CSP (`public/_headers`).** A build with ads on was loaded in Chromium under the production policy. AdSense's config fetch and ping, Google's ad-traffic-quality checks, and its timing beacon were all blocked. The policy now allows:
  - `connect-src`: `pagead2.googlesyndication.com`, `*.adtrafficquality.google`, `csi.gstatic.com`
  - `script-src`: `*.adtrafficquality.google`
  - `frame-src`: `*.googlesyndication.com`, `*.adtrafficquality.google`, `www.google.com`
  - `img-src`: `*.googlesyndication.com`, `*.g.doubleclick.net`, `*.adtrafficquality.google`

  Re-run on `/coop/`, `/rent/`, a guide, `/plan/`, `/my-data/` and `/methodology/corrections/` at 390px: **0 violations**. The slots come back "unfilled" because the site isn't approved and this is localhost.
- **Privacy page.** The ad wording follows the flag. It now also says plainly that the ad script runs on calculator pages and could technically read the page, that our code never passes it inputs, and that an ad blocker removes it without breaking anything.
- New `test/adsReady.test.ts` (45 checks):
  - Every page renders `<BaseLayout ads>` and has an `<AdSlot>`.
  - `ads.txt` matches the publisher ID.
  - The flag is a plain boolean.

  Mutation-checked: removing `ads` from `/plan/` fails it.

**README**
- Rewritten to match the code:
  - Pages table: every current route.
  - Legacy-domain behavior after 5a.
  - Module map: the engines, the assumptions registry, saved data.
  - Data and scheduled checks.
  - How to switch ads on.
  - Commands, including `npm test` and `npm run check-links`.
- Removed the stale "Calculator assumptions" section (it quoted a 6.30% rate) in favor of pointers to the registry, `/methodology/sources/`, and `/data/`.

**Validation**
- `npm test` 384/384; `npm run build` is clean, including `check-csp`, with ads off. The build with ads on also passes `check-csp`.

## 2026-10-04: Structured data: audit follow-ups (HowTo, Dataset, Place)

**User-visible changes** (search markup only; no visible page text changes)
- `/coop/`: removed the HowTo JSON-LD. Google retired HowTo rich results in 2023, so it was dead weight (Phase 0 audit §5). The FAQPage stays: each answer condenses the visible "How this works" text on the page.
- `/affordability-index/`: the Dataset markup said the license was `/terms/`, but the data is CC0, as `/data/` already says. It now gives the CC0 URL, `isAccessibleForFree`, and a `distribution` pointing at `/data/affordability-index.json` and `.csv` (audit §5: "add `distribution` once downloads exist").
- Neighborhood pages: the Article gains `about`, a `Place` (e.g. "Astoria, Queens, New York City") `containedInPlace` its borough, with the borough hub's URL where one exists (audit §5).

**Validation**
- `npm test` 337/337; `npm run build` is clean, including `check-csp`.
- Parsed the built JSON-LD:
  - `/coop/` has WebApplication and FAQPage, no HowTo.
  - The index Dataset has the CC0 license and two downloads, both present in `dist/data/`.
  - All 10 neighborhood pages name their borough and link the right hub.
## 2026-10-04: Content: Affordability Index update note matches how it's updated

**User-visible changes**
- `/affordability-index/` said "this site has no backend or scheduled job". Scheduled checks have existed since Phase 4c (the mortgage rate weekly, HPD's AMI chart monthly), so the note now says those exist and that nothing watches the index figures, because their sources publish reports and some block automated requests.
- "Exactly one snapshot so far" was hard-coded. It's now computed from the snapshot array, so it stays true once a second snapshot is added.

**Code**
- The `src/data/affordabilityIndex.ts` header says the same, notes that the array is the index history (append-only; the page and `/data/affordability-index` read every entry), and says to cite dated reports, never live dashboards.
- Plan: the Phase 4 "index history file" item is structurally done. New snapshots are blocked on dated citywide sources (StreetEasy blocks automated access; the Baruch/Zicklin PDF fails TLS from this environment; PropertyShark is a live dashboard and blocked).

**Validation**
- `npm test` 337/337; `npm run build` is clean, including `check-csp`. The built page reads "There is one snapshot so far (2026-08)".
## 2026-10-04: Data: default renter's insurance $15 → $18/month (ValuePenguin, September 2026)

**User-visible changes**
- The renter's insurance default on `/rent/`, `/compare/` and rent vs buy is now **$18/mo**: ValuePenguin's "Average Cost of Renters Insurance" (updated Sep 25, 2026) for New York, NY ($19 statewide), quoted for $30,000 of personal property, $100,000 of liability, and a $500 deductible. The old $15 default cited a ValuePenguin page that now returns 404; its replacement doesn't support $15.
- Effects: default `/rent/` move-in cash $7,800 → $7,806 (two months of reserve × $3); with DTI screening on, max rent falls $3. The rent vs buy guide's example moves: renter month one $4,015 → $4,018, renter portfolio $618,407 → $617,883, renting ahead by $229,039 → $228,514. Pre-built `/rent/<price>/` pages don't include insurance and don't change.
- `/rent/`'s hint and source note now say "about $18/mo" with the coverage it assumes, instead of "~$15–25". Listed on `/methodology/changelog/` as a data update.

**Code and tests**
- New `test/marketDefaults.test.ts` pins the value to its source (URL, effective date, last verified); it failed at $15 first, then passed.
- `/compare/`'s own renters-insurance input is now in the registry's `inputs`, so `test/defaultsParity.test.ts` catches it drifting (it was hard-coded to 15 without a check).
- Three rent goldens in `test/engines.test.ts` updated by exactly the $3 difference; `test/guideExamples.test.ts` listed the three guide figures, now updated.

**Validation**
- `npm test` 339/339; `npm run build` clean (including `check-csp`). Built-output diff against the base branch: exactly six files change (`/rent/`, `/compare/`, `/methodology/sources/`, `/data/assumptions.{csv,json}`, the rent vs buy guide).

## 2026-10-04: Content: guide contradictions, dead source links, monthly link check

**User-visible changes**
- **Two guides contradicted each other on co-op PMI.** `pmi-on-nyc-condos-explained` said "co-ops don't carry PMI in the same form"; `coop-vs-condo-nyc-costs` said PMI is modeled the same on both, which is what the co-op calculator does. Both now say: most boards require 20%+ down, so co-op buyers rarely face PMI; where less is allowed, expect mortgage insurance or a higher rate, and the co-op calculator models it as PMI.
- **Condo reserves.** `coop-vs-condo-nyc-costs` said condo lenders "don't usually impose" a reserve requirement. It now says condos have no board rule, but a lender may ask for reserves loan by loan (usually a few months, not a year or more), and points to the condo calculator's optional reserve buffer.
- **Glossary "good-faith deposit"** said 20%+ down is typical at "co-op and condo buildings". It now says 20% or more at most co-ops; condos often allow less.
- **Dead source links replaced** (11 + 3 + 3 places, plus 2 mislabeled sources):
  - NYC DOF's transfer-tax page moved (`/taxes/` → `/property/`); the old URL shows "Page Moved". Fixed in 11 places: calculators, homepage, `/about/`, guides, and the sources table.
  - HPD affordable housing, HPD tenant rights and NYCHA voucher payment standards returned 404. Each now points to the agency's current page.
  - HUD New York (404) → `hud.gov/states/new-york`.
  - NYS Tax "Publication 1099" (404), cited for the mansion tax in 5 places → TSB-M-19(1)R, the memo four other pages already cite. Every tier in `calcMansionTax` was checked against the memo's table (1% plus the NYC supplemental 0.25% to 2.9%), and the sources table now records it as verified 2026-10-04.
  - ValuePenguin renter's insurance (404) → its current average-cost page. That page puts NYC at $18/mo against the $15 default; updating the default is a separate data PR, since it moves `/rent/` figures.
  - Two guides labeled the DOF transfer-tax page as their "Mortgage Recording Tax" source. They now cite DOF's Recording Property-Related Documents page, which covers the tax, like the other three pages that cite it.
- **Rent caps now cite the statute.** The $20 application-fee cap and the one-month deposit cap cited an HPD page that doesn't mention either. They now cite the HSTPA bill text (S.6458 §10, RPL §238-a(1)(b); §25, GOL §7-108(1-a)(a)), with the quoted language checked and `lastVerified` set.
- `updated` is bumped to 2026-10-04 on the three content entries whose text changed. Link-only changes don't bump dates.

**Code**
- New `scripts/check-links.mjs` (`npm run check-links`). It checks every `https://` URL in `src/` with curl and reports:
  - **Broken:** 404, 410, or a 200 "Page Moved / Not Found" page, which is how DOF answers.
  - **Unverified:** 403, 429, 5xx, or a timeout. Many sites block automated requests, so these are left for a person to check.
- New `.github/workflows/check-links.yml`. It runs monthly, opens one "Broken external links" issue (or comments on the open one), and closes it when a run is clean. It never edits the site.

**Validation**
- Before: 3 broken out of 181 links (after the 4 found by hand were fixed). After: **0 broken** out of 180.
  - The 32 unverified are bot blocks: StreetEasy, Medium, Miller Samuel and the Rent Guidelines Board return 403.
  - A few `tax.ny.gov` requests reset through this sandbox's proxy, and the Baruch PDF fails certificate verification here.
- The workflow's broken-count parsing was checked against a clean report (0) and a fabricated report with one broken link (1). The YAML parses.
- `npm test` 337/337; `npm run build` is clean, including `check-csp`.

## 2026-10-04: Phase 5e: Changelog, corrections, and a maintainer line

**User-visible changes**
- **New `/methodology/changelog/`.** Every change that could move a number, newest first: 7 corrections, 3 data updates, 2 method changes. Each has a date, what moved, the affected pages, and a link to the PR.
- **New `/methodology/corrections/`.** Covers:
  - How a mistake is handled: a failing test first, numbers in the notice, a dated note on the page, and the correction stays listed.
  - How to report one.
  - Every correction with "What was wrong" and "What's right now", from the renter move-in fee (#88) back to the condo mortgage recording tax (#42).
- **A byline on every guide and glossary term**, plus the changelog and corrections pages: "Maintained by Tyler La Fronz (linking to tylerlafronz.com/Links/). Last updated … Not reviewed by a licensed attorney, accountant, or mortgage professional." `/about/` names the maintainer from the same config. It links "How we check figures" and "Corrections". A page affected by a correction also shows a dated note linking to it (the AMI guide today).
- Guide Article JSON-LD gains `author`. `reviewedBy` appears only once a reviewer is set.
- **`/methodology/` updates:**
  - The stale "There's no automatic refresh" line now describes the scheduled rate and AMI checks, with a person reviewing each update.
  - "Found a mistake?" points to the corrections page.
  - A new "Who's behind it" card says plainly that no licensed professional has reviewed the content.
- **Links:** "Corrections" in the footer About column; both pages on `/explore/`; a corrections link on `/about/`; sitemap entries.

**Reviewer**
- The plan's open question (a named reviewer with a credential, or "maintained by" only) is still unanswered, so this ships "maintained by" with an explicit not-reviewed line. When there's a reviewer, set `REVIEWER` in `src/data/editorial.ts` (name, credential, review date). Every byline and the JSON-LD then switch over.

**Code**
- `src/data/siteChanges.ts`: the reader-facing record. Entries come only from this log, commit messages and PR numbers, with UTC merge dates.
- `src/data/editorial.ts`, `src/components/Byline.astro`, `src/components/ChangeEntry.astro`.

**Validation**
- New `test/siteChanges.test.ts` (6 tests):
  - Dates are valid and newest first; anchors are unique.
  - Corrections carry wrong/right/affects.
  - Every affected path resolves to a real page, guide or term.
  - Every "Fix:" heading in this file has a correction, or is explicitly listed as not changing a figure (the CSP nav fix).
  - Every `logHeading` exists in this file.
  - The reviewer is unset or fully named and dated.
- Mutation-checked: a typo'd path and an unlinked fix each made the test fail.
- `npm test` 337/337; `npm run build` is clean, including `check-csp`.
- Browser at 390 and 1280px:
  - The AMI guide's "What changed" link lands on its correction, below the sticky header.
  - Both new pages have no overflow and no console errors.
  - Fixed during the check: Astro dropped the space in "2026. Not reviewed".

**Also in this branch (merged up from 5d):** the `/plan/` spacing fix. The cards no longer touch "How this works", and link labels no longer break mid-phrase.

## 2026-10-04: Phase 5d: My NYC Plan (`/plan/`)

**User-visible changes**
- **New `/plan/` page.** It's read-only and built from what's saved in this browser. For renting, a co-op and a condo it shows:
  - **The ceiling**, labeled Calculated.
  - **"Limited by income" or "Limited by cash"**, and a sentence explaining why. For example: "Cash sets it. The 25% down payment, closing costs, and 18 months of post-closing reserves the board wants to see use the $203,000 you can count."
  - **What the other side alone would allow.**
  - **The lift:** how much more saved (or earned a year) would bring the binding side level with the other one, after which the other limit takes over.
  - **Up to three single changes** that move the ceiling, best first: save $10K, earn $10K, pay off debts, rates down half a point. A step that runs into the other limit says so ("then cash is the limit"). Changes that wouldn't help aren't listed.
- **No saved profile:** it runs on the sample profile with a clear notice. Assumptions that were never saved use the site defaults, and the page says so, naming today's rate.
- It updates live when another tab saves.
- **Plausibility limits:**
  - For rent, it says when cash "isn't close to limiting this" instead of quoting a cash ceiling of $100,000/mo.
  - It won't quote an income lift that would more than double income.
- **Links:** a new top-level nav link "My plan", the footer Explore column, links from `/compare/` and `/my-data/`, and the sitemap. No ads on the page.

**Code**
- New `src/lib/plan.ts` (pure): `ceiling`, `liftToOtherSide`, `nextSteps` and `buildPlan`. Each number is the calculators' engine rerun with one input changed, so it can be reproduced on `/coop/`, `/condo/` or `/rent/`.
- `src/lib/housingOptions.ts` exports the engine-input builders (`rentInputs`, `coopInputs`, `condoInputs`), so `/plan/`, `/compare/` and A/B share them. `/compare/`'s output is unchanged; all 318 existing tests pass without edits.
- New `src/scripts/plan.ts` renders the page with `textContent` only and never writes.

**Validation**
- New `test/plan.test.ts` (10 tests):
  - Ceilings equal `/compare/`'s.
  - The binding side is the lower ceiling.
  - Lift amounts are exact to the dollar (one dollar less isn't enough), including the 40× rent case.
  - Steps only include changes that help, ranked and reproducible.
  - Capped steps land on the other ceiling.
  - Sentence wording; the sample-profile fallback.
  - The two plausibility rules were written as failing tests first.
- `npm test` 329/329; `npm run build` is clean, including `check-csp`.
- Browser (CSP served):
  - Sample and saved states, live updates from another tab, no console errors.
  - No horizontal overflow at 390px and 1280px.
  - With "My plan" added, the desktop nav still fits at 1100px; the hamburger breakpoint stays at 1024px.

## 2026-10-04: Phase 5c: Compare two scenarios (A/B)

**User-visible changes**
- **"Compare two scenarios" on `/my-data/`.** Pick any two of "What's saved now" and your saved scenarios. It shows:
  - A plain-language summary of how far each ceiling moves: rent, co-op, condo.
  - A side-by-side table with a difference column, split into "Your numbers" (income, debts, cash, rates, down payments, charges) and three "Calculated" sections: max rent or price, monthly cost, cash needed, and what limits it.
  - Bold marks the side that comes out ahead only where that's clear-cut. Down payment and lease cash are never called better or worse.
  - Any value a scenario didn't save is tagged **default**, and the summary says so. That way a scenario saved before a rate change isn't quietly compared at today's rate.
- Each scenario has a **Compare** button that opens it against what's saved now.
- `/compare/` links to it from the what-if panel.

**Code**
- New `src/lib/housingOptions.ts`: the `/compare/` model (normalize accounts; run rent/co-op/condo from a profile plus the saved assumption sets), moved verbatim out of `src/scripts/compare.ts`. `/compare/` now imports it, so `/compare/` and A/B can't drift. No formula changes.
- New `src/lib/scenarioCompare.ts` (pure): `scenarioModel`, `scenarioOutcome`, `compareScenarios` and `summarize`. Saved values are only read if numeric, and fall back per field. Dollar differences use whole dollars, so the difference column always equals B minus A as displayed.

**Validation**
- New `test/scenarioCompare.test.ts` (9 tests):
  - housingOptions equals direct engine calls.
  - Empty, junk and partial snapshots fall back visibly.
  - A scenario keeps its saved rate.
  - Identical scenarios show no differences.
  - better/worse flags, per-side default flags, and the summary wording.
- `npm test` 318/318; `npm run build` is clean, including `check-csp`.
- Browser:
  - **`/compare/` refactor parity:** every result cell matched the 5b build exactly, with the sample profile, with a saved profile and co-op assumptions, and with the what-if sliders moved.
  - **A/B at 390 and 1280px under CSP:** the empty state, picking, picking the same item on both sides, and the Compare button all worked. No console errors and no horizontal overflow.
  - The browser check caught one bug, fixed and rechecked: differences were taken before rounding (+$116,128 next to values $116,129 apart).

## 2026-10-04: Phase 5b: Your Saved Data (scenarios, export/import, reset)

**User-visible changes**
- **New `/my-data/` page.** It lists every tool that can save inputs in this browser, shows which have data, and marks the ones that can hold income, debts or balances as Personal.
  - **Scenarios.** Save everything currently saved under a name, then load, rename or delete it (up to 20). Saving under an existing name updates that scenario. Loading replaces the calculators' current saved inputs.
  - **Export and import.** Export downloads a JSON file built in the browser. Import reads a file you pick and previews it, then merges or replaces. Only known keys with valid JSON are written; anything else is listed as skipped. It also accepts the "Download my saved data" file from the legacy co-op domain.
  - **Delete everything**, with a confirmation step. It removes only this site's keys.
  - No ads on the page, and no network requests.
- **Privacy page.** The storage-key table now renders from the same registry, which adds the 6 keys it was missing plus `nyc_scenarios`. The legacy-domain paragraph now describes the 5a behavior: only settings travel, and personal figures are offered as a download. Last updated October 4, 2026.
- The legacy co-op page's download note now points to `/my-data/` for importing.
- Linked from the nav (Learn), the footer About column, and the site directory. Added to the sitemap.

**Code**
- New `src/lib/profileStore.ts`: `STORAGE_KEYS` registry, scenarios, export, `parseImport`, `applyImport`, `resetAll`. It's pure apart from the Storage object passed in.
- New `src/scripts/my-data.ts`, which only wires that to the page. Strings from storage or files go in with `textContent`.

**Validation**
- New `test/profileStore.test.ts` (13 tests): save/load/rename/delete, same-name replace, the limit, the export/import round trip, merge renames ("(imported)", then "(imported 2)"), the legacy file, rejecting unknown keys and bad files, the size cap, and reset leaving other sites' keys alone. A drift test fails if any `nyc_*` key used in `src/` isn't in the registry.
- `npm test` 309/309; `npm run build` is clean, including `check-csp`.
- Browser (CSP served, 390 and 1280px, no console errors, no horizontal overflow):
  - Saved, renamed, loaded and deleted scenarios. A scenario named with an `<img onerror>` tag rendered as text.
  - Export downloaded `nyc-affordability-saved-data-2026-10-04.json`. Reset emptied storage. Importing that file (replace) restored both tools and both scenarios. The legacy file imported its co-op inputs and skipped its unknown key. A foreign JSON file was rejected.
  - End to end: saved a 6.25% co-op as a scenario, changed `/coop/` to 8%, loaded the scenario, and `/coop/` reopened at 6.25%.
  - Caught and fixed in the browser check: `.row { display: flex }` overrode `hidden`, so the reset confirmation showed before it was clicked.

## 2026-10-04: Phase 5a: No personal finances in URLs

**User-visible changes**
- **Legacy-domain hand-off.** Visitors to the retired nyc-co-op-affordability.com used to be redirected with their saved co-op data in a `#migrate-local-storage=` URL fragment: account balances, income, debts and the shared profile. Now only an allowlist of 12 calculator settings travels: rate, term, down payment, reserves, DTI limit, maintenance and closing fees.
- If the old address has personal figures saved (income, debts, account balances), the page no longer auto-redirects. It lists those figures on screen, offers "Download my saved data" (a JSON file that stays on the device), and links on with the safe settings only.
- `/coop/` removes the fragment from the address bar before reading it. It imports only the allowlisted settings, merged into anything already saved, so an old link that still carries balances can't bring them in.
- **Reality Check share text** no longer includes the income you typed. It shares the results only.
- The other calculators were audited: their share links carry scenario inputs only, and the income/savings/debt options (afford-more, rate-sensitivity, savings-planner) stay opt-in and unchecked by default. No change was needed.

**Code**
- New `src/lib/migrationPayload.ts`: `SAFE_COOP_INPUT_KEYS`, `safeCoopInputs` and `sanitizeMigrationPayload`.
- `functions/[[path]].js` keeps a copy of the allowlist; a test checks the two match.

**Validation**
- New `test/migrationPayload.test.ts` (6 tests):
  - The sanitizer drops accounts, income, debts, the shared profile and unknown keys.
  - **The real Worker page runs in a node:vm sandbox with fake saved data.** It redirects immediately when only settings are saved, redirects with a clean URL when nothing is saved, and doesn't redirect when personal data exists. It shows the personal values, and its link carries none of them.
  - The two allowlists match.
- Run against the previous Worker, 2 of the 6 tests fail, including the personal-data one; they pass with the new code.
- `npm test` 295/295; `npm run build` is clean, including `check-csp`.
- Browser:
  - `/coop/` opened with an old-style link (income $185,000, a $99,999 balance) cleared the URL, imported rate 7.1% and down payment 25%, and kept its default income and accounts.
  - The legacy page at 390px with saved personal data listed the three figures, didn't redirect, built a link with only `{mtgRate, dpPct}`, and downloaded `nyc-co-op-saved-data.json`. No errors.
## 2026-10-04: Data: default mortgage rate 6.95% → 7.28% (PMMS, week of October 1, 2026)

**User-visible changes**
- The weekly PMMS job opened this PR (`data/pmms-rate`). It updated `mortgageRatePct` and the rate inputs on `/coop/`, `/condo/` and `/compare/`. Every calculator and build-time page (homepage table, `/income/`, `/buy/`, neighborhood and borough pages, `/data/`) now computes at 7.28%.
- Source: Freddie Mac PMMS page, "Mortgage Rates Average 7.28%". The 30-year fixed averaged 7.28% as of October 1, 2026, up from 7.03% the week before (6.34% a year earlier).
- **Hand updates on top of the automated commit:**
  - Nine guides' worked examples were recomputed at 7.28%: rates, income needed, reserves, down payment, rent vs buy, common charges, maintenance. The rates guide's "where rates are now" paragraph and its source were also updated to the October 1 release.
  - The mortgage-points, rate-lock and PMI glossary examples were recomputed. PMI now reaches 80% LTV after 104 payments, and 78% after 119.
  - The `/coop/` and `/condo/` rate hints were updated. The co-op median now needs about $170K of income. The September Bankrate figure was dropped rather than carried forward unverified.
  - `test/afford.test.ts` goldens were recaptured at 7.28%; that file exists to pin the defaults.
- Includes the fixed-rate behavior-test change from its own PR. It no-ops here once that PR merges.

**Validation**
- `npm test` 289/289.
- `npm run build` is clean, including `check-csp`. The built `/coop/` and `/condo/` inputs default to 7.28.
- No remaining "6.95%" in `src/`, other than the rates guide's own history ("6.95% in mid-September") and the registry's test-pinning note.
- No remaining dollar figures derived from 6.95% ($434K, $576K, $166K and others).

## 2026-10-04: Tests: behavior tests use a fixed rate, not the site default

**What changed**
- Engine behavior tests now pass `mortgageRate: TEST_RATE` (6.95%) instead of inheriting `mortgageRatePct` from the registry. The tests live in `engines`, `levers`, `sensitivity`, `rentVsBuy`, `savings` and `moveCost`.
- **Why:** with the weekly PMMS job (#90), the default rate changes regularly. In the first update (#93, 6.95% to 7.28%), two of these tests stopped testing what they describe:
  - The condo "cash binds" scenario was no longer cash-bound.
  - "Saving helps only until income becomes the limit" fell from $10,745 to $2,361 at the new rate.
- Updating their numbers would have hidden that. With a fixed rate they keep testing the same scenario.
- **Unchanged on purpose:** `test/afford.test.ts` pins what the homepage and income pages show at the default, and `test/guideExamples.test.ts` checks guide prose against the default. Those should still move with the rate. Parity tests that compare two modules at the default still use it on both sides.

**Validation**
- `npm test` 289/289 at the current 6.95% default.
- With these tests on #93's branch (default 7.28%), failures drop from 29 to 17: the 5 afford goldens plus 12 guide checks, all intended. No behavior test fails.

## 2026-10-04: Phase 4b: Charts that keep cited and calculated figures apart (/neighborhoods/)

**User-visible changes**
- `/neighborhoods/` has a new "Side by side" section with two charts. Both show the same neighborhoods in the same order, highest cited rent first.
  - **Cited: rent, as reported.** Horizontal bars, one color, with the value at each tip. Each row says "avg" (Corcoran average on leases signed) or "median" (Elliman median of new leases), and "zone" when the figure covers a wider area than the neighborhood.
  - **Calculated: annual income it takes.** A dot plot on one income axis, with three series: rent at 40x (circle), co-op (square) and condo (diamond). It's a different chart form from the cited bars, and it carries a dashed "Calculated" badge. The caption says the values move with the site's assumptions.
- **Sale prices aren't charted.** Brown Harris Stevens reports one-bedroom medians while Corcoran and Elliman report all units, often for multi-neighborhood submarkets, so the page explains why and puts them in the table instead.
- **Hover and keyboard tooltips** on every bar and dot. The value comes first, then the source, period and scope. Text is set with `textContent`.
- **"Show every number as a table"** lists every cited and calculated value with its scope and source, and links the `/data/` downloads.

**Design checks (dataviz method)**
- Palette slots 1–3 (#2a78d6, #eb6834, #1baf7a) pass the validator on the white card surface with `--pairs all`: worst CVD ΔE 9.2, normal-vision ΔE 24.0.
  - Aqua is 2.82:1, so it gets relief: a distinct marker shape per series, a legend, tooltips and the table view.
- Bars are 14px with a 4px rounded data end. Dots are 10px with a 2px surface ring and a 24px hit area. Gridlines are hairlines. There's only one axis per chart.
- On phones, every other tick label is hidden so labels don't collide.

**Code**
- `src/lib/neighborhoodCharts.ts` (pure):
  - `chartRows` uses `incomeBasis` from the data export, so the charts, the area pages and `/data/` agree.
  - Also `describeFigure`, `niceTicks` (the 1/2/2.5/5 step with the least empty axis) and `compactMoney`.
- `src/components/charts/NeighborhoodCharts.astro` and `src/scripts/chartTips.ts`.

**Validation**
- New `test/neighborhoodCharts.test.ts` (6 tests):
  - row order
  - the calculated incomes equal the `/data/` income-needed rows
  - rent qualifiers match metric and geography
  - descriptions carry period, scope and source
  - tick and money formatting
- `npm test` 289/289; `npm run build` is clean, including `check-csp`.
- Browser at 390px and 1280px under the production CSP:
  - no overflow and no console errors
  - 10 bars and 30 dots
  - the hover tooltip ("$401,618/yr, Park Slope: to buy a co-op, from the Corcoran 2Q 2026 submarket median") and the keyboard-focus tooltip both work
  - after the fix, the phone axis labels no longer overlap
  - the table view renders as cards on phones

## 2026-10-04: Phase 4c: Scheduled data checks that open PRs only

**What it does**
- `.github/workflows/data-update-pmms.yml` runs every Thursday evening and on demand.
  - It reads Freddie Mac's `PMMS_history.csv`. When there's a newer survey week than the site's default, it updates:
    - `mortgageRatePct` (value, effective date, last-verified date, notes)
    - the four rate `<input>` defaults on `/coop/`, `/condo/` and `/compare/`
  - Then it runs the tests and opens or refreshes one draft PR on `data/pmms-rate`.
  - The PR body lists the failing golden tests with their new values, the guide sentences that quote the old figures (from `guideExamples`), and every line that still says the old rate.
- `.github/workflows/data-check-ami.yml` runs monthly. It parses HPD's AMI chart, and if the year or any figure differs from `src/lib/amiTable.ts`, it updates the table and opens a draft PR on `data/hpd-ami` with the same kind of report.
- `.github/workflows/data-reminder-tax.yml` runs yearly on Dec 10. It opens a checklist issue for the federal, NYS and NYC tax tables, which can't be scraped reliably. It skips this if the issue is already open.
- **Safety:**
  - The workflows never merge and never push to the default branch.
  - If people have pushed their own commits to a data branch, the job comments the new figures on the PR instead of force-pushing over their work.
  - Parsers throw on any format change rather than guessing.
- `/data/` now says what the scheduled checks do.

**Code**
- `src/lib/sourceParsers.ts` (pure): `parsePmmsCsv`, `parseHpdAmiPage` (includes sanity checks: values rise with household size, and the 1-person/4-person ratio is about 0.7), and `setInputValue`.
- `scripts/data-updates/`: `update-pmms.ts`, `check-hpd-ami.ts`, `shared.ts` and `open-pr.sh`.
- `AMI_YEAR` moved into `src/lib/amiTable.ts`.

**Validation**
- New `test/sourceParsers.test.ts` (6 tests) runs against trimmed copies of the real files, fetched 2026-10-04: the PMMS history tail and the HPD AMI page excerpt.
- **Live parse:** PMMS returns 7.28% for the week of 2026-10-01, and 6.95% for 2026-09-17, which matches the current default. HPD 2026 matches `amiTable.ts` exactly.
- **PMMS dry run** on a scratch copy:
  - It updated the registry and inputs to 7.28%, and the report listed 30 tests to update (20 engine goldens, 10 guide examples) and 24 lines quoting 6.95%.
- **AMI dry run** on a scratch copy:
  - The real page made no change.
  - A synthetic 2027 page updated the table and year, and the 3 pinned AMI tests failed, as designed.
- YAML parses and `bash -n` passes.
- `npm test` 283/283; `npm run build` is clean, including `check-csp`.

## 2026-10-04: Phase 4a: Public data downloads (/data/)

**User-visible changes**
- New `/data/` page with five datasets, each as JSON and CSV. They're built from the same files the pages read, so a download can't disagree with the site.
  - `market-figures`: every cited rent and sale figure on a neighborhood or borough page, with source, URL, period and the area the source measured. *Cited.*
  - `income-needed`: income needed to rent at, or buy a co-op or condo at, each area's cited figure. Each row names the figure it started from and the method, and the values match the area pages to the dollar. *Calculated.*
  - `affordability-index`: index history, one row per metric. The untracked condo median is listed as `not-yet-tracked` with a blank value. *Cited.*
  - `ami-2026`: HPD's 100% AMI row by household size. *Cited.*
  - `assumptions`: the whole defaults registry with each entry's basis. *Assumptions.*
- `/data/index.json` manifest with the field dictionary.
- **License:** CC0 1.0. The page notes that CC0 covers this site's compilation and calculations, and that cited figures should be credited to their sources.
- `/data/` is linked from the Learn menu and the Explore footer column, and listed in the sitemap. The JSON and CSV files aren't.
- `_headers`: `/data/*` gets `Access-Control-Allow-Origin: *` and a one-hour revalidating cache.

**Validation**
- New `test/dataExport.test.ts` (9 tests):
  - CSV escaping, and CSV line counts.
  - Every row has exactly the declared columns.
  - Every cited row has a value, source, https URL and a dated period, and untracked rows stay blank.
  - Calculated rows match `requiredIncomeForRent`/`requiredIncomeForPrice`, including Queens using its co-op median.
  - One assumption row per registry entry; the manifest lists both files per dataset under CC0.
- `npm test` 277/277; `npm run build` is clean, including `check-csp`. The link crawl, including the download links, finds 0 broken.
- In the browser under the production CSP:
  - `/data/` renders at 390px and 1280px with no overflow or errors.
  - The CSV is served as `text/csv`.
  - The manifest lists 5 datasets (27, 38, 3, 8 and 49 rows).
  - Manhattan income-needed in the CSV ($187,800 rent, $344,199 co-op) matches `/manhattan/`.

## 2026-10-03: Move-in fee applies to co-op and condo buildings only

**User-visible changes**
- `/rent/` and `/cost-to-move/` no longer add a $500 "building / move-in admin fee" by default. RPL §238-a(1)(a), added by the HSTPA in 2019, bars a landlord from charging any fee at the start of a tenancy other than the capped background/credit check. The field is now "Co-op/condo move-in fee", defaults to $0, and says to fill it in only when renting a unit in a co-op or condo building, where the board can charge one.
- Buyers are unchanged: `/coop/` keeps its $1,000 refundable move-in deposit, and `/condo/` keeps building fees, which include move-in.
- `/rent/<price>/` signing totals drop by $500, and the table note now explains why there's no move-in fee. The cost-to-move guide's calculator note is updated to match.
- `rentBuildingFee` in the registry is now basis `law`, value 0, and cites the HSTPA bill text.

**Validation**
- A new `test/moveCost.test.ts` check failed on the $500 default first, then passed. It covers: renter default 0 with basis law, no building line in the renter move cost, and the co-op buyer still paying the move-in deposit.
- Three rent golden values in `test/engines.test.ts` dropped by exactly $500: 8,300 → 7,800; fixed fees 770 → 270; 10,175 → 9,675.
- `npm test` 268/268; `npm run build` is clean (207 pages), including `check-csp`.
- Browser at 390px under the production CSP:
  - `/rent/` shows the new label and a $0 default.
  - `/cost-to-move/` shows $0.
  - The `/rent/3000/` note is updated.
  - No console errors.

## 2026-10-03: Phase 3h: Eleven new guides

**User-visible changes**
- 11 new `/guides/<slug>/` pages. Each has dated sources, a worked example, and related links.
  - Renting: good-cause-eviction-nyc-explained, breaking-a-lease-in-nyc, how-much-does-it-cost-to-move-in-nyc.
  - Buying: how-much-down-payment-nyc-apartment, rent-vs-buy-nyc, condo-common-charges-explained, nyc-coop-condo-property-tax-abatement.
  - Co-ops: coop-maintenance-explained.
  - Income: nyc-city-income-tax-explained.
  - Affordable housing: scrie-drie-rent-freeze-program, homefirst-down-payment-assistance.
- Worked examples come from the site's own engines: `calculateCoop`/`calculateCondo`, `compareRentVsBuy`/`breakEvenRent`, `renterMoveCost` and `computeBreakdown`. Rules and thresholds come from official pages:
  - HPD Good Cause local rent standard of 8.38%
  - HomeFirst: up to $100,000 at 120% AMI
  - SCRIE/DRIE: $50,000 income limit
  - DOF abatement tiers: 28.1%–17.5%
  - IT-2105-I 2026 NYC brackets
- **Citation fixes:** three existing guides cited "RPL §227-g" for the security deposit cap. The 2019 HSTPA bill text puts it in General Obligations Law §7-108(1-a). They now cite that section, linked to the bill text.
- Existing guides and glossary entries now link to the new guides through `relatedGuides`.

**Validation**
- `npm test` 263/263. Eight new `test/guideExamples.test.ts` checks recompute each default-dependent worked example: down payment, rent vs buy, common charges, maintenance, city tax, cost to move.
- `npm run build` is clean (207 pages), including `check-csp`. The link crawl finds 0 broken internal links.
- All 11 guides render at 390px under the production CSP with no console errors. Each has a Worked example section. A four-column table on the lease-break guide overflowed and was folded to two columns.
- Key figures were re-fetched from official sources and matched.

## 2026-10-03: Phase 3g: Twenty new glossary terms

**User-visible changes**
- 20 new `/glossary/<slug>/` pages, each with a plain definition, dated primary or clearly labeled secondary sources, related links, and a worked example:
  - Buying and financing: private-mortgage-insurance-pmi, mortgage-points, rate-lock, escrow-account, title-insurance, contract-of-sale, offering-plan, working-capital-contribution.
  - Taxes: cema, nyc-real-property-transfer-tax, nys-transfer-tax.
  - Co-ops: proprietary-lease, underlying-mortgage, special-assessment.
  - Renting: security-deposit, preferential-rent, rent-guidelines-board, renewal-lease, net-effective-rent, broker-fee.
- Worked-example numbers either use the site's own formulas and defaults (`calcPmiRate`, `calcMortgageRecordingTax`, `calcNycRptt`, `calcNysTransferTax`, the assumptions registry) or are labeled hypothetical.
- **Rent stabilization guide:** now notes the pending landlord lawsuit against the 2026–27 freeze (still in effect as of October 1, 2026; a ruling is expected by year end). It also cites the June 25, 2026 report of the 7-1 vote.
- **Seller closing costs guide:** corrected. The NYS 0.4% transfer tax applies statewide; only the 0.25% additional tier is NYC-only.

**Validation**
- `npm test` and `npm run build`, including the glossary link and orphan checks.
- Each source was fetched and its supporting text read. Claims that couldn't be sourced were dropped.
- Every worked example was recomputed with node.

## 2026-10-03: Phase 3f: Fill gaps in the price grids; split salary from income

**User-visible changes** (32 new pages; every existing URL kept)
- **`/income/<n>/`**: added $65K, $70K, $85K, $110K, $130K, and $140K (17 → 23 pages).
- **`/salary/<n>/`**: now has its own grid, `SALARY_AMOUNTS`. It covers every income amount plus $35K, $40K, and $45K (17 → 26 pages). Below $50K, take-home pay is still a real question, but a housing page would mostly say "see affordable housing". So those three get salary pages only.
- **`/rent/<n>/`**: added $1,500, $2,250, $2,750, $3,250, $3,750, $5,500, $6,500, $7,000, $8,000, and $10,000 (9 → 19 pages).
- **`/buy/<n>/`**: added $350K, $450K, $550K, $650K, $700K, $1.75M, and $2.5M (13 → 20 pages).
- **Index pages**: the hub pages, `/explore/`, chip rows, and "nearest page" cross-links all pick up the new amounts automatically. The sitemap now lists 172 URLs.
- **Salary-only amounts**: a salary page links to its own income page when one exists, otherwise to the nearest one. `/salary/35000/` links to `/income/50000/`, never to a missing `/income/35000/`.

**Tests** (234 → 241; `test/priceGrids.test.ts`)
- Each grid is ascending, unique, and whole numbers.
- **Every pre-Phase-3 amount is pinned, so a published URL can't be removed by accident.**
- Each income page has a salary page.
- Each salary page's income link resolves.

**Validation**
- `npm test`: 241/241. `npm run build`: 173 pages, clean, including `check-csp`.
- **Link crawl**: every internal `href` in `dist/` resolves to a built page (0 broken).
- **Browser** (390px, production CSP): `/salary/35000/`, `/rent/1500/`, `/rent/10000/`, `/buy/2500000/`, `/income/110000/`, and `/salary/` render with no overflow or errors.

## 2026-10-03: Phase 3e: Salary pages get pay-period and housing sections

**User-visible changes** (every `/salary/<amount>/` page; URLs unchanged)
- **"Per paycheck":** gross, withheld, and take-home for weekly (52), every two weeks (26), twice a month (24), and monthly (12). The page explains why biweekly and semimonthly checks differ, and notes that these are averages: real withholding follows payroll tables.
- **"What housing takes out of this paycheck":**
  - Covers rent at the 40× maximum, a co-op at the board DTI limit, and a condo at the lender DTI limit.
  - Each row shows the monthly housing cost, its share of **take-home** pay, and what's left each month.
  - Linked from the matching `/rent/<amount>/` page and the calculators.
  - Example at $100,000: $5,870/mo take-home. A $2,500 rent uses 43% of it, a $214K co-op 40%, and a $238K condo 61%.
- The meta description now mentions both sections.

**Code**
- `src/lib/payPeriods.ts` (pure): splits the annual `computeBreakdown()` result across pay frequencies.
- The housing rows reuse `maxAffordableRent`/`maxAffordablePrice` and the registry DTI limits. At the DTI ceiling, monthly housing equals the limit times gross monthly pay.

**Tests** (234 → 236; `test/payPeriods.test.ts`)
- Each frequency multiplies back to the annual gross, withholding, and net.
- Biweekly and semimonthly checks differ.

**Validation**
- `npm test`: 236/236. `npm run build`: clean, including `check-csp`.
- Browser check on `/salary/100000/`:
  - Tables render.
  - The figures cross-check against the engine and DTI limits.
  - No overflow at 390px.
  - No errors under the production CSP.

## 2026-10-03: Phase 3d: Borough hubs (/manhattan/, /brooklyn/, /queens/)

**User-visible changes**
- **New borough guides.** Each has cited borough-wide figures, notes on what each figure covers, the calculated income needed, and the borough's neighborhood pages with their rents. Sources are listed with links. The footer carries a "not advice" disclaimer.
  - **Manhattan:**
    - Median rent on new leases: $4,695 (Elliman, January 2026).
    - Median apartment sale price: $1,290,000 (Brown Harris Stevens, Q2 2026, resale and new development).
  - **Brooklyn:**
    - Median rent on leases signed: $4,368 (Corcoran, August 2026; a borough record per the report).
    - Median co-op/condo sale price: $895K (Corcoran, 2Q 2026).
  - **Queens:**
    - Median sale price: $739,053 for co-ops, condos, and 1–3 family homes; co-ops $339,750; condos $680,000 (Elliman, Q4 2025).
    - Rent shows **"Not yet tracked"**. No stable source publishes a borough-wide Queens rent, and Elliman's Northwest Queens zone is only part of the borough.
- **Income rows use property-type medians when the source has them.** In Queens, co-op income is computed at the co-op median: $128,536/yr, versus $219,159 if the blended median, which includes houses, were used.
- **The Bronx and Staten Island have no hub yet.** None of the reachable reports publish borough-wide figures for them, and an empty page would fail the quality gate.
- **Linking:**
  - The Neighborhoods nav menu lists "Manhattan guide", "Brooklyn guide", and "Queens guide".
  - Borough headings on `/neighborhoods/` and `/explore/` link to the hubs.
  - Each neighborhood page links back to its borough guide.
  - The sitemap includes all three hubs.

**Code**
- `src/data/boroughs.ts` holds the hub data in the same `MarketFigure` shape as the neighborhood collection. `src/pages/[borough]/index.astro` builds only the hubs that are listed there.

**Sources (each figure checked against the PDF)**
- Elliman January 2026 rentals: Manhattan median rental price $4,695. Doorman $5,433 and non-doorman $3,850 are quoted in the notes.
- BHS Q2 2026: "The median price rose 6% … to $1,290,000"; includes new development and resale apartments.
- Corcoran August 2026 Brooklyn rentals: "median rent … to a record $4,368".
- Corcoran 2Q 2026 Brooklyn: median price $895K.
- Elliman Q4 2025 Queens: Queens Matrix median $739,053; Co-Op Matrix $339,750; Condo Matrix $680,000; 1–3 Family $910,000 (quoted in the notes).

**Tests** (234 → 246; `test/boroughHubs.test.ts`)
- Each hub passes the quality gate against the other hubs.
- Every figure is borough-wide, dated, and sourced on the page.
- Every hub has notes and is reachable from the primary nav.
- `/explore/` links borough headings in its Neighborhoods section, and only there. Added after review caught the link rendering in the Guides section, where it never appeared.

**Validation**
- `npm test`: 246/246. `npm run build`: clean, including `check-csp`.
- Browser:
  - all three hubs render
  - Queens shows "Not yet tracked"
  - the index and neighborhood back-links work
  - the nav lists the guides
  - no overflow at 390px
  - no errors under the production CSP
## 2026-10-03: Fix: NY State 6.85% bracket threshold for single and head-of-household filers

**User-visible changes**
- `src/lib/salaryTaxConstants2026.ts`: NY State's 6.85% bracket now ends at $1,077,550 for single filers and $1,616,450 for head of household, per the 2026 IT-2105-I worksheets. Both statuses had reused the married-filing-jointly threshold ($2,155,350), which undertaxed income in that range by 2.8 points (9.65% vs 6.85%).
- Only `/required-salary/` results for single or head-of-household incomes above about $1.08M change. No statically built page changes. The build diff between main and this branch is only bundled-asset hashes.

**Validation**
- A new test in `test/salaryCalc.test.ts` failed on the old thresholds, then passed. It pins all three thresholds and checks that $1.5M of single taxable income is taxed at 9.65% above $1,077,550.
- `npm test` 235/235; `npm run build` is clean, including `check-csp`.
## 2026-10-03: Fix: AMI table now matches HPD's 2026 chart

**User-visible changes**
- The 100% AMI figures in `src/lib/amiTable.ts` are now NYC HPD's 2026 New York City Area AMI chart: $118,800 (1 person) through $223,900 (8 people); $152,700 for 3 and $169,600 for 4. The old table was about 22% lower: $124,700 for 3 and $138,550 for 4. It was labeled as HUD's New York HMFA figures and "the same ones HPD uses", but it didn't match HPD's chart.
- Effect: `/affordable/` and `/reality-check/` were overstating households' AMI percentage. A 3-person household at $150,000 showed 120% AMI; HPD's chart puts it at 98%. Bands, eligibility and the max rents per band all move with the new figures.
- `/affordable/` source notes, the AMI guide (table, examples, rent-by-band table, and a dated correction note), the AMI and HDFC glossary entries, the homepage feature list, and `/methodology/sources/` now cite HPD's chart.
- The AMI guide no longer says its rent-by-band table is HPD's method exactly. HPD's published rents come out lower because HPD uses its own household-size assumptions.

**Validation**
- New `test/amiTable.test.ts` failed against the old table first, then passed. It pins the 1–8 person figures to HPD's chart, spot-checks HPD's 60%, 80% and 120% columns, and checks the $150K / 3-person = 98.2% example.
- `npm test` 237/237; `npm run build` is clean, including `check-csp`.
- In the browser under the production CSP, `/affordable/` defaults the 3-person reference to $152,700 and shows 98% for $150K at 3 people, with no overflow at 390px and no errors.

## 2026-10-03: Phase 3c: Rent pages get income-rule and FARE Act scenarios

**User-visible changes** (all 30-odd `/rent/<amount>/` pages; URLs unchanged)
- **"Not every landlord uses 40×":**
  - Income needed at 35×, 40× (highlighted as most common), and 45× the rent, plus the personal-guarantor 80× rule.
  - A note that institutional guarantor companies often look for about 27×, linking the guarantor guide that cites it.
- **"Cash to sign a $X lease"** under the FARE Act, from the same engine as `/cost-to-move/`. Three scenarios:
  - no broker or the landlord's broker
  - a broker you hired (15% of a year's rent)
  - a guarantor company (the 70%-of-one-month registry estimate)
- Each total spells out what it includes. A link opens Cost to Move pre-filled with the rent, so movers and overlap can be added. For $3,500, it's $7,770 at signing, and $9,420 on Cost to Move with the default movers and supplies.
- The intro note no longer says the page ignores move-in cash and the FARE Act. The meta description mentions the new sections.
- The guarantor multiple now reads from the registry instead of a hard-coded 80.

**Validation**
- `npm test`: 202/202. `npm run build`: clean, including `check-csp`.
- Browser check on `/rent/3500/` at 1280 and 390px: tables render, no overflow, no errors under the production CSP, and the Cost to Move link matches.
## 2026-10-03: Phase 3b: Five Brooklyn neighborhood pages

**User-visible changes**
- New pages at `/neighborhoods/<slug>/`: **Greenpoint, Park Slope, Brooklyn Heights, Fort Greene, Bedford-Stuyvesant**. `/neighborhoods/` now has a Brooklyn group with 10 neighborhoods in total. All five are in the sitemap.
- **Rent figure:** each page's rent is Corcoran's **average rent on leases signed**, August 2026. It's neighborhood-specific except Fort Greene, which Corcoran combines with Clinton Hill.
- **Sale figure:** the sale price is Corcoran's **2Q 2026 median sale price** (co-ops and condos, including new development) for the submarket containing the neighborhood. Each submarket's name and coverage is shown on its card.
- **Page text:** each page explains:
  - that the rent is an average, not a median, and is based on last asking prices
  - what the sale submarket includes, for example that Bed-Stuy's figure excludes the townhouses that make up much of its housing
  - why the two dates differ
- **Calculated income:** the income-needed rows say "at the average" for these pages.

**Sources (each figure checked against the PDF itself)**
- Corcoran, Brooklyn Rental Market Report, August 2026: "Average Rent by Neighborhood" table. Greenpoint $5,643, Park Slope $5,809, Brooklyn Heights $7,076, Fort Greene / Clinton Hill $4,844, Bedford-Stuyvesant $4,269. The report's footnote says the figures are based on last asking prices for leases reported signed.
- Corcoran, Brooklyn Market Report, 2Q 2026: submarket map page.
  - Williamsburg & Greenpoint: $1.510M
  - Brooklyn Heights, Cobble Hill, Dumbo & Downtown: $1.661M
  - Park Slope & Gowanus: $1.543M
  - Fort Greene, Clinton Hill & Prospect Heights: $1.100M
  - Bedford-Stuyvesant, Crown Heights, Lefferts Gardens & Bushwick: $800K
  - Each submarket's own page agrees ($1.51M, $1.66M, $1.54M, $1.10M, $800K).
- Considered and not used: Elliman's January 2026 rental report gives only a borough-wide Brooklyn median ($3,814). Its 4Q 2025 Brooklyn sales report uses four broad submarkets. Corcoran's neighborhood breakdowns are finer and more recent.

**Quality gate**
- Every new page passes on its own neighborhood-level rent, except Fort Greene, which passes on its unique zone rent and its sale figure.

**Validation**
- `npm test`: 234/234. `npm run build`: clean, including `check-csp`.
- Browser check:
  - all five pages render with scope tags
  - the index groups Manhattan, Brooklyn, and Queens
  - no overflow at 390px
  - no errors under the production CSP

## 2026-10-03: Phase 3a: Neighborhood market-figure schema and quality gate

**User-visible changes**
- Each neighborhood stat card now says **what area the figure covers**:
  - a green "Astoria only" tag for neighborhood-specific numbers
  - an amber "Wider area: Northwest Queens (Elliman) (Astoria, Long Island City, Sunnyside, and Woodside combined)" tag for broker-zone numbers
- Each card also links its source next to the period.
- All numbers are unchanged. Every dollar figure on the five neighborhood pages and the index matches the previous build.
- **Label correction:** the rent figures were labeled "Median asking rent". Checked against the cited Elliman January 2026 PDF, all five values match, but the report measures the **median rental price of new leases signed** (excluding renewals), not asking rents. The labels now read "Median rent on new leases".
  - The metric is renamed `median-rent`.
  - An `average-rent` metric is added for sources that publish averages (Corcoran's neighborhood rent tables), ahead of the Brooklyn pages.
  - Page copy says "median" or "average" to match the figure.

**Schema** (`src/content.config.ts`, `src/lib/marketFigures.ts`)
- The flat `medianRent` / `medianRentLabel` / `medianRentAsOf` / `medianSalePrice…` fields are replaced by a `figures` list. Each figure records:
  - `metric` and `value`
  - `unitScope` (all, studio, 1br, …) and `propertyScope` (all, coop, condo, coop+condo)
  - `geo` {kind: neighborhood / broker-zone / borough / city, name, definition}
  - `period`, `label`, `source`, and `sourceUrl`
- The schema requires at least one rent figure and one sale figure.
- The five existing pages were migrated by script. Values, labels, periods, and sources were copied verbatim, with a round-trip check. The scope fields only restate what each label already said (for example, the BHS figures are resale one-bedrooms in a BHS zone).

**Quality gate** (plan §5, Phase 3)
- `test/neighborhoodFigures.test.ts` fails if a published neighborhood has fewer than 2 figures that no sibling page also shows.
- A cited figure counts if no sibling cites the same figure. Calculated figures count only when derived from a unique cited one: 1 for a rent, 2 for a sale price (co-op and condo income).
- Today, Astoria and LIC share their rent figure, so each passes on its own sale price. The Manhattan pages pass on distinct zone figures.
- The test also checks that every figure's source appears in the page's Sources list, that its period includes a year, and that wider-area figures name their area.
- `js-yaml` is now a declared devDependency. It was already installed as a transitive dependency; the test uses it to read frontmatter.

**Validation**
- `npm test`: 219/219. `npm run build`: clean.
- Dollar figures on all six neighborhood pages are identical to main.
- Browser: scope tags and source links render. No overflow at 390px. No errors under the production CSP.

## 2026-10-03: Phase 2e: Cost to move (/cost-to-move/)

**User-visible changes**
- New **`/cost-to-move/`** with three modes: a rental, a co-op you're buying, or a condo you're buying. It itemizes every dollar needed on move-in day:
  - **Rental:** first month's rent, security deposit, the $20 application fee, a broker fee only if you hired your own (FARE Act), an optional guarantor-company fee, pet and building fees, and utility setup.
  - **Purchase:** down payment, closing costs, mansion tax, mortgage recording tax (condo), the co-op move-in deposit, and board reserves.
  - **The move itself (all modes):** movers, supplies, days of paying for both places, breaking your current lease, furniture.
- Every line is sorted into one of four kinds: **spent**, **becomes equity** (down payment), **comes back later** (security deposit, co-op move-in deposit), or **stays in your account** (co-op reserves). They're shown in a sentence, a stacked bar using palette slots 1 to 4 with a legend carrying the amounts, and a tagged line-by-line table.
- **Matches the other tools:**
  - Rental signing costs match `/rent/`.
  - The purchase total matches the savings planner's cash target, plus utilities and the move.
  - A co-op's $52,528 in reserves at $600K matches the reserves guide.
- **Privacy:** no balances, income, or debts are asked for, so the share link carries the whole scenario. Inputs are saved only with "Save inputs" on.
- **Where it's linked:**
  - Rent nav menu ("Cost to move", where the brief places move-in costs)
  - homepage grid (card 13, centered on its own row)
  - every footer, `/explore/`, and the sitemap
  - the key money, guarantor, and FARE Act glossary terms
- `/methodology/sources/` gets a **Moving** group with three new registry entries, all labeled "our estimate":
  - movers: $1,500
  - supplies: $150
  - guarantor fee: 70% of one month's rent, the value used when you turn the guarantor option on. The guarantor guide reports a 60% to 110% range.

**Code**
- `src/lib/engines/moveCost.ts` (pure):
  - `renterMoveCost` uses `rentSnapshot`.
  - `buyerMoveCost` uses `calculateCoop`/`calculateCondo`.
  - The moving lines are plain addition. Zero-amount lines are dropped.

**Tests** (194 → 202; `test/moveCost.test.ts`)
- Renter signing cash equals the `/rent/` engine.
- Only the security deposit is refundable; a tenant-hired broker and the guarantor fee add up correctly.
- Overlap is prorated over a 30-day month.
- Buyer cash equals the savings planner's target, and equity equals the down payment.
- Co-op reserves are held (not spent) and the move-in deposit is refundable; condos pay mortgage recording tax.
- Mansion tax starts at $1M.
- Every dollar lands in exactly one bucket.

**Validation**
- `npm test`: 202/202. `npm run build`: clean, including `check-csp`.
- Browser checks, with the production CSP header served:
  - rental default: $9,420
  - with a tenant-hired broker, a guarantor, and 15 days of overlap: $19,570
  - co-op at $600K: $186,878 (equity, spent, back later, and held all shown)
  - condo: $146,870, with the rate field hidden
  - the Rent menu links the page
  - no `localStorage` writes with saving off
  - no page errors; no overflow at 390px
- Fixed during review: script-injected stack and legend colors needed `:global()`.

## 2026-10-03: Phase 2d: Rate & maintenance sensitivity (/rate-sensitivity/)

**User-visible changes**
- New **`/rate-sensitivity/`**, with two modes:
  - **"What if rates move?"** shows your max co-op or condo price at every quarter-point rate from 3 points below today's default to 3 above.
  - **Maintenance / common charges** does the same in $100 steps from $1,000 below your building's charges to $1,000 above.
- **Two limits, shown separately:**
  - Each point plots the **income limit** (DTI) and the **cash limit** (down payment and closing, plus board reserves for co-ops).
  - Your max price is the lower of the two, drawn as a band under the lower line.
  - The answer names which limit binds, what one step does to the max price, and where the other limit takes over (e.g. "Past 7.5%, income becomes the limit instead").
  - When cash binds, the page says rates barely matter yet. For co-ops it explains why rates still move the cash limit: the board's reserve rule counts months of mortgage payments.
- **Rate-point equivalent:** a tile converts **$100/month of maintenance into rate points** (about 0.55 points for the brief's co-op example, 0.40 for a condo).
- **Optional target price:**
  - monthly cost at the target, and how much one step changes it
  - the highest rate (or charge level) at which the target is within reach
  - when cash makes the target unreachable at any rate, a link to the savings planner
- **Chart:** legend, direct labels, a dashed target line, a marker for "now", a hover/keyboard tooltip, a text summary, and a table view with the current row highlighted. A cash line far above the range is clipped and labeled "Cash ↑".
- **Same privacy model as `/afford-more/`:**
  - Income, savings, and debts go into a share link only if you tick the box.
  - Inputs are saved only with "Save inputs" on.
  - The page reads the shared profile but never writes it unless saving is on.
- **Where it's linked:**
  - the Buy nav menu ("What if rates move?")
  - the homepage grid (card 12 completes the last row, so the centered-pair rule is gone)
  - every footer, `/explore/`, and the sitemap
  - `/afford-more/`
  - the DTI, co-op maintenance, and common-charges glossary terms

**Code**
- `src/lib/engines/sensitivity.ts` (pure): `pointAt`/`sweep` rerun `evaluatePlan` (the shared co-op/condo engine) with one input changed. Also `rateRange`, `chargesRange`, `impactPerStep` (symmetric difference), `chargesInRatePoints`, and `highestReaching`. No new formulas.

**Tests** (182 → 194; `test/sensitivity.test.ts`)
- The current point equals `evaluatePlan`, and max = min(income, cash) across cash levels.
- Higher rates and charges only lower the income limit.
- Income needed at a target equals the `/buy/` figures.
- +$100 of charges = +$100/month at the target, and one rate point equals the amortization difference.
- Cash-bound condo: charges move the income limit but not the max price.
- Co-op cash limit moves with the rate; the condo's doesn't.
- Range construction, the rate-point equivalent, and `highestReaching`.

**Validation**
- `npm test`: 194/194. `npm run build`: clean.
- Browser checks:
  - Brief example (co-op, $145K, $110K cash): $326,014, cash-bound, flipping to income-bound past 7.5%.
  - With $300K cash: income-bound, $34,143 per rate point.
  - $450K target reachable at 4.25% or lower.
  - Maintenance mode; condo common charges.
  - Condo at $900K: cash makes it unreachable at any rate.
  - No `localStorage` writes with saving off.
  - No page errors; no overflow at 1280 or 390px.
## 2026-10-03: Fix: nav dropdowns blocked by the Content-Security-Policy

**Problem**
- The journey-nav script (PR #70) worked locally but not on the deployed preview.
- Astro inlines small scripts into each page. `public/_headers` sends a CSP that allows inline scripts only by exact SHA-256 hash.
- The nav script's content changed, so its hash no longer matched. The browser refused to run it, which broke the dropdowns and the mobile hamburger.
- Local test servers send no CSP, so the bug didn't show up in local testing.

**Fix**
- `vite.build.assetsInlineLimit: 0` in `astro.config.mjs`. Astro now always emits processed scripts as files under `/_astro/`, which `script-src 'self'` already covers. Editing a script can no longer silently break it in production.
- New `scripts/check-csp.mjs`, run at the end of `npm run build` (so Cloudflare's build runs it too). It hashes every inline executable `<script>` in `dist/` and fails the build if the CSP would block one. JSON-LD is ignored.
- The CSP itself is unchanged. Its two listed hashes are now unused by the build, but one may cover something Cloudflare injects at the edge, so pruning them is a separate decision.

**Validation**
- Served `dist/` with the exact CSP from `_headers`:
  - The broken build reproduces the bug ("Refused to execute inline script…"). Dropdowns don't open, and the mobile menu doesn't open either.
  - The fixed build: dropdowns open at 1280px, and the hamburger and groups work at 390px.
  - No CSP errors on `/coop/`, `/rent-vs-buy/`, `/savings-planner/`, `/afford-more/`, `/reality-check/`, or `/compare/`.
- `check-csp` passes on the fixed build and fails on the broken one, naming the blocked hash.
- `npm test`: 182/182.

## 2026-10-03: Journey-based primary navigation

**User-visible changes**
- The navbar is organized by what you're trying to do (brief item 23), not one flat list of calculators: **Home · Start here · Rent ▾ · Buy ▾ · Own ▾ · Affordable ▾ · Neighborhoods ▾ · Learn ▾**.
  - "Start here" is the Reality Check.
  - Each dropdown opens a panel headed by the journey ("I want to rent", "I want to buy", "I already own", "I need affordable housing", "I'm comparing neighborhoods"). Panels split **Tools** (calculators and lookup pages) from **Read** (guides).
  - Only pages that exist are listed. Lease renewal, borough hubs, refinance math, and cost to move join their groups when they ship.
- **Every calculator is now reachable from the navbar**, including `/savings-planner/` and `/rent-vs-buy/`, which had been footer-and-homepage only. Guides, glossary, methodology, and the site directory are also in the navbar.
- The current page's group is underlined. Guide and glossary pages not listed individually light up Learn.
- **Accessibility:** follows the disclosure pattern (buttons with `aria-expanded`/`aria-controls`, plain links; not an ARIA menu).
  - Escape closes the panel and returns focus to its button.
  - Tabbing out of a group, clicking outside, or opening another group closes it.
  - Desktop panels are measured and shifted so they never run off the viewport.
- **Mobile (hamburger, ≤1024px):** the groups expand inline in the same menu.
- Calculator titles have more room at desktop widths: the co-op title is 287px at 1280 (263px before).

**Code**
- `src/lib/navGroups.ts`: the nav as data (`NAV`, `navHrefs`). `NavLinks.astro` renders from it. The `SiteNavigationElement` JSON-LD now lists every nav link.
- Removed `PRIMARY_NAV_CALCULATORS` and its exception list (`footerLinks.ts`), since nothing is outside the nav anymore.

**Tests** (179 → 182; `test/navParity.test.ts`)
- The nav reaches every calculator, plus guides, glossary, methodology, and `/explore/`.
- Groups are well-formed, and links are internal with trailing slashes.
- Each page sits in one group only, so one group is marked current.
- `NavLinks` renders from `navGroups`.
- These replace the flat-list and exception-list checks.

**Validation**
- `npm test`: 182/182. `npm run build`: clean.
- Browser checks:
  - Active group correct on `/`, `/coop/`, `/rent-vs-buy/`, a rent guide, and a buy guide.
  - Open/close behavior: one panel at a time, Escape returns focus, tabbing out and clicking outside close the panel.
  - Every panel stays in the viewport at 1025, 1280, and 1440px, on pages with and without the save toggle.
  - The 390px hamburger menu expands groups inline with no horizontal overflow.
  - No page errors.

## 2026-10-03: Phase 2c: NYC Rent vs Buy (/rent-vs-buy/)

**User-visible changes**
- New **`/rent-vs-buy/`**: buy a co-op or condo, or keep renting and invest what the buyer spent at closing. Each month, whoever has the cheaper housing bill invests the difference. At each year-end the buyer "sells" and pays NYC seller costs. The page shows:
  - **Your answer:** which path is ahead after your chosen stay (1 to 30 years, slider), by how much, the break-even year (searched out to 30 years when it falls beyond the stay), and the **break-even rent** (the starting rent at which both paths finish even over that stay).
  - **A net-worth chart** (legend, direct labels, break-even dot, hover/keyboard tooltip, text summary, yearly table view) using the validated palette pair (orange/blue).
  - **Where the money goes:** cash at closing, housing bills paid, sale price, loan payoff, selling costs, investments, and net worth, side by side.
  - Every output is labeled as a calculated estimate; the growth and return rates are labeled placeholders, not forecasts. "What's left out" spells out the omissions: income taxes both ways, refinancing, assessments, the co-op move-in deposit refund, and the value of flexibility.
- The share link carries the whole scenario. It has no personal fields (no income, balances, or debts), so there is no opt-in checkbox. Inputs are saved only with "Save inputs" on.
- Linked from the homepage grid (cards 10 and 11 now a centered pair), every footer, `/explore/`, the sitemap, `/savings-planner/`, and the flip-tax, co-op maintenance, and common-charges glossary terms. Not in the primary nav; it joins `/savings-planner/` on the pinned exception list until the journey-based nav lands.
- `/methodology/sources/` gains **Selling** and **Long-run projections** groups. The savings yield moved from "Mortgage" to the projections group, which is where it belongs.

**Code**
- `src/lib/engines/sale.ts`: `/sell/`'s waterfall moved **verbatim** out of `src/scripts/sell.ts` (which now imports it). Browser check: `/sell/` page text is identical before and after in 4 scenarios (condo, co-op, capital gains on, co-op over $3M with capital gains).
- `src/lib/engines/rentVsBuy.ts` (pure): `purchaseFor` (closing cash and payment from the shared co-op/condo engines), `compareRentVsBuy` (monthly projection with PMI dropping off at 78% of the price), and `breakEvenRent` (bisection).
- Registry: `/sell/` defaults (broker 5%, attorney $2,500, title/misc $1,000, flip tax 2%, co-op transfer fee $500) with `inputs` on page `sell`, so the parity test now covers `/sell/`. Five illustrative projection entries: rent growth 3%, home price change 3%, owner cost growth 3%, in-unit upkeep 0.5% of value, and investment return 5%.

**Tests** (162 → 179)
- `test/rentVsBuy.test.ts`: `/sell/` golden waterfalls (condo, co-op, capital gains with the single/MFJ exclusion); purchase cash and payment equal the condo engine and the amortization formula; the loan reaches zero at term and matches the closed-form balance at year 1; zero-growth bookkeeping matches by hand; the cheaper side invests the difference; the co-op flip tax gap; yearly vs. monthly compounding; PMI drop-off; break-even rent ties at the horizon and is monotone; and the break-even year is the first year ahead.
- `test/defaultsParity.test.ts`: plus 5 `/sell/` input checks.

**Validation**
- `npm test`: 179/179. `npm run build`: clean (134 pages).
- Browser checks:
  - Default (condo $700K vs. $4,000): renting ahead by $206,108 after 10 years; break-even rent $5,179/mo.
  - Co-op at $5,500 rent: buying pulls ahead in year 4.
  - A 1-year stay; a 30-year stay with prices falling 2%/yr.
  - Tooltip renders; no page errors; no horizontal overflow at 1280 or 390px.
  - The homepage grid's last row is centered.

## 2026-10-02: Phase 2b: Down Payment Savings Planner (/savings-planner/)

**User-visible changes**
- New **`/savings-planner/`**: "How long until I can afford to buy?" Inputs are target price, savings, monthly contribution, yield, income, debts, an emergency fund to keep, and an optional "buy by" month, plus assumptions (income growth, price growth, rate, down payment, charges, DTI, board reserves). The page shows:
  - **Your answer:** the buy date, or the honest reason there isn't one ("At $145,000, your income doesn't clear the 28% DTI limit for a $450,000 co-op…"), plus cash needed today, the gap, income needed, and what's in your accounts after closing.
  - **Target date:** the monthly savings needed, and whether income would still block it.
  - **Co-op vs. condo at the same price**, showing the cost of board reserves in months.
  - **A chart** of savings vs. cash needed (legend, direct labels, crossing dots, hover/keyboard tooltip, text summary, yearly table view), using the dataviz reference palette (validated; the aqua contrast warning is covered by the labels and table).
  - **A line-by-line breakdown** of the cash needed.
- Income and price growth default to 0%, so the date doesn't count on raises or a flat market. The savings yield default (3%) is a registry entry labeled "our estimate".
- Same privacy model as `/afford-more/`: savings and income go into a share link only if you tick the box; inputs are saved only with "Save inputs" on.
- Linked from the homepage grid (10th card, centered), every footer, `/explore/`, the sitemap, `/afford-more/`, and the post-closing-liquidity and good-faith-deposit glossary terms. **Not added to the primary nav** (see below).

**Nav policy**
- A 12th nav item would squeeze calculator titles again. `PRIMARY_NAV_CALCULATORS` (in `footerLinks.ts`) now lists the tools that get a navbar slot, and `test/navParity.test.ts` checks the navbar against it. It also pins the current exceptions (`/savings-planner/`), so a new tool can't skip the nav without someone deciding it. A journey-based nav (brief item 23) is the real fix.

**Code**
- `src/lib/engines/savings.ts` (pure): `cashNeeded` (from the shared engine), `planSavings` (monthly projection; ready = cash **and** income), and `monthlyNeededFor` (closed-form annuity).
- `src/scripts/savings-planner.ts`: rendering and the SVG chart.

**Tests** (151 → 162)
- `test/savings.test.ts`: the cash target equals the `/buy/` figures at the same price; co-op reserves ($52,528 at $600K, matching the reserves guide) vs. condo MRT; mansion tax at $1M; compound math against the closed form; exact zero-yield ready month; income as the blocker; co-op takes longer than condo; price growth pushes the date out and raises land on anniversaries; and `monthlyNeededFor` lands exactly on the target.

**Validation**
- `npm test`: 162/162. `npm run build`: clean.
- Browser: default scenario (condo, ready Jul 2027 with $15,000 emergency fund), co-op switch ("Out of reach on current income"), target-date line, tooltip, table, share link without personal numbers, no `localStorage` writes with saving off, no page errors, no external requests, and no overflow at 1280 or 390px.
- The calculator browser snapshot is identical to the end of Phase 1.

## 2026-10-02: Phase 2a: "How do I afford more?" (/afford-more/)

**User-visible changes**
- New **`/afford-more/`**. Enter income, monthly debts, cash, and investments (plus optional assumptions and a target price) for a co-op or condo. The page shows:
  - the maximum price, and which limit binds, in a plain sentence ("Your income supports a $336,759 co-op, but your cash, once the board's 12-month reserve requirement is set aside, supports only $326,014.")
  - every applicable lever ranked by the dollars it adds or removes, each with an explanation; levers with no effect are listed separately with the reason
  - with a target price: the extra cash and extra income needed, computed independently, plus the debt-payoff equivalent when that's enough
- Share link: assumptions only by default; income, savings, and debts are added only if the visitor ticks the box. Inputs are saved only with "Save inputs" on, and turning it off clears them. Print styles included. Results are announced to screen readers via `aria-live`.
- Added to the primary nav ("Afford More"), every footer's calculator list, the homepage grid (9 cards, now three full rows), `/explore/`, the sitemap, and the DTI and post-closing-liquidity glossary terms. The Reality Check links to it.
- Nav: "Affordable Housing" is shortened to "Affordable" (footer and page titles unchanged) and nav item padding drops from 10px to 8px, so calculator titles keep the same visible width at 1280px despite the extra item (measured 262→263px).

**Code**
- `src/lib/engines/levers.ts` (pure): `evaluatePlan` (the shared co-op/condo engine), `leversFor`, `rankLevers`, and `gapToTarget`. Each lever changes one input and reruns the same engine; no new formulas.
- `src/scripts/afford-more.ts`: rendering, URL/saved/shared-profile input precedence, and the share link.

**Tests** (138 → 151)
- `test/levers.test.ts` uses the brief's scenario ($145K, $110K saved, $400/mo debt). It checks that the result equals a direct engine call; that the co-op is reserve-bound below the DTI ceiling; that income and debt levers do nothing while cash binds; that saving helps only until DTI binds; that a bigger down payment lowers a reserve-bound ceiling; that lower maintenance helps even when cash binds; that levers are ranked; that lever availability matches the situation (no reserves lever for condos, no sub-20% lever for co-ops); that PMI makes a smaller condo down payment backfire; and that target gaps close exactly ($1 less doesn't).

**Validation**
- `npm test`: 151/151. `npm run build`: clean.
- Browser (Playwright): the default scenario shows $326,014 (matches the engine); the target gap, type switch, and share link (with and without personal numbers) work, and a reloaded link reproduces the scenario; `localStorage` stays empty with saving off; no page errors; **no requests to other origins**; no horizontal overflow at 1280 or 390px.
- The calculator browser snapshot (24 scenarios) is identical to the end of Phase 1.

## 2026-10-02: Phase 1e: guide worked examples checked against the engine

**User-visible changes**
- None to the guides' visible text: every quoted figure already matched the current engine. The closing-costs guide's "full sourcing methodology" link now points to `/methodology/sources/` instead of `/about/`.

**Code**
- `test/guideExamples.test.ts` recomputes every default-dependent figure quoted in four guides, using the same engine and registry the calculators use:
  - *How mortgage rates affect affordability*: both rate tables, row by row (the bold row must be the current default rate), the meta description, the 6.3%→current deltas, and the rate and survey date.
  - *Income needed to buy*: the $700K table, the ~$73,000 gap, the 6.3%→current effect, and the median co-op calibration (reads the cited median from the Affordability Index).
  - *Co-op board reserves*: the $600K P&I, carrying cost, 12- and 24-month reserves and totals, and the 6.25%→current effect.
  - *Closing costs for buyers*: the mortgage recording tax and mansion tax lines (the fee lines are the guide's own illustration and aren't checked).
- Each test lists **every** stale figure in a guide at once, with the exact replacement text. Checked by simulating a rate change to 6.50%: all four guides failed with their full update lists.
- Each checked section has an HTML comment pointing editors to the test (not visible on the page).

**Validation**
- `npm test`: 138/138. `npm run build`: clean.
- Visible text of the three engine-dependent guides is identical to the Phase 1d build; the closing-costs guide differs only in the repointed link.

## 2026-10-02: Phase 1d: methodology, sources & data status, content cross-links

**User-visible changes**
- New **`/methodology/`**: what's cited vs calculated; laws vs conventions vs our own estimates; the binding-constraint logic; one shared engine running in the browser; how defaults are reviewed and how stale data is shown; why a lender or board may disagree; and how to report an error.
- New **`/methodology/sources/`**: generated from `src/data/assumptions.ts` and the new `src/data/sourceTables.ts`. It lists every default (value, basis, source, effective date, last verified, the calculators that use it), every tax table and income limit, and the cited market data. Its summary states the actual numbers: 35 defaults, 20 of them our own estimates, 5 with a source URL, and 1 with a recorded re-verification date. Elsewhere it says "Not yet re-verified" rather than show an unbacked date.
- **About page:** corrected the claim that every default "is pulled from a named, checkable source rather than invented" (20 are our estimates) and the claim that each page notes when a figure was last checked. Both now point to the sources page.
- The footer About column on every page gains **Methodology & Sources**. The five calculators' "full sourcing methodology" links now go to `/methodology/sources/` instead of `/about/`.
- **Glossary pages** gain a "Run the numbers" block linking the calculators that compute each term (new `relatedCalculators` field, restricted to real calculator paths).
- Related links: the 485-x and rent-stabilization glossary terms now link to their own guides; the closing-costs and board-approval guides now link the good-faith-deposit, certificate-of-occupancy, sponsor-unit, and sublet-policy terms. `updated` dates were not bumped, since the body text is unchanged.

**Tests** (121 → 130)
- `test/contentLinks.test.ts`: every related guide/term slug resolves to a published entry (checked by adding a bad slug, which made it fail); every published guide and term has at least one inbound related link; every glossary term names at least one calculator; every guide CTA points at a calculator; and `CALCULATOR_PATHS` matches `ALL_CALCULATORS`.

**Validation**
- `npm test`: 130/130. `npm run build`: clean, 131 pages (sitemap 130 URLs).
- The calculator browser snapshot (24 scenarios) is identical to the Phase 1c build.
- Screenshots: `/methodology/sources/` at 1280 and 390px (on phones the table rows stack into labeled cards), `/methodology/`, and a glossary page. No horizontal overflow and no page errors.

## 2026-10-02: Phase 1c: navigation and footer parity, /explore/ site directory

**User-visible changes**
- The footer's **Explore** column (glossary, income, buy, rent, neighborhoods, index, salary, site directory) now appears on the 10 pages that lacked it: `/coop/`, `/condo/`, `/rent/`, `/affordable/`, `/compare/`, `/sell/`, `/about/`, `/contact/`, `/privacy/`, and `/terms/`.
- The homepage "choose your calculator" grid now includes **Reality Check**, listed first as the start-here tool, so it shows all 8 tools. The last row (Sell, Required Salary) is centered.
- New **`/explore/`** site directory: every calculator, guide (by topic), glossary term, income/salary/buy/rent page, neighborhood (by borough), the Affordability Index, and the about/legal pages. It's generated from the same collections and numeric grids that create those pages, so new pages appear automatically. It's linked from every footer's Explore column and is in the XML sitemap with a `lastmod` taken from the newest content entry. It has no ads.

**Not done (on purpose)**
- BreadcrumbList on the calculators. Visible breadcrumbs and their JSON-LD were removed from the calculators in #32 when the global navbar went in. Adding the JSON-LD back without visible breadcrumbs would mark up content that isn't on the page. Bringing them back is a design call, not a hygiene fix.

**Tests** (88 → 121)
- `test/navParity.test.ts`: every page that renders a `<Footer>` includes the Explore column (checked by removing it from `/terms/`, which made the test fail); the Explore links include `/explore/`; the homepage grid has a card for every calculator; and the primary nav links every calculator.

**Validation**
- `npm test`: 121/121. `npm run build`: clean, 129 pages (sitemap 128 URLs, +1 for `/explore/`).
- The calculator browser snapshot (24 scenarios) is identical to the Phase 1b build.
- Screenshots: the homepage grid at 1280/900/390px and `/explore/` at 1280/390px, with no horizontal overflow at any width.

## 2026-10-02: Phase 1b: one shared engine for co-op, condo, and rent math

**User-visible changes**
- `/compare/` and `/reality-check/` now apply PMI when the saved or adjusted down payment is under 20%, matching `/coop/` and `/condo/`. Example (default /compare/ profile at 10% down): co-op max $386,066 → **$354,800**, condo max $511,957 → **$470,495**. `/coop/` already showed $354,800 for that profile, so the two pages now agree.
- Nothing else changes on any page (see Validation).

**Code**
- New `src/lib/engines/{coop,condo,rent}.ts`: the calculators' pure math, moved verbatim from `src/scripts/{coop,condo,rent}.ts`. The page scripts import it under the old local names. The condo engine takes its two page toggles (reserves, working capital) as inputs instead of reading module state.
- New `src/lib/engines/defaults.ts`: builds complete engine inputs from `src/data/assumptions.ts`. It's used by `/compare/`, `/reality-check/`, and `afford.ts`.
- `compare.ts` and `reality-check.ts`: their duplicated formulas and tax tables are removed, and they call the engines.
- `afford.ts`: now a thin wrapper over the engines, so the build-time pages run the calculators' code.
- `assumptions.ts`: +9 entries (rent fees, the security deposit and application-fee caps, renter's insurance, rent DTI and reserves, condo reserve and working-capital months).
- `rent.ts`: an unused 19-field `DEFAULTS` copy was replaced with the sample accounts it actually used.

**Tests** (64 → 88)
- `test/engines.test.ts`: goldens for each binding constraint (co-op reserves / DP+closing / DTI; condo DTI / reserves; rent 40x / move-in cash / DTI screening), PMI below 20% down, working capital, and broker fees. It also checks that every hidden field `/compare/`, `/reality-check/`, and the build-time pages use equals the calculator page's default (verified by changing `#broker-pct`, which made the test fail).
- The parity test now reads `<select>` defaults too.

**Validation**
- Browser snapshot (Playwright on the built site; script and outputs kept out of the repo): 24 scenarios across `/coop/`, `/condo/`, `/rent/` (every tab), `/compare/`, and `/reality-check/`, comparing every leaf element's text before vs after. **22 scenarios are byte-identical.** The other 2 (`/compare/` and `/reality-check/` at 10% down) differ only in the 10 PMI-affected max-price and cash fields listed above. No page errors.
- `npm test`: 88/88. `npm run build`: clean, 128 pages.
- `tsc --strict` on all changed TS: no new errors. One pre-existing error in `compare.ts` (`ProfileState` vs `SharedProfile`) is unchanged and also present on the base commit.
- JS weight: `/compare/` and `/reality-check/` grow by about 17 KB raw (12.3 KB raw / 3.3 KB gzip of it is the shared assumptions registry with its source notes). `/coop/`, `/condo/`, and `/rent/` are within ±0.2 KB.

## 2026-10-02: Phase 1a: assumptions registry, engine tests, sitemap lastmod, transfer-tax wording

**User-visible changes**
- `/buy/<price>/` and `/income/<n>/` co-op cash estimates rise by **$1,800**. They now include the move-in deposit ($1,000) and other fixed fees ($800) that the `/coop/` calculator already counts. Example: `/buy/500000/` co-op closing costs go from $8,750 to $10,550, and total cash from $154,923 to $156,723. Condo figures are unchanged.
- `/sell/` and the seller closing-costs guide now correctly describe the 0.25% on $3M+ NYC residential sales as a **NYS "additional base tax"** (NY Tax Law §1402(a)(2)), not a city tax. The math is unchanged.
- Sitemap: every guide, glossary, and neighborhood URL now has a `<lastmod>` taken from its own `updated` frontmatter. The `/guides/`, `/glossary/`, and `/neighborhoods/` hubs use their newest entry's date.

**Code**
- `src/data/assumptions.ts` (new): registry of every default the build-time engine uses, with `basis`, `sourceOrg`, `sourceUrl`, `effectiveDate`, `lastVerified`, `notes`, and the calculator `<input>` each value backs. `lastVerified` is `null` wherever no check date was recorded.
- `src/lib/afford.ts`: reads its defaults from the registry, and the co-op fixed closing costs now sum all five calculator fees. Imports now use `.ts` extensions so Node's test runner can load it.
- `astro.config.mjs`: one frontmatter reader per collection (drafts + `updated` dates) replaces the three draft-only readers.
- `src/lib/calc.ts`: comment correction only.

**Tests** (18 → 64)
- `test/calc.test.ts`: mansion-tax tiers and cliff, MRT bracket, PMI tiers, RPTT, NYS transfer tax, bsearch.
- `test/afford.test.ts`: goldens at representative incomes and prices, the DTI round-trip boundary, debt impact, the mansion-tax threshold in cash, reserves, condo-only MRT, and a co-op closing-cost regression test. The regression test was written first and failed before the fix.
- `test/defaultsParity.test.ts`: fails if any calculator `<input value>` disagrees with the registry. Checked by changing `#fc-other` to 900, which made it fail.

**Validation**
- `npm test`: 64/64 pass. `npm run build`: clean, 128 pages.
- I diffed the built `dist/` against a baseline build of the previous commit, ignoring hashed asset names. Content changed only on `/buy/*` and `/income/*` (the co-op cash rows), `/sell/`, the seller-costs guide, and `sitemap.xml`.
