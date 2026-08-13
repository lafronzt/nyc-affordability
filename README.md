# NYC Affordability

A free NYC housing affordability platform — calculators, sourced guides, a glossary, and salary/price landing pages — built with [Astro](https://astro.build) and deployed on one primary domain via a Cloudflare Worker with Static Assets. The positioning is "the financial guide to living in NYC": the calculators are the interactive core, and the guides/glossary/landing pages expose that same calculation engine as browsable, cited content.

| Page | URL | Path |
|---|---|---|
| Landing page | [www.nyc-affordability.com](https://www.nyc-affordability.com/) | `/` |
| Co-op Affordability | [www.nyc-affordability.com/coop](https://www.nyc-affordability.com/coop/) | `/coop/` |
| Condo Affordability | [www.nyc-affordability.com/condo](https://www.nyc-affordability.com/condo/) | `/condo/` |
| Rent Affordability | [www.nyc-affordability.com/rent](https://www.nyc-affordability.com/rent/) | `/rent/` |
| Affordable Housing Finder | [www.nyc-affordability.com/affordable](https://www.nyc-affordability.com/affordable/) | `/affordable/` |
| Compare All Options | [www.nyc-affordability.com/compare](https://www.nyc-affordability.com/compare/) | `/compare/` |
| Housing Reality Check | [www.nyc-affordability.com/reality-check](https://www.nyc-affordability.com/reality-check/) | `/reality-check/` |
| Sale Net Proceeds | [www.nyc-affordability.com/sell](https://www.nyc-affordability.com/sell/) | `/sell/` |
| Guides (sourced explainers) | [www.nyc-affordability.com/guides](https://www.nyc-affordability.com/guides/) | `/guides/<slug>/` |
| Glossary (NYC housing terms) | [www.nyc-affordability.com/glossary](https://www.nyc-affordability.com/glossary/) | `/glossary/<slug>/` |
| What can I afford by income | [www.nyc-affordability.com/income](https://www.nyc-affordability.com/income/) | `/income/<amount>/` |
| What it takes to buy by price | [www.nyc-affordability.com/buy](https://www.nyc-affordability.com/buy/) | `/buy/<price>/` |
| Neighborhood affordability | [www.nyc-affordability.com/neighborhoods](https://www.nyc-affordability.com/neighborhoods/) | `/neighborhoods/<slug>/` |
| Affordability Index | [www.nyc-affordability.com/affordability-index](https://www.nyc-affordability.com/affordability-index/) | `/affordability-index/` |
| About | [www.nyc-affordability.com/about](https://www.nyc-affordability.com/about/) | `/about/` |
| Contact | [www.nyc-affordability.com/contact](https://www.nyc-affordability.com/contact/) | `/contact/` |
| Privacy Policy | [www.nyc-affordability.com/privacy](https://www.nyc-affordability.com/privacy/) | `/privacy/` |
| Terms of Service | [www.nyc-affordability.com/terms](https://www.nyc-affordability.com/terms/) | `/terms/` |
| Co-op legacy domain | [nyc-co-op-affordability.com](https://www.nyc-co-op-affordability.com/) | redirects to `/coop/` |

---

## How domain routing works

A single Cloudflare Worker entrypoint at [`/functions/[[path]].js`](functions/%5B%5Bpath%5D%5D.js) intercepts every request and routes based on the incoming `hostname`:

```
www.nyc-affordability.com          →  / (hub landing page, pass through)
www.nyc-affordability.com/coop/    →  /coop/ (co-op calculator)
www.nyc-affordability.com/condo/   →  /condo/ (condo calculator)
www.nyc-affordability.com/rent/    →  /rent/ (rent calculator)
www.nyc-affordability.com/compare/ →  /compare/ (cross-calculator dashboard)
nyc-affordability.com (apex)       →  301 redirect to https://www.nyc-affordability.com (same path)
nyc-co-op-affordability.com        →  localStorage migration page, then https://www.nyc-affordability.com/coop/
default Worker URL / unknown       →  pass through (serves /index.html at root)
```

The primary domain is the canonical SEO target for all calculators. The legacy co-op domain preserves paths while migrating saved browser inputs, so `www.nyc-co-op-affordability.com/details` lands on `https://www.nyc-affordability.com/coop/details`.

The co-op migration has to run in the browser because `localStorage` is scoped by domain. The legacy domain serves a short noindex migration page that copies `nyc_coop_inputs` and `nyc_shared_profile` into a URL fragment, opens the canonical `/coop/` page, and the canonical page immediately imports those values and removes the fragment from browser history. Non-HTML requests still receive a normal 301 redirect.

The default Worker domain also serves all paths directly by file-system structure:
- `[worker-url]/` → landing page
- `[worker-url]/coop/` → co-op calculator
- `[worker-url]/condo/` → condo calculator
- `[worker-url]/rent/` → rent calculator
- `[worker-url]/compare/` → cross-calculator comparison dashboard

### Adding a new domain

1. Add entries to `DOMAIN_ROUTES` in `functions/[[path]].js`:
   ```js
   'example.com':     '/example',
   'www.example.com': '/example',
   ```
   To retire a standalone calculator domain in favor of the hub, add it to `DOMAIN_REDIRECTS` instead.
2. Create `src/pages/example/index.astro` using `BaseLayout` + `AppHeader` (calculators) or `SiteHeader` (informational pages), plus the shared `Footer` component — see [Repository structure](#repository-structure) below.
3. In Cloudflare Workers → your Worker → **Settings** → **Domains & Routes**, add the domain or route.
4. Update DNS as needed for the Worker custom domain or route.
5. Add cross-links in the footer of each existing page and on `src/pages/index.astro`.

---

## Repository structure

```
/
├── src/
│   ├── layouts/
│   │   └── BaseLayout.astro       ← <html><head> shell: SEOHead + AdSense loader, <slot/>
│   ├── components/
│   │   ├── SEOHead.astro          ← meta/OG/Twitter/canonical/JSON-LD, prop-driven
│   │   ├── SiteHeader.astro       ← header for hub/about/privacy
│   │   ├── AppHeader.astro        ← header for calculators (save-toggle, tagline)
│   │   ├── Footer.astro           ← shared footer for every page (variant: 'site' | 'app', disclaimer, columns props)
│   │   └── AdSlot.astro           ← the AdSense <ins> block
│   ├── styles/
│   │   └── tokens.css             ← shared design tokens, reset, base body rules
│   ├── lib/
│   │   ├── format.ts              ← fmtMoney / fmtPercent
│   │   ├── calc.ts                ← calcMansionTax / calcPmiRate / calcPmiMonthly / calcMortgageRecordingTax / calcNycRptt / calcNysTransferTax / bsearchMaxPrice
│   │   ├── afford.ts              ← DOM-free build-time math for /income/ and /buy/ pages — mirrors (does not import) the DOM-coupled calculate()/priceAtDp() logic in src/scripts/{rent,coop,condo}.ts, same relationship compare.ts has to those scripts. See the file's header comment before editing.
│   │   ├── amiTable.ts            ← the one shared data table (HUD AMI figures by household size, cited) — imported by both afford.ts and src/scripts/affordable.ts
│   │   ├── sharedProfile.ts       ← nyc_shared_profile localStorage contract
│   │   ├── breadcrumbs.ts         ← buildBreadcrumbJsonLd() for schema.org BreadcrumbList JSON-LD
│   │   ├── share.ts               ← wireShareButton() — Web Share API with a clipboard-text fallback, used by Reality Check and /income/<amount>/
│   │   ├── adSlots.ts             ← AdSense ad-unit slot IDs
│   │   ├── adsConfig.ts           ← ADS_ENABLED master switch — set to false site-wide to pull every ad (and the loader script) in one place
│   │   └── footerLinks.ts         ← shared FooterLink/FooterColumn data reused across every page's footer
│   ├── scripts/                   ← per-page calculator logic (coop.ts, condo.ts, rent.ts, affordable.ts, compare.ts, sell.ts, reality-check.ts)
│   ├── content.config.ts          ← `guides`, `glossary`, and `neighborhoods` content collection schemas (frontmatter shape, defaults)
│   ├── data/
│   │   └── affordabilityIndex.ts  ← versioned array of monthly market snapshots, hand-edited (no backend/cron) — see its own header comment before adding an entry
│   ├── content/
│   │   ├── guides/                ← one .md file per guide, rendered by src/pages/guides/[slug].astro
│   │   ├── glossary/               ← one .md file per term, rendered by src/pages/glossary/[slug].astro
│   │   └── neighborhoods/         ← one .md file per neighborhood, rendered by src/pages/neighborhoods/[slug].astro
│   └── pages/
│       ├── index.astro            ← Landing page (NYC Affordability hub)
│       ├── about/index.astro
│       ├── contact/index.astro
│       ├── privacy/index.astro
│       ├── terms/index.astro
│       ├── affordable/index.astro
│       ├── compare/index.astro    ← Rent vs co-op vs condo comparison dashboard, incl. "What if...?" scenario sliders
│       ├── reality-check/index.astro ← Lighter single-savings-number triage tool: verdicts across rent/co-op/condo/affordable housing
│       ├── condo/index.astro
│       ├── coop/index.astro
│       ├── rent/index.astro
│       ├── sell/index.astro       ← Sale net proceeds calculator
│       ├── guides/
│       │   ├── index.astro        ← grouped by category (renting/buying/coop/affordable-housing)
│       │   └── [slug].astro       ← shared template for every /guides/<slug>/ page
│       ├── glossary/
│       │   ├── index.astro        ← grouped by category (renting/buying/coop/affordable-housing/taxes/general)
│       │   └── [slug].astro       ← shared template for every /glossary/<slug>/ page
│       ├── income/
│       │   ├── index.astro
│       │   └── [amount]/index.astro  ← static-generated for a fixed income list (see afford.ts)
│       ├── buy/
│       │   ├── index.astro
│       │   └── [price]/index.astro   ← static-generated for a fixed price list (see afford.ts)
│       ├── neighborhoods/
│       │   ├── index.astro        ← grouped by borough
│       │   └── [slug].astro       ← shared template for every /neighborhoods/<slug>/ page
│       └── affordability-index/
│           └── index.astro        ← reads src/data/affordabilityIndex.ts
├── public/                        ← pass-through static assets (images, robots.txt, ads.txt)
├── dist/                          ← Astro build output (git-ignored) — this is what wrangler deploys
├── functions/
│   └── [[path]].js                ← Cloudflare Worker routing entrypoint (unaffected by the build)
├── astro.config.mjs
├── package.json
├── wrangler.toml
└── README.md
```

The site is built with [Astro](https://astro.build) in static output mode: `npm run build` compiles `src/pages/*.astro` into plain HTML/CSS/JS in `dist/`, which Cloudflare Workers Static Assets serves exactly as it served hand-written `public/` files before this migration — no server rendering, no data ever leaves the browser. Adding a new page is one new file under `src/pages/<slug>/index.astro` that reuses the shared layout/header/footer components.

`sitemap.xml` is generated at build time by [`@astrojs/sitemap`](https://docs.astro.build/en/guides/integrations-guide/sitemap/) (configured in `astro.config.mjs`) from every page under `src/pages/`, so a new page is picked up automatically without hand-editing a sitemap file. Each page's `priority`/`changefreq`/`lastmod` come from the `SITEMAP_PAGE_META` map in `astro.config.mjs`; add an entry there for new pages (falls back to a sane default otherwise). The plugin itself only outputs `sitemap-index.xml` + `sitemap-0.xml` (it has no bare-`sitemap.xml` option); `npm run build` runs `scripts/rename-sitemap.mjs` as a second step to collapse that single chunk into a plain `dist/sitemap.xml`, matching the URL `robots.txt` (a hand-written static file under `public/`) has always pointed at. If the site ever grows past ~45,000 pages and the sitemap splits into multiple chunks, that script will throw and need updating. Draft guides, glossary entries, and neighborhoods (see below) are excluded from the sitemap via the integration's `filter` option, which reads `draft: true` directly off the content file's frontmatter — `draftSlugsIn()` in `astro.config.mjs` tolerates a collection directory not existing yet (returns an empty set) rather than throwing, since a brand-new collection may start with zero content files. Enumerated routes (`/income/<amount>/`, `/buy/<price>/`, `/glossary/<slug>/`, `/neighborhoods/<slug>/`) get their `changefreq`/`priority` from a pattern-matched `ENUMERATED_ROUTE_META` list in `astro.config.mjs` rather than a hand-listed entry per page, since those lists grow.

### Guides (`/guides/<slug>/`)

Long-form editorial content — separate from the calculators above — lives as Markdown in `src/content/guides/`, one file per guide, and is rendered through the single shared template at `src/pages/guides/[slug].astro`. This is one of two places in the site that isn't a hand-written `.astro` file per page (the other is the glossary, below); adding a guide means adding a `.md` file, not a new route.

`src/content.config.ts` defines the frontmatter schema. Required fields: `title`, `metaDescription`, `intro`, `updated` (`YYYY-MM-DD`), `category` (one of `renting` / `buying` / `coop` / `affordable-housing` — used to group the "NYC Housing Rules" sections on `/guides/`; a narrower set than the glossary's category enum below since every guide fits one of these four), `sources` (an array of `{ label, url }` citations rendered in the page's **Sources** section), and `cta` (`{ heading, body, label, href }`, rendered as a box linking to the relevant calculator). Optional: `ogTitle`/`ogDescription`/`ogImage`/`ogImageAlt`/`twitterTitle`/`twitterDescription` (all fall back to `title`/`metaDescription`/a default OG image), `draft` (defaults to `false`), `relatedGuides`/`relatedTerms` (slugs surfaced as "Related guides"/"Related terms" cards — `relatedTerms` points into the `glossary` collection below), and `sitemap.changefreq`/`sitemap.priority` (default `monthly` / `0.7`). The Markdown body becomes the guide's body sections.

Setting `draft: true` on a guide sets `<meta name="robots" content="noindex, nofollow">` on that page and excludes it from `sitemap.xml` — the guide is still built and reachable by direct URL (so it can be reviewed), just not indexed or listed. Flip `draft` to `false` when the guide is ready to publish; no other change is needed.

### Glossary (`/glossary/<slug>/`)

Short definitional entries — AMI, DTI, flip tax, post-closing liquidity, etc. — live as Markdown in `src/content/glossary/`, one file per term, rendered through `src/pages/glossary/[slug].astro`. Same content-collection mechanics as guides: add a `.md` file, not a new route. The schema (in `src/content.config.ts`) additionally requires `term`, `shortDefinition` (used on the index/card view), and `category` (one of `renting` / `buying` / `coop` / `affordable-housing` / `taxes` / `general`, used to group the `/glossary/` index page); it shares `sources`, `relatedGuides`, `draft`, and `sitemap` with the guides schema, plus its own `relatedTerms` for cross-linking between glossary entries. Every entry's body should include a worked numeric example, not just a definition — that's the differentiator versus a generic glossary.

### Salary / price landing pages (`/income/<amount>/`, `/buy/<price>/`)

These expose the calculator engine as static content rather than an interactive tool: `/income/<amount>/` shows max rent/co-op/condo for a given income, `/buy/<price>/` shows the reverse (required income + estimated cash) for a given purchase price. Both are `getStaticPaths()`-driven Astro pages generated for a **fixed list** of amounts/prices (defined both in `src/lib/afford.ts`-adjacent literals and inline in each page's `getStaticPaths()` — see the comment in those files for why the literal is duplicated) — there's no SSR adapter configured, so arbitrary user-supplied values aren't possible; a "custom" scenario instead deep-links into `/compare/` via the shared profile.

The numbers come from `src/lib/afford.ts`, a DOM-free mirror of the pure math inside `src/scripts/{rent,coop,condo}.ts` (see that file's header comment for why it's a deliberate, documented duplicate rather than a shared import — it follows the same pattern `compare.ts` already established). Because these pages have no real user account data, they compute an **income (DTI) ceiling only** — no cash/reserve check — and every page says so explicitly, linking back to the live calculator for a true number against real savings.

The `/compare/` dashboard reads the shared browser profile saved at `nyc_shared_profile` and can update it when the page's Save toggle is enabled, then combines that profile with each calculator's saved assumptions to compare max affordable rent, max co-op price, max condo price, cash required, monthly housing cost, DTI, reserve requirement, and binding constraint.

### "What if...?" scenario sliders (`/compare/`)

Three range sliders (salary +$0–100k, savings +$0–200k, mortgage rate −2%–0%) let a visitor explore scenarios without touching their saved profile. The deltas live in a module-level `WHATIF` object in `src/scripts/compare.ts` that's applied only inside `render()` — added to the `base` inputs passed to `calcRent`/`calcCoop`/`calcCondo`, and passed as an optional rate-override second argument to `calcCoop`/`calcCondo` — and are never written to `profileState`, `ASMP`, or any localStorage key, even with Save on. A banner and a "Reset to saved profile" button make clear when a what-if scenario is being shown instead of the real saved numbers.

### Housing Reality Check (`/reality-check/`)

A lighter sibling of `/compare/`, not a replacement: `src/scripts/reality-check.ts` mirrors the same rent/co-op/condo math (plus an AMI eligibility check via `src/lib/amiTable.ts`) but takes a single "liquid savings" number instead of `/compare/`'s full multi-account editor, and returns a plain verdict per housing type (Rent gets a Comfortable/Stretch/Unlikely badge; co-op/condo/affordable-housing get a max value + a plain-English explanation of the limiting constraint) rather than a side-by-side table. It's meant to answer "where do I even start?" in under a minute.

Income and other-debts are read from/written to the shared profile (`nyc_shared_profile`) like every other calculator, since those are safe scalar fields — but `liquidSavings` and `householdSize` are deliberately **not** written into the shared profile's `accounts` array. Reality Check's single-number simplification would silently flatten a richer multi-account breakdown a visitor already built on `/coop/`, `/condo/`, or `/compare/`, so those two fields live in their own page-local `nyc_reality_check_inputs` key instead — read the file's header comment for the full reasoning.

### Shareable results (`src/lib/share.ts`)

`wireShareButton(buttonId, buildPayload)` calls the Web Share API when available (mobile Safari/Chrome, some desktop browsers) and falls back to copying a text summary to the clipboard everywhere else — there's no image-generation infrastructure on this site (no `@vercel/og`/Satori equivalent), so personalized OG-card images are an explicitly deferred, not-yet-built idea rather than something this ships. `buildPayload` receives the already-looked-up button element (so callers reading `data-share-*` attributes don't re-query the DOM), and only ever returns a computed text summary — never raw account data. Wired up on `/reality-check/`, all six calculators (`/coop/`, `/condo/`, `/rent/`, `/affordable/`, `/sell/`, `/compare/`), and each `/income/<amount>/` page.

### Neighborhoods (`/neighborhoods/<slug>/`)

The highest citation-risk content on the site — real estate market data, not tax code or the site's own calculator math, so it can drift after publication in a way guides/glossary entries don't. Markdown in `src/content/neighborhoods/`, one file per neighborhood, rendered through `src/pages/neighborhoods/[slug].astro`; grouped by borough on `/neighborhoods/`. The schema (`src/content.config.ts`) deliberately avoids a fixed "1BR"/"studio" shape for `medianRent`/`medianSalePrice` — each carries its own `*Label` string saying exactly what it represents, since what's actually available varies by source, and its own `*AsOf` date, since rent and sale figures routinely come from different reports published on different schedules (a shared date would hide that gap).

**Sourcing rule for this collection specifically: never cite a live/IDX-feed page** (a "market report" that updates every 15 minutes) — cite a dated, stable snapshot instead (a quarterly report PDF, a dated news article) that won't have silently changed by the time a reader clicks through. The first batch (Upper West Side, Chelsea, Harlem, Astoria, Long Island City) intentionally excludes three other candidate neighborhoods — Park Slope and Forest Hills had no rent figure from any stable source, and Williamsburg's only available rent figure was an average (not median) from a single sub-neighborhood with a 44% year-over-year swing, a red flag for a small/skewed sample. Several published pages also caveat that their figure comes from a broker-defined zone broader than the named neighborhood (e.g. Chelsea and Harlem's Manhattan-wide submarket zones; Astoria and LIC share one "Northwest Queens" rent figure since no neighborhood-specific rent source existed) — read the body of an affected page for the specific zone boundaries before treating the number as neighborhood-exact.

Each neighborhood page also has a "What it takes to live here" card computed from `src/lib/afford.ts` (`requiredIncomeForRent`/`requiredIncomeForPrice`) against that page's own cited median — explicitly labeled as calculated, not market data, same derived-vs-cited distinction used on `/income/<amount>/` and `/buy/<price>/`.

### Affordability Index (`/affordability-index/`)

`src/data/affordabilityIndex.ts` is a hand-edited, versioned array of monthly snapshots — read its header comment before adding an entry. Two things it's deliberately honest about: **"monthly updated" cannot be an automatic feature** on a static site with no backend or scheduled job, so the page says so explicitly rather than implying a cadence that hasn't happened yet; and **each metric carries its own `asOf` date** rather than one shared snapshot date, because e.g. the first entry's rent figure (March 2026, reused from `/rent/`'s own citation) and co-op figure (Q1 2025, reused from `/coop/`'s own citation) are over a year apart — the page states that gap outright instead of implying false precision. `medianCondoPrice` is `null` in the first entry because no stable, genuinely citywide (not Manhattan-only) source could be confirmed — add it once one is found, don't fill in an estimate.

The historical chart is a hand-rolled inline SVG path (`buildSparklinePath()` in the page itself) — no chart dependency, following the same precedent as `coop.ts`'s/`condo.ts`'s Canvas-based optimizer charts — and only renders once 2+ snapshots exist; with a single data point it shows a plain message instead of a fabricated one-point "trend."

---

## Deploy

### Cloudflare Workers

1. Fork or clone this repo.
2. In **Cloudflare Workers & Pages → Create → Worker → Import a repository**, connect the repo.
3. Use this repo's `wrangler.toml` as the deployment config.
4. In the Worker's **Settings → Build configuration**, set the build command to `npm install && npm run build` (one-time manual setup — this can't be expressed in `wrangler.toml`). The build output directory is governed by `wrangler.toml`'s `[assets] directory` (`dist`).
5. Deploy on push.
6. Add each custom domain under the Worker's **Settings → Domains & Routes** and configure DNS.

### Local preview

Two-tier workflow:

```bash
npm install
npm run dev          # Astro dev server — fast iteration, hot reload
```

`npm run dev` does **not** exercise `functions/[[path]].js`'s host-based routing. To test routing (domain routing, the legacy-domain redirect, the SPA-style 404 fallback), build first and run the Worker locally against the built output:

```bash
npm run build
npx wrangler dev --local
```

You can test host-based routing by passing a custom `Host` header:

```bash
curl -H "Host: nyc-co-op-affordability.com" http://localhost:8788/
```

---

## Calculator assumptions & sources

### Co-op (`/coop/`)
- Post-close reserves: 12–24 months maintenance + mortgage (board-specific)
- Board DTI: typically 25–30% of gross monthly income
- Sources: StreetEasy/Baruch CUNY Q1 2025, Freddie Mac PMMS, Prevu/Compass 2025–2026

### Condo (`/condo/`)
- Lender back-end DTI: 43% (includes mortgage P&I + common charges + property taxes + insurance + other debt)
- Mortgage rate default: **6.30%** (Freddie Mac PMMS, April 30, 2026)
- Mansion tax: buyer-paid on purchases ≥ $1M, tiered 1.00%–3.90% (NYS)
- Mortgage recording tax: 1.80% of loan < $500K; 1.925% of loan ≥ $500K (NYC/NYS DOF/ACRIS)
- Property tax default: $1,250/mo (Habitat Magazine / NYC DOF tentative 2025–2026 roll, citywide avg $15,134/unit)
- Sources: Freddie Mac PMMS, NYC DOF/ACRIS, NYS mansion tax guidance, Habitat Magazine

### Rent (`/rent/`)
- Landlord income multiplier: 40× annual income (NYC market practice)
- Broker fee: defaults to **no tenant-paid fee** per NYC FARE Act (effective June 11, 2025)
- Security deposit: capped at 1 month's rent (NYS law)
- Application fee: $20 cap (NYC DCWP)
- Rent defaults: citywide median $3,995/mo (StreetEasy March 2026), avg $3,583/mo (Zillow April 4, 2026)
- Sources: StreetEasy March 2026, Zillow April 2026, NYC DCWP FARE Act FAQ Aug 2025, NYS AG Tenants' Rights Guide, NerdWallet Jan 2026

---

## Cloudflare Workers configuration notes

- **Entrypoint:** `functions/[[path]].js`
- **Assets directory:** `dist` (Astro build output; source lives in `src/` plus pass-through `public/`)
- **Build command:** `npm install && npm run build` (set in the Cloudflare dashboard, see [Deploy](#deploy) above)
- **Compatibility date:** see `wrangler.toml`
- `run_worker_first = true` is required so host-based routing runs before static assets are served.
- `env.ASSETS` is the Workers Static Assets binding used by the Worker to serve files from `dist`.

---

## Disclaimer

These calculators are for informational purposes only and do not constitute financial, legal, or mortgage advice. Tax rates, board requirements, and closing costs vary by building, lender, and transaction. Always verify all figures with a licensed mortgage professional and real estate attorney before making housing decisions.
