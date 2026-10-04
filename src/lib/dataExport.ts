/* ============================================================
   Public data downloads (/data/*.json, /data/*.csv)
   ============================================================
   Builds every downloadable dataset from the same files the pages read,
   so a download can never disagree with the site. Pure and DOM-free:
   src/pages/data/[file].ts passes in the content collections and calls
   these builders at build time; test/dataExport.test.ts checks the rows.

   Every row says what kind of number it is:
   - 'cited':      a figure a named source published (value, period,
                   source and URL are always present).
   - 'assumption': a default the calculators start from; `basis` says
                   whether it's law, official data, a convention, or an
                   illustrative midpoint this site chose.
   - 'calculated': this site's math applied to a cited figure. Each row
                   names the figure it was computed from and the method.
   Nothing here is user input: the site has no backend and these files
   are generated at build time.
   ============================================================ */

import type { Assumption } from '../data/assumptions.ts';
import type { IndexSnapshot, IndexMetric } from '../data/affordabilityIndex.ts';
import { firstRent, type MarketFigure } from './marketFigures.ts';
import { requiredIncomeForRent, requiredIncomeForPrice, DEFAULT_ASSUMPTIONS } from './afford.ts';

export const DATA_LICENSE = {
  id: 'CC0-1.0',
  name: 'CC0 1.0 Universal (public domain dedication)',
  url: 'https://creativecommons.org/publicdomain/zero/1.0/',
  note: 'CC0 covers this site\'s compilation, calculations and assumptions. Cited market figures were published by the source named on each row; please credit them when you reuse those figures.',
} as const;

export type Cell = string | number | null;
export type Row = Record<string, Cell>;

export interface Dataset {
  id: string;
  title: string;
  description: string;
  kind: 'cited' | 'assumption' | 'calculated' | 'mixed';
  /** Column order for the CSV, and the field dictionary on /data/. */
  columns: { key: string; description: string }[];
  rows: Row[];
}

/** An area page's figures: a neighborhood or a borough hub. */
export interface AreaFigures {
  areaType: 'neighborhood' | 'borough';
  slug: string;
  name: string;
  borough: string;
  figures: MarketFigure[];
}

// ---- CSV ----

