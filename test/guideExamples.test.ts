import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ASSUMPTIONS } from '../src/data/assumptions.ts';
import { calculateCoop } from '../src/lib/engines/coop.ts';
import { calculateCondo } from '../src/lib/engines/condo.ts';
import { coopInputsFromDefaults, condoInputsFromDefaults } from '../src/lib/engines/defaults.ts';
import { requiredIncomeForPrice } from '../src/lib/afford.ts';
import { calcMansionTax, calcMortgageRecordingTax } from '../src/lib/calc.ts';
import { AFFORDABILITY_INDEX } from '../src/data/affordabilityIndex.ts';
import { defaultRentVsBuyInputs, compareRentVsBuy, breakEvenRent } from '../src/lib/engines/rentVsBuy.ts';
import { renterMoveCost, defaultRenterMoveInputs } from '../src/lib/engines/moveCost.ts';
import { computeBreakdown, SALARY_LANDING_PAGE_BASELINE } from '../src/lib/salaryCalc.ts';
import { TAX_CONSTANTS_2026 } from '../src/lib/salaryTaxConstants2026.ts';

// Guides quote worked examples in prose ("at 6.95%, a $150,000 income
// qualifies for about $434K"). Those numbers come from the same engine and
// defaults the calculators use, so when a default changes (most often the
// mortgage rate) the prose goes stale silently. Each check below recomputes a
// quoted figure and fails if the guide no longer says it, printing the value
// to paste in. Update the guide and this file together.

const RATE = ASSUMPTIONS.mortgageRatePct.value;
const COOP_DTI = ASSUMPTIONS.coopMaxDtiPct.value;
const CONDO_DTI = ASSUMPTIONS.condoMaxDtiPct.value;

function guide(slug: string): string {
  return readFileSync(new URL(`../src/content/guides/${slug}.md`, import.meta.url), 'utf8');
}
const usd = (n: number, roundTo = 1) => '$' + (Math.round(n / roundTo) * roundTo).toLocaleString('en-US');
const fmtRate = (r: number) => `${r.toFixed(2)}%`; // table style: 6.00%, 6.95%

/** Monthly P&I factor for a 30-year loan. */
function pmt(ratePct: number, years = 30) {
  const m = ratePct / 1200;
  return m / (1 - Math.pow(1 + m, -years * 12));
}
const coopDtiMax = (income: number, rate: number) =>
  calculateCoop(coopInputsFromDefaults({ annualIncome: income, mortgageRate: rate })).dtiMaxPrice ?? 0;
const condoDtiMax = (income: number, rate: number) =>
  calculateCondo(condoInputsFromDefaults({ annualIncome: income, mortgageRate: rate })).dtiMaxPrice ?? 0;
function incomeNeeded(type: 'coop' | 'condo', price: number, rate: number) {
  const r = type === 'coop'
    ? calculateCoop(coopInputsFromDefaults({ targetOverride: price, mortgageRate: rate }))
    : calculateCondo(condoInputsFromDefaults({ targetOverride: price, mortgageRate: rate }));
  return (r.moTotal / r.dtiMax) * 12;
}

/** Collects every stale figure in a guide so one run lists all the edits needed. */
function checker(slug: string) {
  const text = guide(slug);
  const missing: string[] = [];
  return {
    expect(expected: string, what: string) {
      if (!text.includes(expected)) missing.push(`  - ${what}: ${JSON.stringify(expected)}`);
    },
    done() {
      assert.equal(missing.length, 0, `guides/${slug}.md is out of date with the current defaults. Expected:\n${missing.join('\n')}`);
    },
  };
}

const RATE_AS_OF = new Date(`${ASSUMPTIONS.mortgageRatePct.effectiveDate}T00:00:00Z`)
  .toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' });

// ---- how-mortgage-rates-affect-nyc-affordability ----

test('rates guide: "$150K income" table rows match the engine at each rate', () => {
  const c = checker('how-mortgage-rates-affect-nyc-affordability');
  for (const r of [5.5, 6, 6.3, RATE, 7.5]) {
    const cells = [fmtRate(r), usd(100_000 * pmt(r)), usd(coopDtiMax(150_000, r), 1000), usd(condoDtiMax(150_000, r), 1000)];
    const row = r === RATE
      ? `| ${cells.map((c) => `**${c}**`).join(' | ')} |`
      : `| ${cells.join(' | ')} |`;
    c.expect(row, `table row at ${r}%${r === RATE ? ' (bold = current default rate)' : ''}`);
  }
  c.done();
});

