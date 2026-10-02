# Change log

Multi-file changes, newest first. Each entry gives the user-visible effect and how it was validated.

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
