import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { calculateCoop, type CoopAccount } from '../src/lib/engines/coop.ts';
import { calculateCondo, type CondoAccount } from '../src/lib/engines/condo.ts';
import { calculateRent, rentSnapshot, type RentAccount } from '../src/lib/engines/rent.ts';
import {
  coopInputsFromDefaults,
  condoInputsFromDefaults,
  rentInputsFromDefaults,
} from '../src/lib/engines/defaults.ts';
import { calcPmiMonthly } from '../src/lib/calc.ts';

// Golden fixtures for the shared engines that /coop/, /condo/, /rent/,
// /compare/, /reality-check/ and the build-time pages all run. The code was
// moved verbatim out of the page scripts. A browser snapshot of all five pages
// across 24 input scenarios was byte-identical before and after the move,
// except where /compare/ and /reality-check/ now apply PMI below 20% down.
// Profiles below are each calculator's own default sample accounts.

const near = (actual: number | null, expected: number, tol = 0.5) =>
  assert.ok(actual !== null && Math.abs(actual - expected) <= tol, `expected ${expected}, got ${actual}`);

const COOP_ACCOUNTS: CoopAccount[] = [
  { name: 'Checking', balance: 15000, liquidity: 100, closing: true },
  { name: 'High-Yield Savings', balance: 35000, liquidity: 100, closing: true },
  { name: 'Brokerage / Investments', balance: 70000, liquidity: 80, closing: true },
];
const CONDO_ACCOUNTS: CondoAccount[] = [
  { name: 'Checking', balance: 20000, liquidity: 100 },
  { name: 'High-Yield Savings', balance: 80000, liquidity: 100 },
  { name: 'Brokerage / Investments', balance: 200000, liquidity: 100 },
];
const RENT_ACCOUNTS: RentAccount[] = [
  { name: 'Checking', balance: 15000, liquidity: 100 },
  { name: 'High-Yield Savings', balance: 35000, liquidity: 100 },
  { name: 'Brokerage', balance: 20000, liquidity: 80 },
];

// Behavior tests use a fixed rate, not the site default, so they keep testing
// the same scenario when the weekly PMMS update moves the default (see
// .github/workflows/data-update-pmms.yml). Default-dependent figures are
// checked in test/afford.test.ts and test/guideExamples.test.ts instead.
const TEST_RATE = 6.95;

const coop = (o = {}) => calculateCoop(coopInputsFromDefaults({ accounts: COOP_ACCOUNTS, annualIncome: 150_000, mortgageRate: TEST_RATE, ...o }));
const condo = (o = {}) => calculateCondo(condoInputsFromDefaults({ accounts: CONDO_ACCOUNTS, annualIncome: 225_000, mortgageRate: TEST_RATE, ...o }));

// ---- Co-op ----

test('co-op: default profile is held back by post-closing reserves, not income', () => {
  const r = coop();
  near(r.maxPrice, 311_118.36);
  near(r.dtiMaxPrice, 434_324.21);
  assert.equal(r.binding, 'Cash / Reserves');
  near(r.totalCash, 105_999.9);
});

test('co-op: only accounts marked for closing pay the down payment and closing costs', () => {
  const r = coop({ accounts: COOP_ACCOUNTS.map((a) => ({ ...a, closing: a.name !== 'Brokerage / Investments' })) });
  near(r.maxPrice, 204_633.92);
  assert.equal(r.binding, 'DP / Closing Costs');
});

test('co-op: monthly debt shrinks the DTI ceiling but not the cash ceiling', () => {
  const r = coop({ otherDebts: 600 });
  near(r.dtiMaxPrice, 321_022.24);
  near(r.cashMax, 311_118.36);
});

test('co-op: below 20% down, PMI counts against DTI', () => {
  const r = coop({ dpPct: 10 });
  near(r.maxPrice, 354_799.68);
  assert.equal(r.binding, 'DTI / Income');
  near(r.moPmi, calcPmiMonthly(r.loanAmt, 0.10), 0.01);
  near(r.dtiActual, 0.28, 1e-6);
});

// ---- Condo ----

test('condo: default profile is DTI-bound with mortgage recording tax in closing costs', () => {
  const r = condo();
  near(r.maxPrice, 1_083_450.06);
  assert.equal(r.binding, 'DTI / Income');
  near(r.cc.total, 45_011.92);
  assert.ok(r.cc.mrt > 0 && r.cc.mansion > 0, 'priced over $1M with a loan: MRT and mansion tax both apply');
});

test('condo: below 20% down, PMI counts against DTI', () => {
  const r = condo({ dpPct: 10 });
  near(r.maxPrice, 885_070.95);
  near(r.moPmi, 464.66, 0.01);
});

test('condo: reserves toggle can make cash the binding constraint', () => {
  const r = condo({ reservesEnabled: true });
  near(r.maxPrice, 1_045_057.77);
  assert.equal(r.binding, 'Cash / Reserves');
  near(r.resReq, 47_155.14);
});

test('condo: working capital adds wcMonths x common charges to closing costs', () => {
  const off = condo();
  const on = condo({ workingCapEnabled: true });
  near(on.cc.total - off.cc.total, 2 * 1000, 0.01);
});

// ---- Rent ----