test('rates guide: "$800K purchase" income table rows match the engine', () => {
  const c = checker('how-mortgage-rates-affect-nyc-affordability');
  for (const r of [6, 6.3, RATE, 7.5]) {
    const cells = [fmtRate(r), usd(incomeNeeded('coop', 800_000, r), 100), usd(incomeNeeded('condo', 800_000, r), 100)];
    const row = r === RATE ? `| ${cells.map((c) => `**${c}**`).join(' | ')} |` : `| ${cells.join(' | ')} |`;
    c.expect(row, `$800K income row at ${r}%`);
  }
  c.done();
});

test('rates guide: summary figures and meta description', () => {
  const c = checker('how-mortgage-rates-affect-nyc-affordability');
  const k = (n: number) => `$${Math.round(n / 1000)}K`;
  c.expect(`At a ${RATE}% mortgage rate, a $150,000 income qualifies for about ${k(coopDtiMax(150_000, RATE))} in NYC co-op or ${k(condoDtiMax(150_000, RATE))} in condo`, 'meta description');
  c.expect(`by about **${usd(coopDtiMax(150_000, 6.3) - coopDtiMax(150_000, RATE), 10_000)}**`, 'co-op price lost from 6.3% to current rate');
  c.expect(`by about **${usd(condoDtiMax(150_000, 6.3) - condoDtiMax(150_000, RATE), 10_000)}**`, 'condo price lost from 6.3% to current rate');
  c.expect(`**${RATE}% on ${RATE_AS_OF}**`, 'current rate and survey date');
  c.done();
});

// ---- income-needed-to-buy-nyc-apartment ----

test('income guide: $700K worked example matches the engine', () => {
  const c = checker('income-needed-to-buy-nyc-apartment');
  const pi = 560_000 * pmt(RATE);
  const total = pi + 1_200; // the guide's own $1,200 carrying-cost assumption
  const need = (dti: number) => (total / (dti / 100)) * 12;
  c.expect(`| Co-op (${RATE}% rate, board DTI) | ${usd(pi)} | ${usd(total)} | ${COOP_DTI}% | **${usd(need(COOP_DTI))}** |`, 'co-op row');
  c.expect(`| Condo (${RATE}% rate, lender DTI) | ${usd(pi)} | ${usd(total)} | ${CONDO_DTI}% | **${usd(need(CONDO_DTI))}** |`, 'condo row');
  c.expect(`| Condo (${RATE}% rate, conservative DTI) | ${usd(pi)} | ${usd(total)} | 36% | **${usd(need(36))}** |`, 'conservative condo row');
  c.expect(`**~${usd(need(COOP_DTI) - need(CONDO_DTI), 1000)} difference**`, 'co-op vs condo income gap');
  c.expect(`same ${RATE}% rate (the Freddie Mac 30-year average as of ${RATE_AS_OF})`, 'rate and survey date');
  const at63 = ((560_000 * pmt(6.3) + 1_200) / (COOP_DTI / 100)) * 12;
  c.expect(`added roughly ${usd(need(COOP_DTI) - at63, 10_000)} to the co-op row`, '6.3% → current rate effect');
  c.done();
});

test('income guide: median co-op calibration point matches the engine and the Index', () => {
  const c = checker('income-needed-to-buy-nyc-apartment');
  const median = AFFORDABILITY_INDEX[AFFORDABILITY_INDEX.length - 1].medianCoopPrice.value;
  const income = requiredIncomeForPrice({ targetPrice: median, propertyType: 'coop' }).annualIncomeNeeded;
  c.expect(`(~${usd(median, 1000)}, Q1 2025`, 'cited median co-op price');
  c.expect(`its default ${RATE}% mortgage rate`, 'default rate');
  c.expect(`roughly **${usd(income, 1000)}**`, 'income needed at the median');
  c.done();
});

// ---- coop-board-reserve-requirements ----

