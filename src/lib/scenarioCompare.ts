import { defaultSharedAssumptions } from './engines/defaults.ts';
import {
  SAMPLE_PROFILE, profileInputs, weightedAssets, rentOption, coopOption, condoOption,
  type BaseInputs, type SharedAssumptions, type RentResult, type BuyResult,
} from './housingOptions.ts';
import type { Snapshot } from './profileStore.ts';

/* ============================================================
   Scenario A/B: two saved snapshots, side by side
   ============================================================
   Runs each snapshot through the /compare/ model (lib/housingOptions):
   the saved profile plus the saved rent/co-op/condo assumptions. Anything
   a snapshot didn't save falls back the way /compare/ does: the sample
   profile, or the site default for an assumption. Every row says which
   values came from a default, so a scenario saved before a rate change
   isn't silently compared at today's rate without saying so.

   Pure and DOM-free; tested in test/scenarioCompare.test.ts.
   ============================================================ */

export type Source = 'saved' | 'default';

export interface ScenarioModel {
  base: BaseInputs;
  asmp: SharedAssumptions;
  profile: 'saved' | 'sample';
  assumptions: { rent: Source; coop: Source; condo: Source };
}

export interface ScenarioOutcome extends ScenarioModel {
  cash: number;
  rent: RentResult;
  coop: BuyResult;
  condo: BuyResult;
}

const parse = (raw: string | undefined): any => {
  if (!raw) return null;
  try { const v = JSON.parse(raw); return v && typeof v === 'object' && !Array.isArray(v) ? v : null; } catch { return null; }
};

/** Overlay saved numeric fields onto a default set; ignore anything else. */
function overlay<T extends Record<string, number>>(defaults: T, saved: any): { value: T; source: Source } {
  if (!saved) return { value: defaults, source: 'default' };
  const value = { ...defaults };
  let any = false;
  for (const k of Object.keys(defaults) as (keyof T)[]) {
    const n = Number(saved[k]);
    if (saved[k] !== undefined && saved[k] !== '' && isFinite(n)) { value[k] = n as T[keyof T]; any = true; }
  }
  return { value, source: any ? 'saved' : 'default' };
}

export function scenarioModel(data: Snapshot): ScenarioModel {
  const profile = parse(data.nyc_shared_profile);
  const d = defaultSharedAssumptions();
  const rent = overlay(d.rent, parse(data.nyc_shared_assumptions_rent));
  const coop = overlay(d.coop, parse(data.nyc_shared_assumptions_coop));
  const condo = overlay(d.condo, parse(data.nyc_shared_assumptions_condo));
  return {
    base: profileInputs(profile ?? SAMPLE_PROFILE),
    asmp: { rent: rent.value, coop: coop.value, condo: condo.value },
    profile: profile ? 'saved' : 'sample',
    assumptions: { rent: rent.source, coop: coop.source, condo: condo.source },
  };
}

export function scenarioOutcome(data: Snapshot): ScenarioOutcome {
  const m = scenarioModel(data);
  return {
    ...m,
    cash: weightedAssets(m.base.accounts),
    rent: rentOption(m.base, m.asmp),
    coop: coopOption(m.base, m.asmp),
    condo: condoOption(m.base, m.asmp),
  };
}

// ---- Rows for the side-by-side table ----

export type Format = 'money' | 'monthly' | 'pct' | 'rate' | 'number' | 'text';

export interface CompareRow {
  label: string;
  format: Format;
  a: number | string;
  b: number | string;
  /** b - a for numbers; null for text rows. */
  delta: number | null;
  /** Which side is better for the visitor, when that's unambiguous. */
  better: 'a' | 'b' | null;
  /** Values that came from a site default rather than the scenario. */
  defaultA: boolean;
  defaultB: boolean;
}

export interface CompareSection {
  id: 'inputs' | 'rent' | 'coop' | 'condo';
  title: string;
  /** "Your numbers" or "Calculated", so estimates are always labeled. */
  kind: 'inputs' | 'calculated';
  rows: CompareRow[];
}

// Differences smaller than this are rounding, not a difference.
const EPS: Record<Format, number> = { money: 0.5, monthly: 0.5, pct: 0.0005, rate: 0.0005, number: 0.0005, text: 0 };

function row(label: string, format: Format, a: number | string, b: number | string, opts: { higher?: 'better' | 'worse'; defaultA?: boolean; defaultB?: boolean } = {}): CompareRow {
  // Dollar rows are shown in whole dollars, so compare whole dollars: the
  // difference column then always equals B minus A as displayed.
  if (format === 'money' || format === 'monthly') {
    if (typeof a === 'number') a = Math.round(a);
    if (typeof b === 'number') b = Math.round(b);
  }
  const numeric = typeof a === 'number' && typeof b === 'number';
  const delta = numeric ? (b as number) - (a as number) : null;
  const same = numeric ? Math.abs(delta!) < EPS[format] : a === b;
  let better: CompareRow['better'] = null;
  if (numeric && !same && opts.higher) better = (delta! > 0) === (opts.higher === 'better') ? 'b' : 'a';
  return { label, format, a, b, delta: same && numeric ? 0 : delta, better, defaultA: !!opts.defaultA, defaultB: !!opts.defaultB };
}

