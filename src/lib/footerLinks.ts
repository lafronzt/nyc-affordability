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

export const GUIDE_MANSION_TAX: FooterLink = { label: 'NYC Mansion Tax Explained', href: '/guides/nyc-mansion-tax-explained/' };
export const GUIDE_COOP_RESERVE: FooterLink = { label: 'Co-op Board Reserve Requirements', href: '/guides/coop-board-reserve-requirements/' };
export const GUIDE_FARE_ACT: FooterLink = { label: 'FARE Act Broker Fees Explained', href: '/guides/fare-act-broker-fees-explained/' };
export const GUIDE_AMI: FooterLink = { label: 'NYC AMI & Housing Connect Explained', href: '/guides/nyc-ami-housing-connect-explained/' };
export const GUIDE_40X_RULE: FooterLink = { label: "NYC's 40x Rent Rule", href: '/guides/nyc-40x-rent-rule/' };
export const GUIDE_COOP_VS_CONDO: FooterLink = { label: 'Co-op vs Condo: What Costs More', href: '/guides/coop-vs-condo-nyc-costs/' };
export const GUIDE_INCOME_NEEDED: FooterLink = { label: 'Income Needed to Buy in NYC', href: '/guides/income-needed-to-buy-nyc-apartment/' };
export const GUIDE_CLOSING_COSTS: FooterLink = { label: 'NYC Closing Costs for Buyers', href: '/guides/nyc-closing-costs-for-buyers/' };
export const GUIDE_PMI: FooterLink = { label: 'PMI on NYC Condos Explained', href: '/guides/pmi-on-nyc-condos-explained/' };
export const GUIDE_FLIP_TAX: FooterLink = { label: 'Co-op Flip Tax in NYC Explained', href: '/guides/coop-flip-tax-nyc-explained/' };
export const GUIDE_BOARD_APPROVAL: FooterLink = { label: 'How Co-op Board Approval Works', href: '/guides/coop-board-approval-process/' };
export const GUIDE_SECURITY_DEPOSIT: FooterLink = { label: 'Security Deposits & Move-In Costs', href: '/guides/nyc-security-deposit-move-in-costs/' };
export const ALL_GUIDES: FooterLink[] = [
  GUIDE_MANSION_TAX,
  GUIDE_COOP_RESERVE,
  GUIDE_FARE_ACT,
  GUIDE_AMI,
  GUIDE_40X_RULE,
  GUIDE_COOP_VS_CONDO,
  GUIDE_INCOME_NEEDED,
  GUIDE_CLOSING_COSTS,
  GUIDE_PMI,
  GUIDE_FLIP_TAX,
  GUIDE_BOARD_APPROVAL,
  GUIDE_SECURITY_DEPOSIT,
];

/** Standalone Guides entry for the primary navbar (a different surface than the
    footer's dedicated Guides column, so this does not reintroduce the duplicate
    /guides/ link the footer intentionally dropped — see note above). */
export const GUIDES_INDEX_LINK: FooterLink = { label: 'Guides', href: '/guides/' };

export const ABOUT_LINK: FooterLink = { label: 'About This Project', href: '/about/' };
export const CONTACT_LINK: FooterLink = { label: 'Contact', href: '/contact/' };
export const PRIVACY_LINK: FooterLink = { label: 'Privacy Policy', href: '/privacy/' };
export const TERMS_LINK: FooterLink = { label: 'Terms of Service', href: '/terms/' };
export const GITHUB_LINK: FooterLink = { label: 'View on GitHub', href: 'https://github.com/lafronzt/nyc-affordability' };
export const SUPPORT_LINK: FooterLink = { label: 'Support this project', href: 'https://buymeacoffee.com/lafronzt' };

/** Every page's "About" column ends up identical once GitHub/Coffee placement is normalized.
    "Guides" now has its own dedicated footer column (ALL_GUIDES) alongside "Calculators",
    so the old standalone GUIDES_LINK entry here was dropped to avoid a duplicate /guides/ link. */
export const STANDARD_ABOUT_COLUMN: FooterColumn = {
  heading: 'About',
  links: [ABOUT_LINK, CONTACT_LINK, PRIVACY_LINK, TERMS_LINK, GITHUB_LINK, SUPPORT_LINK],
};

// Links repeated verbatim (same URL) across 2+ pages with today's labels already
// matching, or unified onto the more descriptive of two differing labels.
export const HPD_HOME_LINK: FooterLink = { label: 'NYC HPD (Housing Preservation & Development)', href: 'https://www.nyc.gov/site/hpd/index.page' };
export const CFPB_OWNING_HOME_LINK: FooterLink = { label: 'CFPB: Owning a Home Guide', href: 'https://www.consumerfinance.gov/owning-a-home/' };
export const MANSION_TAX_GUIDE_LINK: FooterLink = { label: 'NY Mansion Tax Guide (NYS Tax Dept.)', href: 'https://www.tax.ny.gov/pdf/publications/real_estate/pub1099.pdf' };
export const NYC_HPD_TENANT_RIGHTS_LINK: FooterLink = { label: 'NYC HPD Tenant Rights', href: 'https://www.nyc.gov/site/hpd/renters/tenantrights.page' };