test('reserve guide: $600K worked example matches the engine', () => {
  const c = checker('coop-board-reserve-requirements');
  const maint = ASSUMPTIONS.coopMaintenanceMo.value;
  const pi = 480_000 * pmt(RATE);
  const monthly = pi + maint;
  c.expect(`a 30-year mortgage at ${RATE}% (the Freddie Mac 30-year average as of ${RATE_AS_OF}), and ${usd(maint)}/month maintenance`, 'assumptions line');
  c.expect(`Monthly mortgage P&I: **${usd(pi)}**`, 'P&I');
  c.expect(`${usd(pi)} + ${usd(maint)} = **${usd(monthly)}**`, 'monthly carrying cost');
  c.expect(`${usd(monthly)} × 12 = **${usd(monthly * 12)}**`, '12-month reserve');
  c.expect(`**${usd(120_000 + monthly * 12)}** in total`, 'total liquid cash at 12 months');
  c.expect(`doubles to **${usd(monthly * 24)}**`, '24-month reserve');
  c.expect(`roughly **${usd(120_000 + monthly * 24)}**`, 'total liquid cash at 24 months');
  const at625 = (480_000 * pmt(6.25) + maint) * 12;
  c.expect(`needed about ${usd(monthly * 12 - at625, 100)} less at 12 months`, '6.25% → current rate effect');
  c.done();
});

// ---- nyc-closing-costs-for-buyers (tax lines only; the fee lines are the guide's own illustration) ----

test('closing-costs guide: tax lines match the shared tax helpers', () => {
  const c = checker('nyc-closing-costs-for-buyers');
  c.expect(`| Mortgage recording tax (1.925%) | ${usd(calcMortgageRecordingTax(960_000))} |`, 'MRT on a $960K loan');
  c.expect(`| Mansion tax (1.00% tier) | ${usd(calcMansionTax(1_200_000))} |`, 'mansion tax at $1.2M');
  c.done();
});

test('formatting helpers', () => {
  assert.equal(fmtRate(6), '6.00%');
  assert.equal(fmtRate(6.95), '6.95%');
  assert.equal(usd(434_324.21, 1000), '$434,000');
});

// ---- how-much-down-payment-nyc-apartment ----

test('down payment guide: $700K condo 10% vs 20% table matches the engine', () => {
  const c = checker('how-much-down-payment-nyc-apartment');
  const at = (dp: number) => calculateCondo(condoInputsFromDefaults({ targetOverride: 700_000, dpPct: dp }));
  const lo = at(10), hi = at(20);
  const need = (r: ReturnType<typeof at>) => (r.moTotal / r.dtiMax) * 12;
  c.expect(`a 30-year mortgage at ${RATE}% (the Freddie Mac 30-year average as of ${RATE_AS_OF})`, 'rate and survey date');
  c.expect(`| **Cash to close** | **${usd(lo.totalAtClose)}** | **${usd(hi.totalAtClose)}** |`, 'cash to close row');
  c.expect(`| Monthly P&I | ${usd(lo.moMtg)} | ${usd(hi.moMtg)} |`, 'P&I row');
  c.expect(`| PMI (0.70% a year at 10% down) | ${usd(lo.moPmi)} | ${usd(hi.moPmi)} |`, 'PMI row');
  c.expect(`| **Monthly housing cost** | **${usd(lo.moTotal)}** | **${usd(hi.moTotal)}** |`, 'monthly housing cost row');
  c.expect(`| Income needed at ${CONDO_DTI}% DTI | ${usd(need(lo))} | ${usd(need(hi))} |`, 'income needed row');
  c.expect(`costs about ${usd(hi.totalAtClose - lo.totalAtClose, 100)} more cash at closing`, 'extra cash for 20% down');
  c.expect(`lowers the monthly bill by about **${usd(lo.moTotal - hi.moTotal)}**`, 'monthly savings');
  c.expect(`by roughly **${usd(need(lo) - need(hi), 1000)}**`, 'income savings');
  c.done();
});

test('down payment guide: $700K co-op 20% vs 25% reserves match the engine', () => {
  const c = checker('how-much-down-payment-nyc-apartment');
  const at = (dp: number) => calculateCoop(coopInputsFromDefaults({ targetOverride: 700_000, dpPct: dp }));
  const a = at(20), b = at(25);
  c.expect(`illustrative ${usd(ASSUMPTIONS.coopMaintenanceMo.value)}/month maintenance and a ${ASSUMPTIONS.coopReserveMonths.value}-month reserve`, 'co-op assumptions');
  c.expect(`the reserve is **${usd(a.maintRes + a.mtgRes)}** and total cash needed is **${usd(a.totalCash)}**`, '20% down reserve and total');
  c.expect(`the reserve only falls to **${usd(b.maintRes + b.mtgRes)}**, while total cash rises to **${usd(b.totalCash)}**`, '25% down reserve and total');
  c.done();
});

// ---- rent-vs-buy-nyc ----

