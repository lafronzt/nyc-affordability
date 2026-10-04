# NYC Affordability

A free NYC housing affordability platform: calculators, sourced guides, a glossary, neighborhood and borough pages, and salary/price landing pages. It's built with [Astro](https://astro.build) as a static site and served from one primary domain by a Cloudflare Worker with Static Assets.

The calculators are the core. Every other page runs the same calculation engine, so a number on a guide, a landing page, or the comparison dashboard matches the calculator it links to.

**Ground rules the code is built around**
- Everything you type stays in your browser. There's no backend, no account, and no analytics event carrying inputs. Saved inputs live in `localStorage` only when you turn saving on.
- Cited figures carry a value, a period, a source, and a link. Anything without a stable, dated source shows "Not yet tracked" instead of an estimate.
- Calculated figures are always labeled as calculated, separately from cited ones.
- Calculation changes need tests, and an existing formula never changes without a failing test first.

Working rules for contributors (branches, PRs, the change log) are in [`AGENTS.md`](AGENTS.md).

---

## Pages

**Calculators and tools**

| Page | Path |
|---|---|
| Housing Reality Check ("Start here") | `/reality-check/` |
| Co-op, condo, and rent calculators | `/coop/`, `/condo/`, `/rent/` |
| Affordable housing (AMI) finder | `/affordable/` |
| Compare rent, co-op, condo | `/compare/` |
| How do I afford more? | `/afford-more/` |
| Down payment savings planner | `/savings-planner/` |
| Rent vs buy | `/rent-vs-buy/` |
| Rate and maintenance sensitivity | `/rate-sensitivity/` |
| Cost to move | `/cost-to-move/` |
| Sale net proceeds | `/sell/` |
| Required salary | `/required-salary/` |
| My NYC Plan (what limits each option, and what moves it) | `/plan/` |
| Your saved data (scenarios, A/B compare, export/import, reset) | `/my-data/` |

**Content and data**

| Page | Path |
|---|---|
| Guides and glossary | `/guides/<slug>/`, `/glossary/<slug>/` |
| Neighborhoods and borough hubs | `/neighborhoods/<slug>/`, `/manhattan/`, `/brooklyn/`, `/queens/` |
| What an income buys / what a price takes / income needed for a rent | `/income/<amount>/`, `/buy/<price>/`, `/rent/<price>/` (index at `/rent/prices/`) |
| Salary after taxes | `/salary/<amount>/` |
| Affordability Index | `/affordability-index/` |
| Data downloads (JSON and CSV, CC0) | `/data/` |
| Methodology, sources, changelog, corrections | `/methodology/`, `/methodology/sources/`, `/methodology/changelog/`, `/methodology/corrections/` |
| Site directory | `/explore/` |
| About, contact, privacy, terms | `/about/`, `/contact/`, `/privacy/`, `/terms/` |

The legacy domain `nyc-co-op-affordability.com` forwards to `/coop/` (see below).

---

## How domain routing works

One Worker entrypoint, [`functions/[[path]].js`](functions/%5B%5Bpath%5D%5D.js), sees every request and routes on `hostname`:

```
www.nyc-affordability.com          →  served as-is (the canonical host)
nyc-affordability.com (apex)       →  301 to https://www.nyc-affordability.com (same path)
nyc-co-op-affordability.com (+www) →  short migration page, then /coop/ on the canonical host
default Worker URL / unknown host  →  served as-is
```

`run_worker_first = true` in `wrangler.toml` makes routing run before static assets are served.

**The legacy co-op domain.** `localStorage` is scoped per domain, so carrying saved inputs over has to happen in the browser. The legacy domain serves a short noindex page:
- Only an allowlist of calculator settings travels, in a URL fragment that `/coop/` reads and then removes from the address bar: rate, term, down payment, reserves, DTI limit, maintenance, and closing fees (`SAFE_COOP_INPUT_KEYS`, kept in sync with `src/lib/migrationPayload.ts` by a test).
- Income, debts, and account balances never go in a URL. If any are saved on the old domain, the page lists them and offers a "Download my saved data" file instead of redirecting. That file can be imported on `/my-data/`.
- Non-HTML requests get a plain 301.

To add a domain: add it to `DOMAIN_ROUTES` (or `DOMAIN_REDIRECTS` to retire it into the hub), add the domain under the Worker's **Settings → Domains & Routes**, and update DNS.

