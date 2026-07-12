import { defineCollection, z } from "astro:content";
import { glob } from "astro/loaders";

const ratgeber = defineCollection({
  loader: glob({ pattern: "**/*.mdx", base: "./src/content/ratgeber" }),
  schema: z.object({
    // SEO
    seoTitle: z.string().max(60),
    metaDescription: z.string().max(155),
    slug: z.string(),
    primaryKeyword: z.string(),
    secondaryKeywords: z.array(z.string()).default([]),
    targetCities: z.array(z.string()).default([]),
    schemaType: z.array(z.enum(["Article", "HowTo", "FAQPage"])).default(["Article"]),
    relatedArticles: z.array(z.string()).default([]), // slugs, e.g. "autoaufbereitung/kratzer-entfernen"

    // Content / display
    title: z.string(), // H1, may differ slightly from seoTitle
    category: z.enum(["autoaufbereitung", "fahrzeugankauf", "fahrzeugverkauf", "wissen", "standorte"]),
    subcategory: z.string().optional(), // e.g. pillar slug within autoaufbereitung
    summary: z.array(z.string()).min(3).max(7), // "Das Wichtigste auf einen Blick" bullets
    publishDate: z.coerce.date(),
    updatedDate: z.coerce.date().optional(),
    heroImage: z.string().optional(),
    faq: z
      .array(
        z.object({
          frage: z.string(),
          antwort: z.string(),
        })
      )
      .min(0)
      .max(15)
      .default([]),
  }),
});

export const collections = { ratgeber };
