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
