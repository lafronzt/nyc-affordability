/* ============================================================
   Who maintains and reviews the content
   ============================================================
   Rendered by src/components/Byline.astro on guides, glossary terms,
   and the methodology pages, in guide Article JSON-LD, and on /about/.

   REVIEWER is null until a named person with a relevant credential
   (attorney, CPA, licensed mortgage professional) has actually reviewed
   the content. While it's null, pages say so plainly instead of implying
   a review. Set `reviewed` to the date of the review, not today.
   ============================================================ */

export interface Person {
  name: string;
  url: string;
}

export interface Reviewer extends Person {
  credential: string;
  /** YYYY-MM-DD of the review. */
  reviewed: string;
}

export const MAINTAINER: Person = { name: 'Tyler La Fronz', url: 'https://tylerlafronz.com/Links/' };

export const REVIEWER: Reviewer | null = null;
