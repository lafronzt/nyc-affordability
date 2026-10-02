# Implementation plan

Companion to `outputs/2026-10-02_phase0-audit.md`. It merges the two briefs (the "Expansion Prompt" and the "NYC Housing Financial Decision Platform" brief). Phase numbering follows the **second** brief, since it is the later instruction. Each phase ships as one or more small PRs, and none merge without your review.

Effort: S ≤ ½ day, M ≈ 1–2 days, L ≈ 3+ days. Impact: how much it improves correctness, trust, or reach.

## 1. Current architecture (one paragraph)

Astro 7 static site on Cloudflare Workers. Interactive calculators are large DOM-coupled scripts in `src/scripts/`. Build-time pages (`/income/`, `/buy/`, `/rent/<n>/`, neighborhoods, homepage table) use `src/lib/afford.ts`, a hand-maintained mirror of the calculator math. `/compare/` and `/reality-check/` hold a third and fourth copy. Pure tax helpers live in `src/lib/calc.ts`. The salary/tax engine (`salaryCalc.ts`) is the only well-factored, tested module, and it is the template to follow.

## 2. Single sources of truth to create

| Concern | New / promoted module | Replaces |
|---|---|---|
| Sourced defaults | `src/data/assumptions.ts` (registry; schema below) | literals in `afford.ts`, `compare.ts`, `reality-check.ts`, page `<input value>`s |
| Tax/fee tables | `src/lib/calc.ts` (keep), tested | copies in `compare.ts`, `reality-check.ts` |
| Co-op engine | `src/lib/engines/coop.ts` (pure `calculateCoop(inputs)`) | `coop.ts calculate()`, `afford.ts`, `compare.ts`, `reality-check.ts` co-op parts |
| Condo engine | `src/lib/engines/condo.ts` | same pattern |
| Rent engine | `src/lib/engines/rent.ts` | same pattern |
| Profile | `src/lib/profile.ts` (versioned schema, named scenarios, import/export) | `sharedProfile.ts` + per-calc assumption keys (with migration) |

Extraction rule: **characterization tests first.** Capture current outputs as golden fixtures, move the code, and the fixtures must still pass. Only then fix known drift, each fix with a failing test first.

## 3. Proposed data schemas

```ts
// src/data/assumptions.ts
type Basis = 'law' | 'official-data' | 'market-survey' | 'convention' | 'illustrative';
interface Assumption<T = number> {
  id: string;               // 'coop.maxDtiPct'
  value: T;
  unit: '%' | 'USD' | 'USD/mo' | 'years' | 'months' | 'x';
  label: string;
  basis: Basis;             // honesty about what kind of number this is
  sourceOrg: string | null; // 'Freddie Mac'
  sourceUrl: string | null; // null when the site cites by name only; never invented
  effectiveDate: string | null; // when the figure applies (e.g. PMMS week)
  lastVerified: string;     // when someone last checked it
  notes?: string;
  history?: { value: T; effectiveDate: string }[];
}
```

```ts
// neighborhood metric (Phase 3): replaces the flat medianRent / medianSalePrice fields
interface MarketFigure {
  value: number;
  metric: 'median-asking-rent' | 'median-sale-price' | ...;
  unitScope: 'all' | 'studio' | '1br' | '2br' | '3br+';
  propertyScope: 'all' | 'coop' | 'condo' | 'coop+condo';
  geoScope: { kind: 'neighborhood' | 'broker-zone' | 'borough' | 'city'; name: string; definition?: string };
  period: string;          // 'January 2026', 'Q2 2026'
  source: string; sourceUrl: string;
  retrieved: string;       // date verified
}
```

The Affordability Index becomes `src/data/index-history.json`, an append-only array of `{ period, metrics: MarketFigure[] }`. Calculated metrics are derived at build time and never stored.

## 4. Proposed new routes