---

## How the code is organized

```
src/
├── pages/            File-based routes (one folder per page; [param] folders are generated from fixed lists)
├── layouts/          BaseLayout.astro: <html>/<head> shell, SEO tags, the AdSense loader when ads are on
├── components/       SiteHeader / AppHeader / NavLinks, Footer, Breadcrumbs, AdSlot, Byline,
│                     ChangeEntry, MiniCalcWidget, RelatedBudgets, charts/NeighborhoodCharts
├── styles/tokens.css Shared design tokens and base rules
├── scripts/          Browser code for each interactive page (coop.ts, rent.ts, plan.ts, my-data.ts, …)
├── lib/
│   ├── engines/      Pure calculation engines: coop, condo, rent, levers, savings, rentVsBuy,
│   │                 sensitivity, moveCost, sale, and defaults.ts (engine inputs from the registry)
│   ├── calc.ts       Tax and fee helpers: mansion tax, MRT, RPTT, NYS transfer tax, PMI, bsearch
│   ├── afford.ts     Thin wrapper over the engines for build-time pages (/income/, /buy/, neighborhoods)
│   ├── housingOptions.ts  The /compare/ model, shared by /compare/, scenario A/B, and /plan/
│   ├── plan.ts, scenarioCompare.ts, profileStore.ts   /plan/ sentences, A/B rows, saved-data store
│   ├── salaryCalc.ts, salaryTaxConstants2026.ts       Paycheck and tax math
│   ├── amiTable.ts   HPD's AMI chart; marketFigures.ts, dataExport.ts, loadDatasets.ts for /data/
│   ├── navGroups.ts, footerLinks.ts   Primary nav and footer links (tests keep them complete)
│   └── adsConfig.ts, adSlots.ts       Ads master switch and AdSense unit IDs
├── data/
│   ├── assumptions.ts   Registry of every default: value, basis (law / official / survey / estimate),
│   │                    source, dates, and the calculator inputs it backs
│   ├── sourceTables.ts  Tax tables and rate tiers with their sources
│   ├── affordabilityIndex.ts, boroughs.ts, priceGrids.ts
│   ├── siteChanges.ts   The public changelog and corrections
│   └── editorial.ts     Maintainer and (optional) reviewer shown in bylines
└── content/          Markdown collections: guides/, glossary/, neighborhoods/ (schemas in content.config.ts)
functions/[[path]].js Worker routing and the legacy-domain migration page
scripts/              Build helpers (sitemap, CSP check), link check, scheduled data-update scripts
test/                 Unit tests (node:test)
```

### One engine, one set of defaults

- **Engines.** The co-op, condo, and rent math lives in `src/lib/engines/`. The calculators, `/compare/`, `/reality-check/`, `/plan/`, and every build-time page import it, so the same inputs give the same answer everywhere. The engines are pure and DOM-free. Read a file's header comment before changing a formula.
- **Defaults.** Every default a calculator starts from is an entry in `src/data/assumptions.ts`. `test/defaultsParity.test.ts` fails if a page's `<input value>` disagrees with the registry. `/methodology/sources/` and `/data/assumptions.*` are generated from the same registry, so there's no separate assumptions list to keep in sync (see those pages for current values and sources).
- **Guide numbers.** Worked examples in guides that depend on defaults (the mortgage rate, for one) are recomputed by `test/guideExamples.test.ts`. When a default changes, the test lists every stale figure with its replacement text.

### Content collections

Guides, glossary terms, and neighborhoods are Markdown files in `src/content/`, each rendered by one shared template. Adding one is adding a file, not a route. Schemas are in `src/content.config.ts`. Guides and glossary entries require dated `sources`, and `draft: true` builds the page with `noindex` and leaves it out of the sitemap.

**Neighborhood data has the strictest rule:** cite dated, stable snapshots (a quarterly report, a dated article), never a live listing feed or dashboard. Each figure keeps its own period and scope, and a page only ships if it has at least two sourced or computed figures not shared with a sibling (`test/neighborhoodFigures.test.ts`).

Guides and glossary pages show a byline from `src/data/editorial.ts`. A page affected by a correction in `src/data/siteChanges.ts` also shows a dated "Corrected" note.

### Saved data and privacy