/** RFC 4180: quote a field that contains a comma, quote, CR or LF; double inner quotes. */
export function csvCell(v: Cell): string {
  if (v === null || v === undefined) return '';
  const s = String(v);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(ds: Dataset): string {
  const keys = ds.columns.map((c) => c.key);
  const lines = [keys.join(','), ...ds.rows.map((r) => keys.map((k) => csvCell(r[k] ?? null)).join(','))];
  return lines.join('\r\n') + '\r\n';
}

// ---- Datasets ----

const FIGURE_COLUMNS = [
  { key: 'kind', description: 'Always "cited": a figure published by the named source.' },
  { key: 'area_type', description: '"neighborhood" or "borough": which page on this site shows the figure.' },
  { key: 'area_slug', description: 'URL slug of that page.' },
  { key: 'area_name', description: 'Name of that page\'s area.' },
  { key: 'metric', description: '"median-rent" (median of new leases), "average-rent" (average on leases signed), or "median-sale-price".' },
  { key: 'value', description: 'The figure, in US dollars (monthly for rents).' },
  { key: 'unit_scope', description: 'Unit sizes covered: all, studio, 1br, 2br, 3br+.' },
  { key: 'property_scope', description: 'Property types covered: all, coop, condo, coop+condo.' },
  { key: 'geo_kind', description: 'What area the source measured: neighborhood, broker-zone, borough, or city. A wider area than the page means the figure is shared.' },
  { key: 'geo_name', description: 'The source\'s name for that area.' },
  { key: 'period', description: 'The period the source reports, as it states it.' },
  { key: 'label', description: 'Plain-language description shown on the page.' },
  { key: 'source', description: 'Who published the figure.' },
  { key: 'source_url', description: 'Where it was published.' },
];

export function marketFiguresDataset(areas: AreaFigures[]): Dataset {
  const rows = areas.flatMap((a) => a.figures.map((f) => ({
    kind: 'cited',
    area_type: a.areaType, area_slug: a.slug, area_name: a.name,
    metric: f.metric, value: f.value, unit_scope: f.unitScope, property_scope: f.propertyScope,
    geo_kind: f.geo.kind, geo_name: f.geo.name, period: f.period, label: f.label,
    source: f.source, source_url: f.sourceUrl,
  })));
  return {
    id: 'market-figures',
    title: 'Cited market figures by neighborhood and borough',
    description: 'Every rent and sale-price figure shown on a neighborhood or borough page, with the source, period and the area the source actually measured.',
    kind: 'cited',
    columns: FIGURE_COLUMNS,
    rows,
  };
}

/**
 * The cited figure each income calculation starts from, chosen the same way
 * the area pages choose it: the page's headline rent, and for each property
 * type the source's property-type median when it publishes one, otherwise
 * the first (blended) sale median.
 */
export function incomeBasis(figures: MarketFigure[]) {
  const sales = figures.filter((f) => f.metric === 'median-sale-price');
  return {
    rent: firstRent(figures),
    coop: sales.find((f) => f.propertyScope === 'coop') ?? sales[0],
    condo: sales.find((f) => f.propertyScope === 'condo') ?? sales[0],
  };
}

export function incomeNeededDataset(areas: AreaFigures[]): Dataset {
  const A = DEFAULT_ASSUMPTIONS;
  const rows: Row[] = [];
  for (const a of areas) {
    const b = incomeBasis(a.figures);
    const base = (f: MarketFigure) => ({
      kind: 'calculated', area_type: a.areaType, area_slug: a.slug, area_name: a.name,
      based_on_metric: f.metric, based_on_value: f.value, based_on_property_scope: f.propertyScope,
      based_on_period: f.period, based_on_source: f.source, based_on_source_url: f.sourceUrl,
    });
    if (b.rent) rows.push({
      ...base(b.rent), scenario: 'rent',
      income_needed: Math.round(requiredIncomeForRent({ targetRent: b.rent.value }).annualIncomeNeeded),
      method: `${A.rentIncomeMultiplier}x the monthly rent (landlord income rule)`,
    });
    for (const type of ['coop', 'condo'] as const) {
      const f = b[type];
      if (!f) continue;
      rows.push({
        ...base(f), scenario: type,
        income_needed: Math.round(requiredIncomeForPrice({ targetPrice: f.value, propertyType: type }).annualIncomeNeeded),
        method: type === 'coop'
          ? `Monthly housing cost at the co-op board DTI limit (${A.coopMaxDtiPct}%): ${A.coopMortgageRatePct}% ${A.coopLoanTermYears}-year rate, ${A.coopDownPaymentPct}% down, $${A.coopMaintenanceMo}/mo maintenance (site defaults)`
          : `Monthly housing cost at the lender DTI limit (${A.condoMaxDtiPct}%): ${A.condoMortgageRatePct}% ${A.condoLoanTermYears}-year rate, ${A.condoDownPaymentPct}% down, $${A.condoCommonChargesMo}/mo common charges, $${A.condoPropTaxesMo}/mo tax, $${A.condoHoInsuranceMo}/mo insurance (site defaults)`,
      });
    }
  }
  return {
    id: 'income-needed',
    title: 'Income needed for each cited figure (calculated)',
    description: 'This site\'s calculation of the annual income needed to rent at, or buy a co-op or condo at, each area\'s cited figure. Calculated, not measured: it changes when the site\'s defaults (mortgage rate, DTI limits) change.',
    kind: 'calculated',
    columns: [
      { key: 'kind', description: 'Always "calculated": this site\'s math, not a published figure.' },
      { key: 'area_type', description: '"neighborhood" or "borough".' },
      { key: 'area_slug', description: 'URL slug of the area page.' },
      { key: 'area_name', description: 'Name of the area.' },
      { key: 'scenario', description: '"rent", "coop" or "condo".' },
      { key: 'income_needed', description: 'Annual gross household income needed, US dollars, rounded to the dollar.' },
      { key: 'method', description: 'How it was calculated, including the key assumptions.' },
      { key: 'based_on_metric', description: 'Metric of the cited figure it starts from.' },
      { key: 'based_on_value', description: 'Value of that cited figure.' },
      { key: 'based_on_property_scope', description: 'Property types the cited figure covers.' },
      { key: 'based_on_period', description: 'Period of the cited figure.' },
      { key: 'based_on_source', description: 'Source of the cited figure.' },
      { key: 'based_on_source_url', description: 'URL of the cited figure\'s source.' },
    ],
    rows,
  };
}

export function affordabilityIndexDataset(snapshots: IndexSnapshot[]): Dataset {
  const metrics: [keyof IndexSnapshot, string][] = [
    ['medianRent', 'median-rent'], ['medianCoopPrice', 'median-coop-price'], ['medianCondoPrice', 'median-condo-price'],
  ];
  const rows: Row[] = snapshots.flatMap((s) => metrics.map(([k, metric]) => {
    const m = s[k] as IndexMetric | null;
    return m
      ? { kind: 'cited', published_month: s.publishedMonth, metric, status: 'tracked', value: m.value, as_of: m.asOf, source: m.source, source_url: m.url }
      : { kind: 'cited', published_month: s.publishedMonth, metric, status: 'not-yet-tracked', value: null, as_of: null, source: null, source_url: null };
  }));
  return {
    id: 'affordability-index',
    title: 'NYC Affordability Index history',
    description: 'Every published snapshot of the citywide index, one row per metric. A metric with no stable, dated source is listed as not yet tracked with a blank value rather than an estimate.',
    kind: 'cited',
    columns: [
      { key: 'kind', description: 'Always "cited".' },
      { key: 'published_month', description: 'Month the snapshot was published on this site (YYYY-MM). Each metric has its own as_of.' },
      { key: 'metric', description: '"median-rent", "median-coop-price" or "median-condo-price" (citywide).' },
      { key: 'status', description: '"tracked", or "not-yet-tracked" when no stable source was confirmed.' },
      { key: 'value', description: 'US dollars; blank when not yet tracked.' },
      { key: 'as_of', description: 'Period the source reports.' },
      { key: 'source', description: 'Who published the figure.' },
      { key: 'source_url', description: 'Where it was published.' },
    ],
    rows,
  };
}

export function amiDataset(amiBase: Record<number, number>, sourceUrl: string, year: number): Dataset {
  const rows: Row[] = Object.entries(amiBase).map(([size, v]) => ({
    kind: 'cited', year, household_size: Number(size), ami_100_pct: v,
    source: `NYC HPD, ${year} New York City Area AMI chart (HUD-derived)`, source_url: sourceUrl,
  }));
  return {
    id: `ami-${year}`,
    title: `NYC Area Median Income, ${year}`,
    description: `The 100% AMI row of HPD's ${year} chart by household size. Every other band (30%, 80%, 120%, 165%...) is this row scaled.`,
    kind: 'cited',
    columns: [
      { key: 'kind', description: 'Always "cited".' },
      { key: 'year', description: 'Chart year.' },
      { key: 'household_size', description: 'People in the household (1-8).' },
      { key: 'ami_100_pct', description: '100% AMI, US dollars per year.' },
      { key: 'source', description: 'Publisher.' },
      { key: 'source_url', description: 'Where it was published.' },
    ],
    rows,
  };
}

export function assumptionsDataset(assumptions: Record<string, Assumption>): Dataset {
  const rows: Row[] = Object.entries(assumptions).map(([key, a]) => ({
    kind: 'assumption', key, label: a.label, value: a.value, unit: a.unit, basis: a.basis,
    source_org: a.sourceOrg, source_url: a.sourceUrl,
    effective_date: a.effectiveDate ?? null, last_verified: a.lastVerified ?? null, notes: a.notes ?? null,
  }));
  return {
    id: 'assumptions',
    title: 'Calculator default assumptions',
    description: 'Every default the calculators start from, and what kind of number each one is. "illustrative" means a midpoint this site chose, not a measured figure.',
    kind: 'assumption',
    columns: [
      { key: 'kind', description: 'Always "assumption".' },
      { key: 'key', description: 'Identifier in src/data/assumptions.ts.' },
      { key: 'label', description: 'What the number is.' },
      { key: 'value', description: 'The default value.' },
      { key: 'unit', description: '%, USD, USD/mo, years, months or x.' },
      { key: 'basis', description: 'law, official-data, market-survey, convention, or illustrative.' },
      { key: 'source_org', description: 'Who publishes it, when there is a source.' },
      { key: 'source_url', description: 'Where, when a URL has been checked; blank otherwise.' },
      { key: 'effective_date', description: 'When the figure applies, if it has a date.' },
      { key: 'last_verified', description: 'Date someone last checked it against its source; blank if never recorded.' },
      { key: 'notes', description: 'Caveats.' },
    ],
    rows,
  };
}

/** The manifest at /data/index.json. */
export function manifest(datasets: Dataset[], generated: string) {
  return {
    title: 'nyc-affordability.com public data',
    homepage: 'https://nyc-affordability.com/data/',
    generated,
    license: DATA_LICENSE,
    datasets: datasets.map((d) => ({
      id: d.id, title: d.title, description: d.description, kind: d.kind, rows: d.rows.length,
      files: { json: `/data/${d.id}.json`, csv: `/data/${d.id}.csv` },
      columns: d.columns,
    })),
  };
}
