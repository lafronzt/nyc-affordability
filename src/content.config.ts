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
    sitemap: z
      .object({
        changefreq: z.string().default('monthly'),
        priority: z.number().default(0.7),
      })
      .default({ changefreq: 'monthly', priority: 0.7 }),
  }),
});

export const collections = { guides };
