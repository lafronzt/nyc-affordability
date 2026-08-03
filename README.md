# NYC Affordability

A suite of free NYC apartment, home, and housing affordability calculators, built with [Astro](https://astro.build) and deployed on one primary domain via a Cloudflare Worker with Static Assets.

| Calculator | URL | Path |
|---|---|---|
| Landing page | [nyc-affordability.com](https://www.nyc-affordability.com/) | `/` |
| Co-op Affordability | [nyc-affordability.com/coop](https://www.nyc-affordability.com/coop/) | `/coop/` |
| Condo Affordability | [nyc-affordability.com/condo](https://www.nyc-affordability.com/condo/) | `/condo/` |
| Rent Affordability | [nyc-affordability.com/rent](https://www.nyc-affordability.com/rent/) | `/rent/` |
| Affordable Housing Finder | [nyc-affordability.com/affordable](https://www.nyc-affordability.com/affordable/) | `/affordable/` |
| Compare All Options | [nyc-affordability.com/compare](https://www.nyc-affordability.com/compare/) | `/compare/` |
| About | [nyc-affordability.com/about](https://www.nyc-affordability.com/about/) | `/about/` |
| Privacy Policy | [nyc-affordability.com/privacy](https://www.nyc-affordability.com/privacy/) | `/privacy/` |
| Co-op legacy domain | [nyc-co-op-affordability.com](https://www.nyc-co-op-affordability.com/) | redirects to `/coop/` |

---

## How domain routing works

A single Cloudflare Worker entrypoint at [`/functions/[[path]].js`](functions/%5B%5Bpath%5D%5D.js) intercepts every request and routes based on the incoming `hostname`:

```
nyc-affordability.com              →  / (hub landing page, pass through)
nyc-affordability.com/coop/        →  /coop/ (co-op calculator)
nyc-affordability.com/condo/       →  /condo/ (condo calculator)
nyc-affordability.com/rent/        →  /rent/ (rent calculator)
nyc-affordability.com/compare/     →  /compare/ (cross-calculator dashboard)
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
2. Create `src/pages/example/index.astro` using `BaseLayout` + `AppHeader`/`AppFooter` (calculators) or `SiteHeader`/`SiteFooter` (informational pages) — see [Repository structure](#repository-structure) below.
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
│   │   ├── SiteFooter.astro       ← footer for hub/about/privacy (slot-based columns)
│   │   ├── AppHeader.astro        ← header for calculators (save-toggle, tagline)
│   │   ├── AppFooter.astro        ← footer for calculators (slot-based columns)
│   │   └── AdSlot.astro           ← the AdSense <ins> block
│   ├── styles/
│   │   └── tokens.css             ← shared design tokens, reset, base body rules
│   ├── lib/
│   │   ├── format.ts              ← fmtMoney / fmtPercent
│   │   ├── calc.ts                ← calcMansionTax / calcPmiRate / calcPmiMonthly / calcMortgageRecordingTax / bsearchMaxPrice
│   │   └── sharedProfile.ts       ← nyc_shared_profile localStorage contract
│   ├── scripts/                   ← per-page calculator logic (coop.ts, condo.ts, rent.ts, affordable.ts, compare.ts)
│   └── pages/
│       ├── index.astro            ← Landing page (NYC Affordability hub)
│       ├── about/index.astro
│       ├── privacy/index.astro
│       ├── affordable/index.astro
│       ├── compare/index.astro    ← Rent vs co-op vs condo comparison dashboard
│       ├── condo/index.astro
│       ├── coop/index.astro
│       └── rent/index.astro
├── public/                        ← pass-through static assets (images, robots.txt, ads.txt, sitemap.xml)
├── dist/                          ← Astro build output (git-ignored) — this is what wrangler deploys
├── functions/
│   └── [[path]].js                ← Cloudflare Worker routing entrypoint (unaffected by the build)
├── astro.config.mjs
├── package.json
├── wrangler.toml
└── README.md
```

The site is built with [Astro](https://astro.build) in static output mode: `npm run build` compiles `src/pages/*.astro` into plain HTML/CSS/JS in `dist/`, which Cloudflare Workers Static Assets serves exactly as it served hand-written `public/` files before this migration — no server rendering, no data ever leaves the browser. Adding a new page is one new file under `src/pages/<slug>/index.astro` that reuses the shared layout/header/footer components.

The `/compare/` dashboard reads the shared browser profile saved at `nyc_shared_profile` and can update it when the page's Save toggle is enabled, then combines that profile with each calculator's saved assumptions to compare max affordable rent, max co-op price, max condo price, cash required, monthly housing cost, DTI, reserve requirement, and binding constraint.

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
