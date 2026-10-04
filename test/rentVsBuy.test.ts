import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calculateSale, type SaleInputs } from '../src/lib/engines/sale.ts';
import { calculateCondo } from '../src/lib/engines/condo.ts';
import { condoInputsFromDefaults } from '../src/lib/engines/defaults.ts';
import { defaultRentVsBuyInputs, purchaseFor, compareRentVsBuy, breakEvenRent } from '../src/lib/engines/rentVsBuy.ts';

// Sale engine (moved verbatim from src/scripts/sell.ts) plus the rent vs buy
// projection built on it. The projection has to reduce to arithmetic you can
// check by hand when growth and returns are zero.

const near = (a: number, b: number, tol = 1) => assert.ok(Math.abs(a - b) <= tol, `expected ${b}, got ${a}`);

// /sell/ page defaults.
const sell = (o: Partial<SaleInputs> = {}): SaleInputs => ({
  propertyType: 'condo', salePrice: 1_200_000, mortgageBalance: 500_000, purchasePrice: 700_000, capImprovements: 0,
  brokerPct: 5, attorneyFee: 2_500, titleMiscFee: 1_000, flipTaxPct: 2, coopTransferFee: 500,
  capGainsEnabled: false, filingStatus: 'single', fedLtcgPct: 15, nyCombinedPct: 10.3, ...o,
});

test('sale engine: /sell/ default condo waterfall (golden)', () => {
  const w = calculateSale(sell());
  near(w.brokerFee, 60_000, 0.01);
  near(w.rptt, 17_100, 0.01); // 1.425% above $500K
  near(w.nysTax, 4_800, 0.01); // 0.4% below $3M
  assert.equal(w.flipTax, 0);
  assert.equal(w.coopFee, 0);
  near(w.sellingCosts, 85_400, 0.01);
  near(w.netProceeds, 614_600, 0.01);
});

test('sale engine: co-op adds flip tax and transfer fee; capital gains after the exclusion', () => {
  const coop = calculateSale(sell({ propertyType: 'coop' }));
  near(coop.flipTax, 24_000, 0.01);
  near(coop.sellingCosts, 109_900, 0.01);
  const taxed = calculateSale(sell({ capGainsEnabled: true }));
  near(taxed.taxableGain, 1_114_600 - 700_000 - 250_000, 0.01);
  near(taxed.capGainsTax, 164_600 * 0.253, 0.01);
  near(calculateSale(sell({ capGainsEnabled: true, filingStatus: 'mfj' })).capGainsTax, 0, 0.01);
});

// Behavior tests use a fixed rate, not the site default, so they keep testing
// the same scenario when the weekly PMMS update moves the default (see
// .github/workflows/data-update-pmms.yml). Default-dependent figures are
// checked in test/afford.test.ts and test/guideExamples.test.ts instead.
const TEST_RATE = 6.95;

const flat = (type: 'coop' | 'condo', o = {}) => defaultRentVsBuyInputs(type, {
  price: 700_000, monthlyRent: 3_800, years: 10, mortgageRate: TEST_RATE,
  rentGrowthPct: 0, homeAppreciationPct: 0, ownerCostGrowthPct: 0, ownerUpkeepPct: 0, investmentReturnPct: 0, ...o,
});

test('purchase cash and payment come from the shared condo engine', () => {
  const p = flat('condo');
  const got = purchaseFor(p);
  const r = calculateCondo(condoInputsFromDefaults({ targetOverride: 700_000, mortgageRate: TEST_RATE }));
  near(got.upfront, r.totalAtClose, 0.01);
  near(got.monthlyPI, r.moMtg, 0.01);
  // Standard amortization: 560K at 6.95% over 30 years.
  const i = p.mortgageRate / 1200;
  near(got.monthlyPI, 560_000 * i / (1 - Math.pow(1 + i, -360)), 0.01);
});

test('loan amortizes to zero at the end of the term', () => {
  const r = compareRentVsBuy(flat('condo', { years: 30 }));
  assert.equal(r.rows.length, 30);
  near(r.rows[29].loanBalance, 0, 0.01);
  // Closed-form balance after 12 payments.
  const i = TEST_RATE / 1200, pmt = r.purchase.monthlyPI;
  const bal12 = 560_000 * Math.pow(1 + i, 12) - pmt * (Math.pow(1 + i, 12) - 1) / i;
  near(r.rows[0].loanBalance, bal12, 0.01);
});

