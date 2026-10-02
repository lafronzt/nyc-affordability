# Change log

Multi-file changes, newest first. Each entry gives the user-visible effect and how it was validated.

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
