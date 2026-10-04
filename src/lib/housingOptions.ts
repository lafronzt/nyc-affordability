import { calculateCoop } from './engines/coop.ts';
import { calculateCondo } from './engines/condo.ts';
import { calculateRent, rentSnapshot } from './engines/rent.ts';
import { coopInputsFromDefaults, condoInputsFromDefaults, rentInputsFromDefaults, defaultSharedAssumptions } from './engines/defaults.ts';

/* ============================================================
   Rent vs co-op vs condo from one profile: the /compare/ model
   ============================================================
   One profile (income, debts, accounts) plus the short assumption sets
   the calculators save (nyc_shared_assumptions_*), run through the same
   engines as the calculators. Fields outside those sets use the sourced
   defaults (engines/defaults.ts).

   Used by /compare/ (src/scripts/compare.ts) and the scenario A/B view
   on /my-data/ (src/lib/scenarioCompare.ts), so the two always agree.
   Pure and DOM-free.
   ============================================================ */

export interface Account {
  name: string;
  balance: number;
  liquidity: number;
  closing: boolean;
  [key: string]: unknown;
}

export interface BaseInputs {
  annualIncome: number;
  otherDebts: number;
  accounts: Account[];
}

export type SharedAssumptions = ReturnType<typeof defaultSharedAssumptions>;

export interface CommonResult {
  cashRequired: number;
  monthlyTotal: number;
  dti: number;
  reserve: number;
  binding: string;
}
export interface RentResult extends CommonResult { maxRent: number }
export interface BuyResult extends CommonResult { maxPrice: number }

/** The profile /compare/ shows when nothing is saved. */
export const SAMPLE_PROFILE: BaseInputs = {
  annualIncome: 150000,
  otherDebts: 0,
  accounts: [
    { name: 'Checking', balance: 15000, liquidity: 100, closing: true },
    { name: 'High-Yield Savings', balance: 35000, liquidity: 100, closing: true },
    { name: 'Brokerage / Investments', balance: 70000, liquidity: 80, closing: true },
  ],
};

export const num = (v: unknown): number => { const n = Number(v); return isFinite(n) ? n : 0; };

/** Saved accounts in any of the shapes the calculators have written over time. Empty → the sample accounts. */
export function normalizeAccounts(accounts: unknown): Account[] {
  const list = (Array.isArray(accounts) && accounts.length ? accounts : SAMPLE_PROFILE.accounts) as any[];
  return list.map((a) => {
    const balance = num(a.balance);
    const liquidity = a.liquidity !== undefined ? num(a.liquidity) : (a.closing ? 100 : (a.reserve !== undefined ? num(a.reserve) : 0));
    const closing = a.closing !== undefined ? !!a.closing : liquidity >= 100;
    return { name: a.name || 'Account', balance, liquidity, closing };
  });
}

export function profileInputs(profile: any): BaseInputs {
  return {
    annualIncome: num(profile.annualIncome),
    otherDebts: num(profile.otherDebts),
    accounts: normalizeAccounts(profile.accounts),
  };
}

export function weightedAssets(accounts: Account[]): number {
  return accounts.reduce((s, a) => s + a.balance * a.liquidity / 100, 0);
}

export function rentOption(base: BaseInputs, asmp: SharedAssumptions): RentResult {
  const inp = rentInputsFromDefaults({
    ...base,
    incomeMult: asmp.rent.incomeMult,
    rentersInsurance: asmp.rent.rentersInsurance,
    reserveMonths: asmp.rent.reserveMonths,
  });
  const r = calculateRent(inp);
  const snap = rentSnapshot(r.maxRent, inp, r);
  return {
    maxRent: r.maxRent,
    cashRequired: snap.totalCashNeeded,
    monthlyTotal: r.maxRent + inp.rentersInsurance, // housing cost only; debts count in DTI below
    dti: snap.totalDTI / 100,
    reserve: snap.reserveBuffer,
    binding: r.binding,
  };
}

export function coopOption(base: BaseInputs, asmp: SharedAssumptions, rateOverride?: number): BuyResult {
  const r = calculateCoop(coopInputsFromDefaults({
    ...base,
    mortgageRate: rateOverride ?? asmp.coop.mortgageRate,
    dpPct: asmp.coop.dpPct,
    reserveMo: asmp.coop.reserveMo,
    maxDTIPct: asmp.coop.maxDTIPct,
    maint: asmp.coop.maint,
  }));
  return {
    maxPrice: r.maxPrice,
    cashRequired: r.totalCash,
    monthlyTotal: r.moTotal,
    dti: r.dtiActual,
    reserve: r.maintRes + r.mtgRes,
    binding: r.binding,
  };
}

export function condoOption(base: BaseInputs, asmp: SharedAssumptions, rateOverride?: number): BuyResult {
  const r = calculateCondo(condoInputsFromDefaults({
    ...base,
    mortgageRate: rateOverride ?? asmp.condo.mortgageRate,
    dpPct: asmp.condo.dpPct,
    maxDtiPct: asmp.condo.maxDtiPct,
    commonCharges: asmp.condo.commonCharges,
    propTaxes: asmp.condo.propTaxes,
    hoInsurance: asmp.condo.hoInsurance,
  }));
  return {
    maxPrice: r.maxPrice,
    cashRequired: r.totalCash,
    monthlyTotal: r.moTotal,
    dti: r.dtiActual,
    reserve: r.resReq,
    binding: r.binding,
  };
}