test('with no growth or returns, net worth is plain bookkeeping', () => {
  const p = flat('condo');
  const r = compareRentVsBuy(p);
  const last = r.rows[9];
  const owner = r.ownerMonthlyNow, renter = r.renterMonthlyNow;
  assert.ok(owner > renter);
  // The renter keeps the upfront cash plus 120 months of the difference.
  near(last.renterNetWorth, r.purchase.upfront + 120 * (owner - renter), 0.5);
  near(last.buyerInvestments, 0, 0.01);
  // The buyer has whatever the sale nets.
  const sale = calculateSale({
    propertyType: 'condo', salePrice: 700_000, mortgageBalance: last.loanBalance, purchasePrice: 700_000, capImprovements: 0,
    brokerPct: 5, attorneyFee: 2_500, titleMiscFee: 1_000, flipTaxPct: 2, coopTransferFee: 500,
    capGainsEnabled: false, filingStatus: 'single', fedLtcgPct: 0, nyCombinedPct: 0,
  });
  near(last.buyerNetWorth, sale.netProceeds, 0.01);
  near(last.buyerPaid, r.purchase.upfront + 120 * owner, 0.5);
  near(last.renterPaid, 120 * renter, 0.5);
});

test('when owning is cheaper each month, the buyer invests the difference', () => {
  const r = compareRentVsBuy(flat('coop', { monthlyRent: 8_000 }));
  near(r.rows[0].buyerInvestments, 12 * (r.renterMonthlyNow - r.ownerMonthlyNow), 0.5);
  near(r.rows[0].renterNetWorth, r.purchase.upfront, 0.01);
});

test('co-op sale pays the flip tax; condo does not', () => {
  const coop = compareRentVsBuy(flat('coop')).rows[0];
  const condo = compareRentVsBuy(flat('condo')).rows[0];
  near(coop.sellingCosts - condo.sellingCosts, 700_000 * 0.02 + 500, 0.01);
});

test('growth compounds yearly for bills and monthly for returns and prices', () => {
  const r = compareRentVsBuy(flat('condo', { rentGrowthPct: 3, homeAppreciationPct: 3, years: 2 }));
  near(r.rows[0].renterMonthly, r.renterMonthlyNow, 0.001);
  near(r.rows[1].renterMonthly, r.renterMonthlyNow * 1.03, 0.001);
  near(r.rows[0].homeValue, 700_000 * 1.03, 0.01);
  near(r.rows[1].homeValue, 700_000 * 1.03 * 1.03, 0.01);
});

test('PMI drops off once the balance reaches 78% of the price', () => {
  const p = flat('condo', { downPaymentPct: 10, years: 30 });
  const r = compareRentVsBuy(p);
  assert.ok(r.purchase.monthlyPmi > 0);
  near(r.ownerMonthlyNow, r.purchase.monthlyPI + r.purchase.monthlyPmi + p.buildingCharges + p.condoPropertyTax + p.condoInsurance, 0.01);
  const lastBill = r.rows[29].ownerMonthly;
  near(lastBill, r.purchase.monthlyPI + p.buildingCharges + p.condoPropertyTax + p.condoInsurance, 0.01);
});

test('break-even rent ties the two at the horizon, and higher rent favors buying', () => {
  const p = defaultRentVsBuyInputs('coop', { price: 700_000, monthlyRent: 3_800 });
  const rent = breakEvenRent(p)!;
  assert.ok(rent > 0);
  const tie = compareRentVsBuy({ ...p, monthlyRent: rent });
  near(tie.rows[tie.rows.length - 1].advantage, 0, 1);
  assert.equal(compareRentVsBuy({ ...p, monthlyRent: rent + 100 }).buyingWins, true);
  assert.equal(compareRentVsBuy({ ...p, monthlyRent: rent - 100 }).buyingWins, false);
});

test('break-even year is the first year-end the buyer is ahead', () => {
  const p = defaultRentVsBuyInputs('coop', { price: 700_000, monthlyRent: 3_800, years: 30 });
  const r = compareRentVsBuy(p);
  assert.ok(r.breakEvenYear !== null);
  const idx = r.breakEvenYear! - 1;
  assert.ok(r.rows[idx].advantage >= 0);
  if (idx > 0) assert.ok(r.rows[idx - 1].advantage < 0);
});