- Calculators save to `localStorage` only when "Save inputs" is on. Every key the site may write is registered in `src/lib/profileStore.ts`, and a test fails if code uses an unregistered `nyc_*` key. The privacy page's key table renders from that registry.
- `/my-data/` lists what's saved, keeps named scenarios, compares two side by side, exports and imports a JSON file, and resets everything. All of it happens in the browser.
- Share buttons send a computed text summary only, never balances or raw inputs.

---

## Data and how it stays current

- **`/data/`** publishes the cited market figures, assumptions, AMI table, Affordability Index, and calculated income-needed figures as JSON and CSV under CC0. They're generated at build time from the same files the pages read.
- **Scheduled checks** (`.github/workflows/`) never change the site on their own. They open a PR or an issue for a person to review:
  - `data-update-pmms.yml`, weekly: a new Freddie Mac 30-year rate opens a draft PR on `data/pmms-rate`.
  - `data-check-ami.yml`, monthly: a new HPD AMI chart opens a draft PR on `data/hpd-ami`.
  - `data-reminder-tax.yml`, every December: a checklist issue for next year's tax tables.
  - `check-links.yml`, monthly: an issue listing broken external links (`npm run check-links`).
- **The Affordability Index** (`src/data/affordabilityIndex.ts`) is updated by hand. Its sources publish reports, not data a script can read, and StreetEasy blocks automated requests. The array is append-only and is the index's history: the page and `/data/affordability-index.*` read every entry.
- **Every change that moves a number** goes in `src/data/siteChanges.ts`, which renders on `/methodology/changelog/` (and `/methodology/corrections/` for mistakes). `change-log.md` is the detailed engineering log; a test requires every `Fix:` entry there to have a public correction.

---

## Ads

AdSense is wired in and **switched off**: `ADS_ENABLED = false` in `src/lib/adsConfig.ts`. Every page is ready for it:
- Every page opts in with BaseLayout's `ads` prop and has at least one `<AdSlot>`. `test/adsReady.test.ts` fails if a page is missing either, and checks `public/ads.txt` against the publisher ID.
- The Content-Security-Policy in `public/_headers` already allows the hosts AdSense uses. It was checked by loading pages with ads switched on: no CSP violations.
- The privacy page's ad wording follows the flag.

**To turn ads on** once AdSense approves the site: set `ADS_ENABLED = true`, run `npm run build` (the CSP check must pass), and deploy. Then check the browser console on a calculator page for `Refused to …` CSP messages. Google occasionally adds hosts, and any new one goes in `public/_headers`.

---

## Develop, test, deploy

```bash
npm ci                  # install from package-lock.json
npm run dev             # Astro dev server with hot reload
npm test                # unit tests (node --test): engines, defaults parity, guide figures, nav, data, ads readiness
npm run build           # builds dist/, writes dist/sitemap.xml, fails on any inline script not allowed by the CSP
npm run check-links     # checks every external link in src/ (needs network)
```

`npm run dev` doesn't run the Worker's host routing. To test routing, build and run the Worker locally against `dist/`:

```bash
npm run build
npx wrangler dev --local
curl -H "Host: nyc-co-op-affordability.com" http://localhost:8788/
```

Nothing that touches the DOM has an automated browser test. For pages and scripts, build and check the affected pages in a browser, including a phone-width layout and calculator edge cases.

**Sitemap.** `@astrojs/sitemap` generates it from every page, and `scripts/rename-sitemap.mjs` collapses it to `dist/sitemap.xml`. Per-page `priority`, `changefreq`, and `lastmod` come from `SITEMAP_PAGE_META` in `astro.config.mjs`. Content pages take `lastmod` from their own `updated` date.

### Cloudflare Workers

1. Connect the repo under **Workers & Pages → Create → Worker → Import a repository**. `wrangler.toml` is the deploy config.
2. Set the build command to `npm install && npm run build` in the Worker's **Settings → Build configuration**. The assets directory (`dist`) comes from `wrangler.toml`.
3. Add custom domains under **Settings → Domains & Routes** and configure DNS.

Each pull request gets a preview deployment from the Cloudflare bot.

---

## Disclaimer

These calculators are for informational purposes only and do not constitute financial, legal, tax, or mortgage advice. Tax rates, board requirements, and closing costs vary by building, lender, and transaction. Verify any figure that matters with a licensed mortgage professional and a real estate attorney before making a housing decision.
