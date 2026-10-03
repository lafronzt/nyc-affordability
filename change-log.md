# Change log

Multi-file changes, newest first. Each entry gives the user-visible effect and how it was validated.

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
