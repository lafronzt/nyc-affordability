const SITE_ORIGIN = 'https://www.nyc-affordability.com';

export interface BreadcrumbItem {
  name: string;
  /** Absolute path, e.g. '/', '/guides/', '/guides/some-guide/'. */
  path: string;
}

/** Builds a schema.org BreadcrumbList for Google's breadcrumb rich result. */
export function buildBreadcrumbJsonLd(items: BreadcrumbItem[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: item.name,
      item: `${SITE_ORIGIN}${item.path}`,
    })),
  };
}
