# Repository Guidelines

## Project Structure & Module Organization

This static Astro site covers NYC housing affordability and runs on Cloudflare Workers.

- `src/pages/`: file-based routes and generated income/price pages.
- `src/components/`, `src/layouts/`, `src/styles/`: shared UI, shells, and design tokens.
- `src/scripts/`: browser behavior; `src/lib/engines/`: pure calculation engines.
- `src/content/`: Markdown collections; schemas in `src/content.config.ts`.
- `src/data/`: assumptions, market snapshots, Census ACS figures, and editorial history.
- `test/`: tests and fixtures; `public/`: assets and security headers.
- `functions/[[path]].js`: Worker routing; `wrangler.toml`: deployment configuration.
- `scripts/`: build, link-check, and data-update utilities; `.github/workflows/`: scheduled checks.

Do not edit or commit generated `dist/` or `.astro/` files.

## Build, Test, and Development Commands

- `npm ci`: install locked dependencies.
- `npm run dev`: start Astro with hot reload.
- `npm run build`: generate `dist/`, normalize `sitemap.xml`, and check inline scripts against `public/_headers` CSP.
- `npm run preview`: preview the production build.
- `npm test`: run Node's test runner with TypeScript stripping.
- `npm run check-links`: check external links in `src/`; requires network.
- After building, `npx wrangler dev --local`: exercise Worker routing; Astro dev does not run hostname routing.

## Coding Style & Naming Conventions

Use two-space indentation, single-quoted JavaScript/TypeScript strings, and semicolons. Use PascalCase components, camelCase functions/variables, and kebab-case slugs. Reuse `BaseLayout`, headers, `Footer`, and `src/styles/tokens.css`. No formatter or lint command is configured.

Read module headers before changing formulas. Keep engines and `afford.ts` DOM-free; reuse `housingOptions.ts` for comparison models. Centralize defaults in `src/data/assumptions.ts`.

## Testing Guidelines

Use `test/*.test.ts`, `node:test`, and `node:assert/strict`. Cover calculations, storage, data, and consistency checks; no coverage threshold exists. Add a failing regression test before changing existing formulas.

For DOM changes, build and manually check affected pages, boundary inputs, saved data, and mobile layouts. Playwright has no configured browser runner. Check Worker routing with custom `Host` headers.

## Commit & Pull Request Guidelines

Use concise imperative subjects, such as “Add new Open Graph images.” Keep changes focused. PRs should explain behavior changes, link issues, record validation, and include screenshots for visual changes.

## Content, Data & Privacy

Follow collection schemas. Cite dated, stable snapshots; preserve observation dates and distinguish calculated estimates. Record numerical changes in `src/data/siteChanges.ts`; engineering-log `Fix:` entries need public corrections.

Keep personal finances out of URLs. Save inputs only with opt-in; register storage keys in `src/lib/profileStore.ts`.
