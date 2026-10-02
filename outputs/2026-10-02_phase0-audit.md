# Phase 0 audit: nyc-affordability.com

**Date:** 2026-10-02
**Branch audited:** `claude/gracious-brahmagupta-vjjat0` at `f5a3fd4` (identical to `main` at audit time)
**Method:** read source, ran `npm ci && npm run build && npm test`, parsed `dist/` (built HTML + `dist/sitemap.xml`). No site files were modified during the audit.

Build: clean, 128 pages. Tests: 18/18 pass (all in `test/salaryCalc.test.ts`).

---

## 1. Repo map

| Area | Where | Notes |
|---|---|---|
| Framework | Astro 7, static output, `trailingSlash: 'always'`, `build.format: 'directory'` | `astro.config.mjs` |
| Hosting | Cloudflare Workers static assets + `functions/[[path]].js` (www redirect / host routing) | `wrangler.toml`, `public/_headers` (CSP, HSTS, cache rules) |
| Routes | `src/pages/` | 8 calculators + home; hubs for guides, glossary, income, salary, buy, rent/prices, neighborhoods; `[slug]`/`[amount]`/`[price]` generators |
| Content collections | `src/content/{guides,glossary,neighborhoods}` | Schemas in `src/content.config.ts`; every entry has `updated`, `sources[]`, `draft` |
| Numeric grids | `src/data/priceGrids.ts` | `INCOME_AMOUNTS` (shared by `/income/` **and** `/salary/`), `RENT_PRICES`, `BUY_PRICES` |
| Index data | `src/data/affordabilityIndex.ts` | One snapshot (`2026-08`); condo median `null` with an honest note |
| Pure calc libs | `src/lib/calc.ts` (MRT, PMI, mansion tax, RPTT, NYS transfer, bsearch), `src/lib/afford.ts` (build-time landing-page math), `src/lib/salaryCalc.ts` + `salaryTaxConstants2026.ts` (tax engine), `src/lib/amiTable.ts` (HUD FY2026) | Only `salaryCalc` has tests |
| Client calculators | `src/scripts/*.ts` | coop 2,114 lines, condo 1,428, rent 1,079, compare 658, required-salary 634, affordable 429, reality-check 341, sell 238 |
| Local profile | `src/lib/sharedProfile.ts` (`nyc_shared_profile`: income, debts, accounts) + per-calculator `nyc_shared_assumptions_*` keys | Opt-in "Save inputs" toggle; no export/import, no named scenarios |
| Sharing | `src/lib/share.ts` (Web Share / clipboard of a text summary). Co-op alone restores state from a URL **hash** (`coop.ts:197`) | No query-param scenarios on other tools |
| SEO | `SEOHead.astro` (canonical, OG, Twitter, JSON-LD + ImageObject), `lib/breadcrumbs.ts`, `@astrojs/sitemap` + `scripts/rename-sitemap.mjs` | Sitemap is already generated from routes, not hand-listed |
| Nav/footer | `NavLinks.astro` (shared by `SiteHeader`/`AppHeader`), `Footer.astro` + `lib/footerLinks.ts` | Footer columns are assembled per page |
| Ads | `lib/adsConfig.ts` → `ADS_ENABLED = false` | AdSense code paths still present and allowed in CSP |
| Tests | `node --test` with `--experimental-strip-types`, `test/*.test.ts` | Playwright installed, unused |
| CI | **None** (no `.github/`) | |

---

## 2. Verification of the brief's findings table