test('rent vs buy guide: $700K condo vs $4,000 rent example matches the engine', () => {
  const c = checker('rent-vs-buy-nyc');
  const p = defaultRentVsBuyInputs('condo', { price: 700_000, monthlyRent: 4_000, years: 10 });
  const r = compareRentVsBuy(p);
  const y10 = r.rows[9];
  const be = (years: number) => breakEvenRent({ ...p, years }) ?? NaN;
  c.expect(`a ${RATE}% mortgage rate (the Freddie Mac 30-year average as of ${RATE_AS_OF})`, 'rate and survey date');
  c.expect(`${usd(r.purchase.downPayment)} down plus ${usd(r.purchase.closingCosts)} in closing costs = **${usd(r.purchase.upfront)}**`, 'cash at closing');
  c.expect(`the owner pays **${usd(r.ownerMonthlyNow)}**`, 'owner month one');
  c.expect(`The renter pays **${usd(r.renterMonthlyNow)}**`, 'renter month one');
  c.expect(`the condo is worth **${usd(y10.homeValue)}**`, 'year-10 home value');
  c.expect(`the **${usd(y10.loanBalance)}** loan balance and **${usd(y10.sellingCosts)}** in seller costs`, 'year-10 loan and seller costs');
  c.expect(`walks away with **${usd(y10.saleProceeds)}**`, 'year-10 sale proceeds');
  c.expect(`portfolio:** **${usd(y10.renterNetWorth)}**`, 'renter portfolio');
  assert.ok(y10.advantage < 0, 'example assumes renting wins at 10 years; rewrite the prose if buying now wins');
  c.expect(`Renting comes out ahead by **${usd(-y10.advantage)}**`, 'renting advantage');
  assert.equal(compareRentVsBuy({ ...p, years: 30 }).breakEvenYear, null, 'guide says buying never catches up within 30 years');
  c.expect(`above about **${usd(be(10), 10)}** a month, a price-to-rent ratio of about **${(700_000 / (be(10) * 12)).toFixed(1)}**`, '10-year break-even rent and ratio');
  c.expect(`break-even rent rises to about **${usd(be(5), 10)}**`, '5-year break-even rent');
  c.expect(`stay 15 and it falls to about **${usd(be(15), 10)}**`, '15-year break-even rent');
  c.done();
});

test('rent vs buy guide: co-op variant matches the engine', () => {
  const c = checker('rent-vs-buy-nyc');
  const p = defaultRentVsBuyInputs('coop', { price: 700_000, monthlyRent: 4_000, years: 10 });
  c.expect(`illustrative ${usd(ASSUMPTIONS.coopMaintenanceMo.value)} monthly maintenance`, 'co-op maintenance');
  c.expect(`the break-even rent over 10 years is about **${usd(breakEvenRent(p) ?? NaN, 10)}**`, 'co-op 10-year break-even rent');
  c.expect(`buying pulls ahead in **year ${compareRentVsBuy({ ...p, years: 30 }).breakEvenYear}**`, 'co-op break-even year');
  c.done();
});

// ---- condo-common-charges-explained ----

test('common charges guide: $700K condo example matches the engine', () => {
  const c = checker('condo-common-charges-explained');
  const cc = ASSUMPTIONS.condoCommonChargesMo.value;
  const base = calculateCondo(condoInputsFromDefaults({ targetOverride: 700_000 }));
  const pricey = calculateCondo(condoInputsFromDefaults({ targetOverride: 700_000, commonCharges: 1_500 }));
  const need = (r: typeof base) => (r.moTotal / r.dtiMax) * 12;
  c.expect(`or **${usd(cc)} a month**, which happens to be the site's illustrative citywide default`, 'common charges default');
  c.expect(`a 30-year rate of ${RATE}% (the Freddie Mac 30-year average as of ${RATE_AS_OF})`, 'rate and survey date');
  c.expect(`Mortgage P&I on $560,000: **${usd(base.moMtg)}**`, 'P&I');
  c.expect(`Monthly housing expense: **${usd(base.moTotal)}**`, 'housing expense');
  c.expect(`Income needed at a ${CONDO_DTI}% DTI: **${usd(need(base))}**`, 'income needed');
  c.expect(`the housing expense rises to **${usd(pricey.moTotal)}**, so the income needed rises to **${usd(need(pricey))}**`, '$1,500 common charges');
  c.expect(`costs you about **${usd(need(pricey) - need(base), 1000)}** a year of required income at a ${CONDO_DTI}% DTI`, 'income per $500 of common charges');
  c.done();
});

// ---- coop-maintenance-explained ----

