import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';
import { CALCULATOR_PATHS } from './lib/footerLinks';
import { METRICS, UNIT_SCOPES, PROPERTY_SCOPES, GEO_KINDS } from './lib/marketFigures';

const guides = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/guides' }),
  schema: z.object({
    title: z.string(),
    metaDescription: z.string(),
    intro: z.string(),
    updated: z.string(),
    ogTitle: z.string().optional(),
    ogDescription: z.string().optional(),
    ogImage: z.string().default('/images/guides-og.png'),
    ogImageAlt: z.string().optional(),
    twitterTitle: z.string().optional(),
    twitterDescription: z.string().optional(),
    sources: z.array(
      z.object({
        label: z.string(),
        url: z.string().url(),
      })
    ),
    cta: z.object({
      heading: z.string(),
      body: z.string(),
      label: z.string(),
      href: z.string(),
    }),
    // Keep out of the sitemap and search index until the guide is real content.
    draft: z.boolean().default(false),
    // Slugs (not full paths) of other guides to surface in the "Related guides" list.
    relatedGuides: z.array(z.string()).default([]),
    // Slugs (not full paths) of glossary entries to surface in the "Related terms" list.
    relatedTerms: z.array(z.string()).default([]),
    // NYC Housing Rules knowledge-center grouping, shown on /guides/. Intentionally a
    // narrower set than the glossary's `category` enum (which also has taxes/general) —
    // every guide fits one of these five buying/renting/ownership-structure/income
    // buckets. 'income' was added alongside the Required Salary Calculator for guides
    // about what you earn rather than what you rent or buy (e.g. paycheck tax mechanics).
    category: z.enum(['renting', 'buying', 'coop', 'affordable-housing', 'income']),
    sitemap: z
      .object({
        changefreq: z.string().default('monthly'),
        priority: z.number().default(0.7),
      })
      .default({ changefreq: 'monthly', priority: 0.7 }),
  }),
});

const glossary = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/glossary' }),
  schema: z.object({
    term: z.string(),
    shortDefinition: z.string(),
    metaDescription: z.string(),
    updated: z.string(),
    ogTitle: z.string().optional(),
    ogDescription: z.string().optional(),
    ogImage: z.string().default('/images/glossary-og.png'),
    ogImageAlt: z.string().optional(),
    twitterTitle: z.string().optional(),
    twitterDescription: z.string().optional(),
    sources: z.array(
      z.object({
        label: z.string(),
        url: z.string().url(),
      })
    ),
    category: z.enum(['renting', 'buying', 'coop', 'affordable-housing', 'taxes', 'general']),
    relatedTerms: z.array(z.string()).default([]),
    relatedGuides: z.array(z.string()).default([]),
    // Calculator paths where this term actually gets computed, shown as a
    // "Run the numbers" block. test/contentLinks.test.ts requires at least one.
    relatedCalculators: z.array(z.enum(CALCULATOR_PATHS)).default([]),
    draft: z.boolean().default(false),
    sitemap: z
      .object({
        changefreq: z.string().default('yearly'),
        priority: z.number().default(0.5),
      })
      .default({ changefreq: 'yearly', priority: 0.5 }),
  }),
});

const neighborhoods = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/neighborhoods' }),
  schema: z.object({
    name: z.string(),
    borough: z.enum(['manhattan', 'brooklyn', 'queens', 'bronx', 'staten-island']),
    metaDescription: z.string(),
    intro: z.string(),
    updated: z.string(),
    // One record per cited number (see src/lib/marketFigures.ts): what it measures,
    // which unit sizes and property types, whether it covers this neighborhood alone
    // or a broker zone it shares, the period the source states, and the source.
    // Rent and sale figures come from different reports on different schedules,
    // so each carries its own period (distinct from `updated`, which is when this
    // page's content was last edited). The page shows the first rent and first
    // sale figure; test/neighborhoodFigures.test.ts enforces the quality gate.
    figures: z
      .array(
        z.object({
          metric: z.enum(METRICS),
          value: z.number().positive(),
          unitScope: z.enum(UNIT_SCOPES),
          propertyScope: z.enum(PROPERTY_SCOPES),
          geo: z.object({ kind: z.enum(GEO_KINDS), name: z.string(), definition: z.string().optional() }),
          period: z.string(),
          label: z.string(),
          source: z.string(),
          sourceUrl: z.string().url(),
        })
      )
      .refine((fs) => fs.some((f) => f.metric === 'median-rent' || f.metric === 'average-rent') && fs.some((f) => f.metric === 'median-sale-price'), {
        message: 'needs at least one rent figure (median-rent or average-rent) and one median-sale-price figure',
      }),
    // Per the citation policy for this collection: every figure must trace to a dated,
    // stable snapshot (a quarterly report PDF, a dated news article) — never a live/IDX
    // feed that changes after publication. See the fact-check workflow in the guides.
    sources: z.array(
      z.object({
        label: z.string(),
        url: z.string().url(),
      })
    ),
    ogTitle: z.string().optional(),
    ogDescription: z.string().optional(),
    ogImage: z.string().default('/images/neighborhoods-og.png'),
    ogImageAlt: z.string().optional(),
    twitterTitle: z.string().optional(),
    twitterDescription: z.string().optional(),
    relatedGuides: z.array(z.string()).default([]),
    relatedTerms: z.array(z.string()).default([]),
    // Keep out of the sitemap and search index until the neighborhood's data has been
    // fact-checked — matches the guides/glossary draft convention.
    draft: z.boolean().default(false),
    sitemap: z
      .object({
        // Market data goes stale faster than tax-code guides — weekly default reflects that,
        // even though the actual refresh cadence is an editorial process, not automatic.
        changefreq: z.string().default('weekly'),
        priority: z.number().default(0.6),
      })
      .default({ changefreq: 'weekly', priority: 0.6 }),
  }),
});

export const collections = { guides, glossary, neighborhoods };