| # | Brief said | Source says | Verdict |
|---|---|---|---|
| 1 | Homepage nav lacks Reality Check/Sell/Required Salary; "Five tools" copy; footer has 7 of 20 guides and no Explore; home `lastmod` 2026-05-02 | Homepage nav has all 10 items (`NavLinks.astro`). No "five/six/seven tools" copy anywhere in `src/`. Homepage footer has all 20 guides **and** Explore. Home `lastmod` really is hard-coded `2026-05-02` (`astro.config.mjs:10`). | **Mostly wrong against source.** Production was probably running an older deploy when crawled; confirm what's deployed. What is real: (a) stale hand-set `lastmod`s; (b) the homepage "choose your calculator" grid has 7 of 8 tools (Reality Check only appears as a persona card); (c) **footer parity is broken on inner pages, not the homepage**: no Explore column on `/coop/ /condo/ /rent/ /affordable/ /compare/ /sell/ /about/ /contact/ /privacy/ /terms/`. |
| 2 | Child pages have no `lastmod` | Confirmed: 106 of 127 URLs have no `lastmod` (25 glossary, 20 guides, 17 income, 17 salary, 13 buy, 9 rent, 5 neighborhoods). Every content entry has a real `updated` date in frontmatter that the sitemap never reads. | **Confirmed.** Easy fix for collections. Programmatic pages have no honest per-page date; see the plan. |
| 3 | No Brooklyn/Bronx/SI neighborhoods; 5 total | Confirmed. Also: **Astoria and LIC show the identical rent figure ($3,754)**. Both use Elliman's "Northwest Queens" zone, and both pages disclose that. | **Confirmed.** Relevant to the Phase 4 quality gate: many neighborhoods will share a broker zone. |
| 4 | Two figures, different dates; one guide + one term each | Confirmed for all 5 (rent Jan 2026; sale Q2/1H 2026; 1 `relatedGuides`, 1 `relatedTerms`). Dates are per-metric and labeled, which is good. | **Confirmed.** |
| 5 | Index: one snapshot, no condo, hand-edited | Confirmed. The page **does not** promise a trend it can't show: it says it needs two points and hides the sparkline (`affordability-index/index.astro:117-122`). | **Partly wrong** (the page is already honest). |
| 6 | Sparse buckets, identical across `/salary/` and `/income/` | The buckets are identical (both import `INCOME_AMOUNTS`), but **the pages are not duplicates**: `/salary/<n>/` covers take-home tax by filing status, and `/income/<n>/` covers rent/co-op/condo affordability. Gaps confirmed ($70K/110K/130K/140K/160K; rent $1,500 and $5,500). | **Premise partly wrong.** No need for a 401(k) variant "to differentiate". Cross-linking is the gap. |
| 7 | CEMA, pied-à-terre, guarantor, deposit, 485-x guides have no companion tool | Each has a CTA, but only to a generic calculator (`/condo/` or `/rent/`) that doesn't model the guide's subject. No CEMA glossary entry. | **Confirmed.** |
| 8 | `/sell/` calls the $3M+ 0.25% an "additional NYC tax" | Confirmed in **3 places**: `src/pages/sell/index.astro:131,235`, `src/content/guides/nyc-seller-closing-costs-explained.md:37`, and the comment in `src/lib/calc.ts:83`. It is a **New York State** tax (the "additional base tax", NY Tax Law §1402(a)(2), effective July 1, 2019) that applies only to NYC conveyances: $1.25 per $500 (0.25%) on residential consideration ≥ $3M, paid by the seller. The math is correct; only the attribution is wrong. | **Confirmed. Wording fix only.** |
| 9 | About credits "lafronzt" only; no reviewer/changelog/corrections | Confirmed (`about/index.astro:112`). No methodology page, changelog, or corrections policy. | **Confirmed.** |
| 10 | JSON-LD unverified | See section 5. | **Audited.** |

---

## 3. Calculation architecture: the main finding

### 3a. The same formulas are implemented six times

| Copy | Used by | Imports `lib/calc.ts`? |
|---|---|---|
| `src/scripts/coop.ts` `calculate()` | `/coop/` | yes |
| `src/scripts/condo.ts` `computeCC()`/`priceAtDp()` | `/condo/` | yes |
| `src/scripts/rent.ts` | `/rent/` | no |
| `src/lib/afford.ts` | home, `/income/`, `/buy/`, `/rent/<n>/`, neighborhoods, `miniCalc` widget | yes |
| `src/scripts/compare.ts` | `/compare/` | **no**: its own pmt, MRT, mansion-tax copies |
| `src/scripts/reality-check.ts` | `/reality-check/` | **no**: its own copies |

Each file's header says it "mirrors, does not import" the others, and "there is no automated sync." That is the root cause of the drift risk the brief suspected.

### 3b. Inconsistencies found (with identical default inputs)

