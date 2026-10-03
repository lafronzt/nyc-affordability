# Change log

Multi-file changes, newest first. Each entry gives the user-visible effect and how it was validated.

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