const rent = (o = {}) => {
  const inp = rentInputsFromDefaults({ accounts: RENT_ACCOUNTS, annualIncome: 75_000, ...o });
  const r = calculateRent(inp);
  return { r, s: rentSnapshot(r.maxRent, inp, r) };
};

test('rent: 40x rule binds for the default profile; move-in cash is rent + deposit + fees + reserves', () => {
  const { r, s } = rent();
  near(r.maxRent, 1_875);
  assert.equal(r.binding, 'Income (40× rule)');
  // $1,875 first month + $1,875 deposit + $20 + $250, plus 2 x ($1,875 + $15) reserve.
  // No building fee: landlords can't charge one (RPL §238-a), so it defaults to $0.
  near(s.totalCashNeeded, 7_800);
});

test('rent: thin savings make move-in cash the binding constraint', () => {
  const { r } = rent({ accounts: [{ name: 'Savings', balance: 4_000, liquidity: 100 }] });
  near(r.maxRent, (4_000 - 270) / 2); // (cash - fixed fees: $20 app + $250 utilities) / (first month + deposit)
  assert.equal(r.binding, 'Cash / Move-In');
});

test('rent: optional DTI screening subtracts debts and insurance', () => {
  const { r } = rent({ dtiEnabled: true, otherDebts: 800 });
  near(r.maxRent, 75_000 / 12 * 0.35 - 15 - 800);
  assert.equal(r.binding, 'Income (Rent-Burden)');
});

test('rent: a tenant-hired broker fee raises move-in cash', () => {
  near(rent({ brokerType: 'months' }).s.totalCashNeeded, 7_800 + 1_875);
});

// ---- Hidden-field defaults match the calculator pages ----
// /compare/, /reality-check/ and the build-time pages never show these
// fields, so they must default to exactly what the calculator page would.

function pageDefaults(page: string): Map<string, number> {
  const src = readFileSync(new URL(`../src/pages/${page}/index.astro`, import.meta.url), 'utf8');
  const out = new Map<string, number>();
  for (const tag of src.match(/<input\b[^>]*>/g) ?? []) {
    const id = tag.match(/\bid="([^"]+)"/)?.[1];
    const value = tag.match(/\bvalue="([^"]*)"/)?.[1];
    if (id && value !== undefined && value !== '' && !isNaN(Number(value))) out.set(id, Number(value));
  }
  for (const [, attrs, body] of src.matchAll(/<select\b([^>]*)>([\s\S]*?)<\/select>/g)) {
    const id = attrs.match(/\bid="([^"]+)"/)?.[1];
    const opts = [...body.matchAll(/<option\b([^>]*)>/g)].map((m) => m[1]);
    const v = (opts.find((o) => /\bselected\b/.test(o)) ?? opts[0])?.match(/\bvalue="([^"]*)"/)?.[1];
    if (id && v !== undefined) out.set(id, isNaN(Number(v)) ? (v as unknown as number) : Number(v));
  }
  return out;
}

const FIELD_IDS = {
  coop: {
    mortgageRate: 'mtg-rate', loanTerm: 'loan-term', dpPct: 'dp-pct', reserveMo: 'reserve-mo', maxDTIPct: 'max-dti',
    maint: 'monthly-maint', fcAtty: 'fc-atty', fcBankAtty: 'fc-bank-atty', fcCoop: 'fc-coop', fcMoveIn: 'fc-movein',
    fcOther: 'fc-other', varPct: 'var-pct',
  },
  condo: {
    mortgageRate: 'mtg-rate', loanTerm: 'loan-term', dpPct: 'dp-pct', reserveMo: 'reserve-mo', maxDtiPct: 'max-dti',
    commonCharges: 'common-charges', propTaxes: 'prop-taxes', hoInsurance: 'ho-insurance', fcAtty: 'fc-atty',
    fcLender: 'fc-lender', fcAppraisal: 'fc-appraisal', fcRecording: 'fc-recording', fcBuilding: 'fc-building',
    wcMonths: 'wc-months', titlePricePct: 'title-price-pct', titleLoanPct: 'title-loan-pct',
  },
  rent: {
    incomeMult: 'income-mult', dtiPct: 'dti-pct', guarantorMult: 'guarantor-mult', secDepositMonths: 'sec-deposit',
    appFee: 'app-fee', buildingFee: 'building-fee', utilitySetup: 'utility-setup', petFee: 'pet-fee',
    brokerType: 'broker-type', brokerFeePct: 'broker-pct', brokerFeeMonths: 'broker-months-val',
    brokerFlat: 'broker-flat-val', rentersInsurance: 'renters-insurance', reserveMonths: 'reserve-months',
  },
} as const;

const BUILT = {
  coop: coopInputsFromDefaults(),
  condo: condoInputsFromDefaults(),
  rent: rentInputsFromDefaults(),
};

for (const page of ['coop', 'condo', 'rent'] as const) {
  test(`${page}InputsFromDefaults matches every /${page}/ field default`, () => {
    const defaults = pageDefaults(page);
    for (const [field, id] of Object.entries(FIELD_IDS[page])) {
      assert.ok(defaults.has(id), `/${page}/ has no default for #${id}`);
      assert.equal((BUILT[page] as Record<string, unknown>)[field], defaults.get(id), `${field} vs /${page}/ #${id}`);
    }
  });
}
