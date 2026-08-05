export interface FooterLink {
  label: string;
  /** Omitted renders a plain, non-linked list item. */
  href?: string;
}

export interface FooterColumn {
  heading: string;
  links: FooterLink[];
}

export const CALC_COOP: FooterLink = { label: 'NYC Co-op Affordability', href: '/coop/' };
export const CALC_CONDO: FooterLink = { label: 'NYC Condo Affordability', href: '/condo/' };
export const CALC_RENT: FooterLink = { label: 'NYC Rent Affordability', href: '/rent/' };
export const CALC_AFFORDABLE: FooterLink = { label: 'NYC Affordable Housing Calculator', href: '/affordable/' };
export const CALC_COMPARE: FooterLink = { label: 'Compare All Options', href: '/compare/' };
export const ALL_CALCULATORS: FooterLink[] = [CALC_COOP, CALC_CONDO, CALC_RENT, CALC_AFFORDABLE, CALC_COMPARE];
export const HUB_LINK: FooterLink = { label: 'NYC Affordability Hub', href: '/' };

/** All calculators except the current page, plus the hub link, in canonical order. */
export function otherCalculators(currentHref: string): FooterLink[] {
  return [...ALL_CALCULATORS.filter((c) => c.href !== currentHref), HUB_LINK];
}

export const ABOUT_LINK: FooterLink = { label: 'About This Project', href: '/about/' };
export const GUIDES_LINK: FooterLink = { label: 'Guides', href: '/guides/' };
export const PRIVACY_LINK: FooterLink = { label: 'Privacy Policy', href: '/privacy/' };
export const GITHUB_LINK: FooterLink = { label: 'View on GitHub', href: 'https://github.com/lafronzt/nyc-affordability' };
export const SUPPORT_LINK: FooterLink = { label: 'Support this project', href: 'https://buymeacoffee.com/lafronzt' };

/** Every page's "About" column ends up identical once GitHub/Coffee placement is normalized. */
export const STANDARD_ABOUT_COLUMN: FooterColumn = {
  heading: 'About',
  links: [ABOUT_LINK, GUIDES_LINK, PRIVACY_LINK, GITHUB_LINK, SUPPORT_LINK],
};

// Links repeated verbatim (same URL) across 2+ pages with today's labels already
// matching, or unified onto the more descriptive of two differing labels.
export const HPD_HOME_LINK: FooterLink = { label: 'NYC HPD (Housing Preservation & Development)', href: 'https://www.nyc.gov/site/hpd/index.page' };
export const CFPB_OWNING_HOME_LINK: FooterLink = { label: 'CFPB: Owning a Home Guide', href: 'https://www.consumerfinance.gov/owning-a-home/' };
export const MANSION_TAX_GUIDE_LINK: FooterLink = { label: 'NY Mansion Tax Guide (NYS Tax Dept.)', href: 'https://www.tax.ny.gov/pdf/publications/real_estate/pub1099.pdf' };
export const NYC_HPD_TENANT_RIGHTS_LINK: FooterLink = { label: 'NYC HPD Tenant Rights', href: 'https://www.nyc.gov/site/hpd/renters/tenantrights.page' };