export function compareScenarios(A: ScenarioOutcome, B: ScenarioOutcome): CompareSection[] {
  const sa = A.profile === 'sample', sb = B.profile === 'sample';
  const ra = A.assumptions.rent === 'default', rb = B.assumptions.rent === 'default';
  const ca = A.assumptions.coop === 'default', cb = B.assumptions.coop === 'default';
  const da = A.assumptions.condo === 'default', db = B.assumptions.condo === 'default';
  return [
    {
      id: 'inputs', title: 'Your numbers', kind: 'inputs', rows: [
        row('Annual income', 'money', A.base.annualIncome, B.base.annualIncome, { higher: 'better', defaultA: sa, defaultB: sb }),
        row('Other monthly debts', 'monthly', A.base.otherDebts, B.base.otherDebts, { higher: 'worse', defaultA: sa, defaultB: sb }),
        row('Cash available (liquidity-weighted)', 'money', A.cash, B.cash, { higher: 'better', defaultA: sa, defaultB: sb }),
        row('Co-op mortgage rate', 'rate', A.asmp.coop.mortgageRate, B.asmp.coop.mortgageRate, { higher: 'worse', defaultA: ca, defaultB: cb }),
        row('Co-op down payment', 'rate', A.asmp.coop.dpPct, B.asmp.coop.dpPct, { defaultA: ca, defaultB: cb }),
        row('Co-op maintenance', 'monthly', A.asmp.coop.maint, B.asmp.coop.maint, { higher: 'worse', defaultA: ca, defaultB: cb }),
        row('Condo mortgage rate', 'rate', A.asmp.condo.mortgageRate, B.asmp.condo.mortgageRate, { higher: 'worse', defaultA: da, defaultB: db }),
        row('Condo down payment', 'rate', A.asmp.condo.dpPct, B.asmp.condo.dpPct, { defaultA: da, defaultB: db }),
        row('Condo common charges + taxes', 'monthly', A.asmp.condo.commonCharges + A.asmp.condo.propTaxes, B.asmp.condo.commonCharges + B.asmp.condo.propTaxes, { higher: 'worse', defaultA: da, defaultB: db }),
        row('Rent income rule', 'number', A.asmp.rent.incomeMult, B.asmp.rent.incomeMult, { higher: 'worse', defaultA: ra, defaultB: rb }),
      ],
    },
    {
      id: 'rent', title: 'Renting', kind: 'calculated', rows: [
        row('Max rent', 'monthly', A.rent.maxRent, B.rent.maxRent, { higher: 'better' }),
        row('Cash to sign a lease', 'money', A.rent.cashRequired, B.rent.cashRequired),
        row('What limits it', 'text', A.rent.binding, B.rent.binding),
      ],
    },
    {
      id: 'coop', title: 'Buying a co-op', kind: 'calculated', rows: [
        row('Max price', 'money', A.coop.maxPrice, B.coop.maxPrice, { higher: 'better' }),
        row('Monthly cost at that price', 'monthly', A.coop.monthlyTotal, B.coop.monthlyTotal),
        row('Cash needed at closing', 'money', A.coop.cashRequired, B.coop.cashRequired),
        row('What limits it', 'text', A.coop.binding, B.coop.binding),
      ],
    },
    {
      id: 'condo', title: 'Buying a condo', kind: 'calculated', rows: [
        row('Max price', 'money', A.condo.maxPrice, B.condo.maxPrice, { higher: 'better' }),
        row('Monthly cost at that price', 'monthly', A.condo.monthlyTotal, B.condo.monthlyTotal),
        row('Cash needed at closing', 'money', A.condo.cashRequired, B.condo.cashRequired),
        row('What limits it', 'text', A.condo.binding, B.condo.binding),
      ],
    },
  ];
}

const orList = (xs: string[]) => (xs.length < 3 ? xs.join(' or ') : `${xs.slice(0, -1).join(', ')}, or ${xs[xs.length - 1]}`);
const usd = (n: number) => '$' + Math.round(Math.abs(n)).toLocaleString('en-US');

/**
 * Plain sentences for the top of the comparison: how the three ceilings
 * moved from A to B, and anything that came from a default. Max price
 * rises with cash and income, so "more" is the only judgement made here.
 */
export function summarize(A: ScenarioOutcome, B: ScenarioOutcome, names: { a: string; b: string }): string[] {
  const out: string[] = [];
  const diff = (what: string, a: number, b: number, unit = '') => {
    const d = Math.round(b) - Math.round(a);
    if (Math.abs(d) < 0.5) return `${what}: the same in both.`;
    return `${what}: ${names.b} reaches ${usd(d)}${unit} ${d > 0 ? 'more' : 'less'} than ${names.a}.`;
  };
  out.push(diff('Rent', A.rent.maxRent, B.rent.maxRent, '/mo'));
  out.push(diff('Co-op', A.coop.maxPrice, B.coop.maxPrice));
  out.push(diff('Condo', A.condo.maxPrice, B.condo.maxPrice));
  for (const [s, name] of [[A, names.a], [B, names.b]] as const) {
    if (s.profile === 'sample') out.push(`${name} has no saved profile, so it uses the sample profile (as /compare/ does).`);
    const dflt = (['rent', 'coop', 'condo'] as const).filter((k) => s.assumptions[k] === 'default');
    if (dflt.length) out.push(`${name} didn't save ${orList(dflt.map((k) => (k === 'coop' ? 'co-op' : k)))} assumptions, so it uses today's site defaults for them.`);
  }
  return out;
}
