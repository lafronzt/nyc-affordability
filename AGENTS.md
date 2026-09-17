# Repository Guidelines

## Project Structure & Module Organization

This is a static Astro site for NYC housing affordability, served by Cloudflare Workers.

- `src/pages/`: file-based routes, including generated income and price pages.
- `src/components/`, `src/layouts/`, `src/styles/`: shared UI, page shells, and design tokens.
- `src/scripts/`: browser-side calculators; `src/lib/`: shared utilities and build-time affordability math.
- `src/content/`: Markdown guides, glossary entries, and neighborhoods; schemas live in `src/content.config.ts`.
- `src/data/`: price grids and versioned market snapshots.
- `public/`: static assets; `functions/[[path]].js`: Worker domain routing.
- `scripts/rename-sitemap.mjs`: sitemap postprocessing. `dist/` and `.astro/` are generated; do not edit or commit them.

## Build, Test, and Development Commands

- `npm ci`: install dependencies from `package-lock.json`.
- `npm run dev`: start Astro with hot reload.
- `npm run build`: generate `dist/` and normalize the sitemap to `dist/sitemap.xml`.
- `npm run preview`: preview the production Astro build.
- `npm run build` followed by `npx wrangler dev --local`: exercise Worker routing against built assets. Astro's dev server does not run hostname routing.

## Coding Style & Naming Conventions

Follow surrounding code: two-space indentation, single-quoted JavaScript/TypeScript strings, and semicolons. Use PascalCase for Astro components, camelCase for functions and variables, and kebab-case for content slugs. Reuse `BaseLayout`, shared headers, `Footer`, and `src/styles/tokens.css`. No formatter or lint command is configured.

Keep `src/lib/afford.ts` DOM-free. When changing calculator formulas, update corresponding logic in this module and `src/scripts/compare.ts`; read their header comments first.

## Testing Guidelines

No committed automated test suite, test naming convention, or coverage threshold exists. Playwright is a development dependency, but no test runner is configured. Run `npm run build` for changes, then manually check affected pages, calculator boundary cases, saved-input behavior, and mobile layouts. For routing changes, use the local Worker and requests with custom `Host` headers. Record validation in the PR.

## Commit & Pull Request Guidelines

Recent commits use concise imperative subjects, such as “Add guides and glossary terms”; merged subjects often include a PR number. Keep changes focused. PRs should describe the behavior change, link relevant issues, list validation, and include screenshots for visual changes.

## Content & Data Updates

Follow collection schemas and include dated citations. Neighborhood data must cite stable snapshots rather than live listing feeds. Distinguish calculated estimates from sourced market figures, and preserve each metric's observation date.