1. **Co-op fixed closing costs are understated on every build-time page.** The `/coop/` calculator sums five fixed fees: attorney $4,000 + bank attorney $1,500 + co-op fees $750 + move-in $1,000 + other $800 = **$8,050**. `afford.ts:47` sums only the first three, **$6,250**. Result: every `/buy/<price>/` co-op "estimated cash needed" figure, and neighborhood "cash to buy" figures, are **$1,800 too low** compared with the calculator they link to. `compare.ts` and `reality-check.ts` use the correct $8,050.
2. **`/compare/` ignores PMI.** `compare.ts` has no PMI term in its DTI or reserve math; `coop.ts`, `condo.ts`, and `afford.ts` do. At the 20% default, PMI is 0, so the outputs match. Below 20% down, `/compare/` overstates buying power compared with `/coop/` and `/condo/`. (`reality-check.ts` should be checked for the same issue when its engine is unified.)
3. **The 6.95% rate default is duplicated in ~12 files** (calculator inputs, `afford.ts`, `compare.ts`, `reality-check.ts`, and 6 guides with prose worked examples). One rate change already required a multi-file PR (#58).
4. **Homepage vs `/income/` match in the source build.** The homepage table and `/income/{75000,150000,250000}/` render identical values ($1,875/$103,860/$68,453; $3,750/$434,324/$575,952; $6,250/$874,943/$1,252,616), because both call `afford.ts`. If production shows a mismatch, it's a stale deploy, not a code bug.

### 3c. Assumption provenance

Defaults are cited in `<small>` help text, often **by name only, without a URL** (e.g. "Prevu, YRE, 2025"; "Elliman/Miller Samuel Q4 2024"). Some are explicitly "illustrative citywide estimate" (condo common charges, title insurance). A central registry must represent that honestly (`basis: 'illustrative'`, `sourceUrl: null`) rather than inventing a citation.

### 3d. Tax tables spot-checked (correct)

`calc.ts` mansion-tax tiers ($1M/2M/3M/5M/10M/15M/20M/25M; whole-price, not marginal), MRT (1.80% < $500K loan, 1.925% ≥ $500K, borrower share, condos only), RPTT (1.00% / 1.425% above $500K), and NYS transfer (0.4% + 0.25% ≥ $3M residential). None of these have tests.

---

## 4. Test coverage

| Module | Tests |
|---|---|
| `salaryCalc.ts` | 18 tests |
| `calc.ts` (mansion/MRT/PMI/RPTT/transfer) | **none** |
| `afford.ts` (all programmatic pages) | **none** |
| `amiTable.ts` | **none** |
| All `src/scripts/*` engines | **none** (DOM-coupled, so not importable in Node as written) |

---

## 5. Structured data (built HTML)

| Page type | JSON-LD present | Gaps |
|---|---|---|
| Home | WebSite, SiteNavigationElement, ImageObject | fine |
| 8 calculators | WebApplication (+Offer), SiteNavigationElement | **No BreadcrumbList.** `/coop/` alone also has FAQPage + HowTo (HowTo rich results are retired by Google; harmless but dead weight). Need to confirm the FAQ text is visible on the page. |
| Guides | Article, BreadcrumbList | No FAQPage. Add only where a guide has a visible Q&A section. |
| Glossary | DefinedTerm / DefinedTermSet, BreadcrumbList | good |
| income/salary/buy/rent pages | Article, BreadcrumbList | fine |
| Neighborhoods | Article, BreadcrumbList | could add `Place` with `containedInPlace` borough |
| Affordability Index | Dataset, BreadcrumbList | good; add `distribution` once downloads exist |

No fake ratings anywhere. `SiteNavigationElement` on every page isn't used by Google, but it's harmless.

## 6. Privacy

- No `fetch`/XHR/beacon calls in client code. Inputs persist only in `localStorage`, and only when "Save inputs" is on.
- Cloudflare Web Analytics is allowed by the CSP and is cookieless. It doesn't read form values, but it is a third-party script on calculator pages.
- **AdSense:** disabled (`ADS_ENABLED = false`), but the loader, CSP allowances, and `ads.txt` remain. Re-enabling it would put a third-party script with full DOM access on pages that hold financial inputs, which conflicts with the "no third-party scripts that could read inputs" constraint. **This is a decision for you** (see the questions in the plan).
- Co-op's URL-hash share encodes the full inputs, including account balances. That conflicts with item 22 of the brief ("don't encode balances by default").

## 7. Core Web Vitals risks

- CSS is inlined (`inlineStylesheets: 'always'`), so it isn't render-blocking.
- The largest JS chunks are 38 KB and 36 KB (co-op and condo), unminified-equivalent sizes. That's fine for INP/LCP. The main risk is the long synchronous `calculate()` + binary searches on every input event in co-op (optimizer grid). Measure INP before adding more levers.
- OG images are ~1731×909 PNGs, used only as `og:image`, so they don't affect page weight.

---

## 8. Things in the brief that need a decision or are out of date

- Finding 1 should be re-crawled after the next deploy. The source is ahead of what was crawled.
- Finding 6's remedy (a 401(k) variant to differentiate `/income/`) isn't needed: `/income/` and `/salary/` already serve different intents.
- The two briefs conflict on gating: the first says to wait for approval after Phase 0; the second says to "produce a short plan… then begin Phase 1". I followed the later message and started Phase 1, scoped to a single small, test-first PR (see the plan).