| Route | Phase | Notes |
|---|---|---|
| `/methodology/`, `/methodology/sources/` (data status), `/methodology/changelog/` | 1 (status page), 5 | status page renders the assumptions registry directly |
| `/afford-more/` | 2 | optimizer: levers ranked by Δ max price; each lever links to its math |
| `/savings-planner/` | 2 | |
| `/rent-vs-buy/` | 2 | |
| `/rate-sensitivity/` | 2 | includes the maintenance/common-charge sensitivity mode (brief items 15+16 share one engine) |
| `/cost-to-move/` | 2 | renter + buyer modes; absorbs the "closing-cost estimator" and "guarantor/move-in" tools from brief 1 |
| `/lease-renewal/` | 3 | RGB limits as a dated registry entry |
| `/manhattan/` `/brooklyn/` `/queens/` `/bronx/` `/staten-island/` | 3 | borough hubs |
| `/neighborhoods/compare/<a>-vs-<b>/` | 3 | only when both have non-shared figures |
| `/ami/<pct>/` | 3 | only if each band gets unique rent/income tables; otherwise a single richer `/affordable/` |
| `/plan/` | 5 | "My NYC Plan" dashboard; evolves `/compare/` (keep the URL, add a redirect only if renamed) |
| `/explore/` | 1 | HTML sitemap / directory |

Existing URLs are unchanged.

## 5. Phases

### Phase 1: Foundation (several small PRs)

| PR | Scope | Files (main) | Effort | Impact |
|---|---|---|---|---|
| **1a (started)** | Assumptions registry; `afford.ts` reads it; tests for `calc.ts` + `afford.ts`; parity test (registry ↔ calculator `<input>` defaults); **fix co-op fixed-closing drift ($1,800)**; sitemap `lastmod` from content `updated`; fix "additional NYC tax" wording | `src/data/assumptions.ts`, `src/lib/afford.ts`, `test/calc.test.ts`, `test/afford.test.ts`, `test/defaultsParity.test.ts`, `astro.config.mjs`, `src/pages/sell/index.astro`, `src/content/guides/nyc-seller-closing-costs-explained.md`, `src/lib/calc.ts` (comment only), `change-log.md` | M | High |
| 1b | Extract pure co-op/condo/rent engines with golden fixtures; `compare.ts` + `reality-check.ts` import them (fixes the PMI drift) | `src/lib/engines/*`, `src/scripts/{coop,condo,rent,compare,reality-check}.ts`, tests | L | High |
| 1c | Nav/footer parity (Explore on calculator + legal pages; Reality Check card on the homepage grid); `/explore/` directory; BreadcrumbList on calculators | `lib/footerLinks.ts`, 10 page files, `NavLinks`, new `explore` page | S–M | Medium |
| 1d | `/methodology/sources/` page rendered from the registry; content relationship metadata (`parentHub`, `relatedCalculators`, `relatedPrograms`) in collection schemas | `content.config.ts`, new page | M | Medium–High |
| 1e | Guide prose that hard-codes calculated numbers (6.95% examples in 6 guides) → MDX components or a build-time check that flags drift | guides, a test | M | Medium |

### Phase 2: Flagship tools
Order: optimizer → savings planner → rent vs buy → rate/maintenance sensitivity → cost to move. Each tool is built on 1b's engines, with URL query state for non-sensitive fields only, print CSS, `aria-live` results, tests, a "How this works" section, and sources. Effort L each (rate sensitivity M).

### Phase 3: SEO/data expansion
Neighborhood schema migration → Brooklyn (5) → borough hubs → remaining boroughs, all subject to the **quality gate**: a page ships only if it has ≥ 2 sourced or computed figures not shared with a sibling. Bucket gaps in `priceGrids.ts` (split the salary and income grids). Rent pages get 35×/45×/80× and FARE scenarios; salary pages get pay-period breakdowns and a housing tie-in. Glossary +20 and guides +10–12, each with worked examples and dated sources.

### Phase 4: Data product
Index history file, condo median once a stable citywide source is confirmed, charts that separate measured from calculated, `/data/*.json` + CSV downloads with license, and a scheduled GitHub Action that **opens PRs only** (PMMS weekly; HUD AMI/tax tables yearly).

### Phase 5: Personalized planning + trust
Profile v2 (named scenarios, import/export JSON, reset), scenario A/B, `/plan/` with binding-constraint sentences, sanitized share links (replace co-op's balance-bearing hash), methodology/changelog/corrections/reviewer line.

## 6. Questions for you (need answers before the affected phase)

1. **AdSense:** the code is disabled but still wired in. Remove it entirely, or keep it with ads excluded from all calculator/tool pages? (Phase 1c; it affects the CSP.)
2. **Named reviewer:** is there a person (name + credential) to list as reviewer on tax and legal content, or should pages say "maintained by" only? (Phase 5)
3. **Data license** for `/data/` downloads: CC BY 4.0 (my suggestion), or match the repo's MIT? (Phase 4)
