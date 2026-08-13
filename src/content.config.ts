import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

const guides = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/guides' }),
  schema: z.object({
    title: z.string(),
    metaDescription: z.string(),
    intro: z.string(),
    updated: z.string(),
    ogTitle: z.string().optional(),
    ogDescription: z.string().optional(),
    ogImage: z.string().default('/images/general-og.png'),
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
    // every guide fits one of these four buying/renting/ownership-structure buckets.
    category: z.enum(['renting', 'buying', 'coop', 'affordable-housing']),
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
    ogImage: z.string().default('/images/general-og.png'),
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
    // Kept as separate number + label pairs rather than a fixed "1BR"/"studio" shape —
    // what's actually available varies by neighborhood and source (some report an
    // overall median, some break out by bedroom count), so the label makes explicit
    // exactly what the number represents rather than implying false precision.
    medianRent: z.number(),
    medianRentLabel: z.string(),
    // Rent and sale figures routinely come from different reports published on different
    // schedules — a single shared "as of" date would hide that gap, so each metric carries
    // its own (distinct from `updated`, which is when this page's content was last edited).
    medianRentAsOf: z.string(),
    medianSalePrice: z.number(),
    medianSalePriceLabel: z.string(),
    medianSalePriceAsOf: z.string(),
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
    ogImage: z.string().default('/images/general-og.png'),
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