test('maintenance guide: $150K DTI worked example matches the engine', () => {
  const c = checker('coop-maintenance-explained');
  const maint = ASSUMPTIONS.coopMaintenanceMo.value;
  const budget = (150_000 / 12) * (COOP_DTI / 100);
  const base = coopDtiMax(150_000, RATE);
  const higher = calculateCoop(coopInputsFromDefaults({ annualIncome: 150_000, maint: maint + 400 })).dtiMaxPrice ?? 0;
  c.expect(`The ${usd(maint)}/month maintenance matches this site's illustrative citywide default`, 'default maintenance');
  c.expect(`At a ${COOP_DTI}% cap, the board allows ${usd(budget)} a month for housing`, 'DTI budget');
  c.expect(`Subtract ${usd(maint)} of maintenance and ${usd(budget - maint)} is left`, 'P&I budget');
  c.expect(`At ${RATE}% (the Freddie Mac 30-year average as of ${RATE_AS_OF})`, 'rate and survey date');
  c.expect(`a loan of about ${usd((budget - maint) / pmt(RATE), 1000)}`, 'supported loan');
  c.expect(`maximum price of about **${usd(base, 1000)}**`, 'max price at default maintenance');
  c.expect(`building with ${usd(maint + 400)} maintenance: only ${usd(budget - maint - 400)} is left`, '+$400 maintenance budget');
  c.expect(`drops to about **${usd(higher, 1000)}**`, 'max price at +$400 maintenance');
  c.expect(`roughly **${usd(base - higher, 1000)}** of purchasing power`, 'purchasing-power cost');
  c.done();
});

// ---- nyc-city-income-tax-explained ----

test('city tax guide: $100K worked example matches salaryCalc', () => {
  const c = checker('nyc-city-income-tax-explained');
  const b = computeBreakdown(100_000, SALARY_LANDING_PAGE_BASELINE, TAX_CONSTANTS_2026);
  const nyStd = TAX_CONSTANTS_2026.nyState.standardDeduction.single;
  const cents = (n: number) => '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  c.expect(`standard deduction for a single filer is ${usd(nyStd)}`, 'NY standard deduction');
  c.expect(`$100,000 − ${usd(nyStd)} = **${usd(100_000 - nyStd)}**`, 'city taxable income');
  c.expect(`Total: **${cents(b.localTax)}** a year, about **${usd(b.localTax / 12)} a month**`, 'NYC tax');
  c.expect(`federal income tax at ${usd(b.federalTax)}, NY State tax at about ${usd(b.stateTax, 10)}, NYC tax at about ${usd(b.localTax)}, FICA at ${usd(b.fica)}`, 'paycheck lines');
  c.expect(`disability deductions at about ${usd(b.nyPFL + b.nySDI)}`, 'PFL + SDI');
  c.expect(`about **${usd(b.netTakeHome)} a year**, or roughly ${usd(b.netTakeHome / 12, 10)} a month`, 'take-home');
  c.done();
});

// ---- how-much-does-it-cost-to-move-in-nyc ----

test('move-cost guide: worked example matches the engine', () => {
  const c = checker('how-much-does-it-cost-to-move-in-nyc');
  const base = defaultRenterMoveInputs({ rent: 3_500, buildingFee: 0, overlapDays: 10, currentMonthlyHousing: 3_000 });
  const m = renterMoveCost(base);
  const g = renterMoveCost({ ...base, guarantorFeePct: ASSUMPTIONS.guarantorCompanyFeePct.value });
  const b = renterMoveCost({ ...base, brokerType: 'pct_annual', brokerFeePct: 15 });
  c.expect(`| Movers (illustrative) | ${usd(ASSUMPTIONS.moversCost.value)} |`, 'movers');
  c.expect(`| Boxes and supplies (illustrative) | ${usd(ASSUMPTIONS.movingSupplies.value)} |`, 'supplies');
  c.expect(`| Utility setup (illustrative) | ${usd(ASSUMPTIONS.rentUtilitySetup.value)} |`, 'utilities');
  c.expect(`| **Cash needed** | **${usd(m.cashNeeded)}** |`, 'total');
  c.expect(`**${usd(m.spent - 3_500)}**`, 'money that disappears');
  c.expect(`illustrative ${ASSUMPTIONS.guarantorCompanyFeePct.value}% of one month's rent`, 'guarantor pct');
  c.expect(`for **${usd(g.cashNeeded)}** in total`, 'with guarantor');
  c.expect(`for **${usd(b.cashNeeded)}** in total`, 'with broker');
  c.expect(`starts at a ${usd(ASSUMPTIONS.rentBuildingFee.value)} illustrative placeholder`, 'building fee default');
  c.done();
});
