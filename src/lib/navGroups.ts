import {
  HUB_LINK,
  CALC_REALITY_CHECK, CALC_COOP, CALC_CONDO, CALC_RENT, CALC_AFFORDABLE, CALC_COMPARE,
  CALC_AFFORD_MORE, CALC_SAVINGS_PLANNER, CALC_RENT_VS_BUY, CALC_RATE_SENSITIVITY, CALC_COST_TO_MOVE, CALC_NET_PROCEEDS, CALC_REQUIRED_SALARY,
  GUIDE_40X_RULE, GUIDE_FARE_ACT, GUIDE_SECURITY_DEPOSIT, GUIDE_RENT_STABILIZATION, GUIDE_GUARANTOR_COMPANIES,
  GUIDE_CLOSING_COSTS, GUIDE_COOP_VS_CONDO, GUIDE_COOP_RESERVE, GUIDE_MANSION_TAX,
  GUIDE_SELLER_CLOSING_COSTS, GUIDE_FLIP_TAX, GUIDE_AMI,
  GUIDES_INDEX_LINK, GLOSSARY_INDEX_LINK, INCOME_INDEX_LINK, BUY_INDEX_LINK, RENT_PRICES_INDEX_LINK,
  NEIGHBORHOODS_INDEX_LINK, AFFORDABILITY_INDEX_LINK, SALARY_INDEX_LINK, SITE_DIRECTORY_LINK, METHODOLOGY_LINK, DATA_LINK, MY_DATA_LINK,
  type FooterLink,
} from './footerLinks.ts';
import { BOROUGH_HUBS } from '../data/boroughs.ts';

/* ============================================================
   Primary navigation, organized by what the visitor is trying to do
   ============================================================
   Brief item 23: journey-based entry points ("I want to rent", "I want
   to buy", "I already own", "I need affordable housing", "I'm comparing
   neighborhoods") instead of one flat list of calculators. Each group
   has tools (calculators and lookup pages) and reading (guides).

   Each page sits in one group, so only one group lights up as current.
   Only pages that exist are listed. When a journey's page ships (lease
   renewal, borough hubs, cost to move), add it here.
   test/navParity.test.ts checks every calculator appears in some group.
   ============================================================ */

export interface NavLink { label: string; href: string }
export interface NavGroup {
  id: string;
  label: string;
  /** One line under the group's heading in the open panel. */
  intro: string;
  tools: NavLink[];
  reading: NavLink[];
}
export type NavEntry = ({ kind: 'link' } & NavLink) | ({ kind: 'group' } & NavGroup);

const to = (l: FooterLink, label = l.label): NavLink => ({ label, href: l.href! });

export const NAV: NavEntry[] = [
  { kind: 'link', ...to(HUB_LINK, 'Home') },
  { kind: 'link', ...to(CALC_REALITY_CHECK, 'Start here') },
  {
    kind: 'group', id: 'rent', label: 'Rent', intro: 'I want to rent',
    tools: [
      to(CALC_RENT, 'What rent can I afford?'),
      to(RENT_PRICES_INDEX_LINK, 'Income needed by rent'),
      to(CALC_REQUIRED_SALARY, 'Salary I need'),
      to(CALC_COST_TO_MOVE, 'Cost to move'),
    ],
    reading: [
      to(GUIDE_40X_RULE, 'The 40x rule'),
      to(GUIDE_SECURITY_DEPOSIT, 'Move-in costs'),
      to(GUIDE_FARE_ACT, 'FARE Act broker fees'),
      to(GUIDE_GUARANTOR_COMPANIES, 'Guarantor companies'),
      to(GUIDE_RENT_STABILIZATION, 'Rent stabilization'),
    ],
  },
  {
    kind: 'group', id: 'buy', label: 'Buy', intro: 'I want to buy',
    tools: [
      to(CALC_COOP, 'Co-op calculator'),
      to(CALC_CONDO, 'Condo calculator'),
      to(CALC_AFFORD_MORE, 'How do I afford more?'),
      to(CALC_SAVINGS_PLANNER, 'Cash needed & savings plan'),
      to(CALC_RENT_VS_BUY, 'Rent vs buy'),
      to(CALC_RATE_SENSITIVITY, 'What if rates move?'),
      to(CALC_COMPARE, 'Compare rent, co-op, condo'),
      to(BUY_INDEX_LINK, 'Income needed by price'),
    ],
    reading: [
      to(GUIDE_CLOSING_COSTS, 'Closing costs'),
      to(GUIDE_COOP_VS_CONDO, 'Co-op vs condo costs'),
      to(GUIDE_COOP_RESERVE, 'Co-op reserve rules'),
      to(GUIDE_MANSION_TAX, 'Mansion tax'),
    ],
  },
  {
    kind: 'group', id: 'own', label: 'Own', intro: 'I already own',
    tools: [
      to(CALC_NET_PROCEEDS, 'What I\'d walk away with'),
    ],
    reading: [
      to(GUIDE_SELLER_CLOSING_COSTS, 'Seller closing costs'),
      to(GUIDE_FLIP_TAX, 'Co-op flip tax'),
    ],
  },
  {
    kind: 'group', id: 'affordable', label: 'Affordable', intro: 'I need affordable housing',
    tools: [
      to(CALC_AFFORDABLE, 'AMI & income-limit calculator'),
    ],
    reading: [
      to(GUIDE_AMI, 'AMI & Housing Connect'),
    ],
  },
  {
    kind: 'group', id: 'places', label: 'Neighborhoods', intro: 'I\'m comparing neighborhoods',
    tools: [
      to(NEIGHBORHOODS_INDEX_LINK, 'Neighborhood directory'),
      ...BOROUGH_HUBS.map((h) => ({ label: `${h.name} guide`, href: `/${h.slug}/` })),
      to(AFFORDABILITY_INDEX_LINK, 'Affordability Index'),
      to(INCOME_INDEX_LINK, 'What my income buys'),
    ],
    reading: [],
  },
  {
    kind: 'group', id: 'learn', label: 'Learn', intro: 'Background and references',
    tools: [
      to(SALARY_INDEX_LINK, 'Salary after taxes'),
      to(MY_DATA_LINK, 'Your saved data & scenarios'),
    ],
    reading: [
      to(GUIDES_INDEX_LINK, 'All guides'),
      to(GLOSSARY_INDEX_LINK, 'Glossary'),
      to(METHODOLOGY_LINK, 'Methodology & sources'),
      to(DATA_LINK, 'Data downloads'),
      to(SITE_DIRECTORY_LINK, 'Every page'),
    ],
  },
];

/** Every href in the nav, in order (duplicates removed). */
export function navHrefs(): string[] {
  const out: string[] = [];
  for (const e of NAV) {
    const links = e.kind === 'link' ? [e] : [...e.tools, ...e.reading];
    for (const l of links) if (!out.includes(l.href)) out.push(l.href);
  }
  return out;
}
