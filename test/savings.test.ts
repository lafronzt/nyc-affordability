import { test } from 'node:test';
import assert from 'node:assert/strict';
import { defaultSavingsInputs, cashNeeded, planSavings, monthlyNeededFor } from '../src/lib/engines/savings.ts';
import { requiredIncomeForPrice } from '../src/lib/afford.ts';
import { calcMansionTax, calcMortgageRecordingTax } from '../src/lib/calc.ts';

// Savings planner: the cash target must match the shared engine (so it
// agrees with /coop/, /condo/, and /buy/<price>/), and the projection must
// be plain, checkable compound savings.

const near = (a: number, b: number, tol = 1) => assert.ok(Math.abs(a - b) <= tol, `expected ${b}, got ${a}`);
const base = (type: 'coop' | 'condo', o = {}) => defaultSavingsInputs(type, {
  targetPrice: 600_000, currentSavings: 110_000, monthlyContribution: 2_000, savingsYieldPct: 3,
  annualIncome: 145_000, monthlyDebts: 0, ...o,
});

test('cash target matches the build-time /buy/ figures at the same price', () => {
  for (const type of ['coop', 'condo'] as const) {
    const need = cashNeeded(base(type));
    const buy = requiredIncomeForPrice({ targetPrice: 600_000, propertyType: type });
    near(need.total, buy.estimatedCashNeeded, 0.01);
    near(need.reserves, buy.estimatedReserves, 0.01);
    near(need.incomeNeeded, buy.annualIncomeNeeded, 0.01);
  }
});

test('co-op cash target includes board reserves; condo includes mortgage recording tax instead', () => {
  const coop = cashNeeded(base('coop'));
  const condo = cashNeeded(base('condo'));
  near(coop.reserves, 52_528, 1); // matches the co-op reserves guide's worked example
  assert.equal(coop.mortgageRecordingTax, 0);
  assert.equal(condo.reserves, 0);
  near(condo.mortgageRecordingTax, calcMortgageRecordingTax(480_000), 0.01);
  near(coop.total, coop.downPayment + coop.closingCosts + coop.mansionTax + coop.reserves, 0.01);
});

test('mansion tax appears at $1M and the emergency cushion is added on top', () => {
  const p = base('condo', { targetPrice: 1_000_000, emergencyFund: 20_000 });
  const n = cashNeeded(p);
  near(n.mansionTax, calcMansionTax(1_000_000), 0.01);
  near(n.total - cashNeeded({ ...p, emergencyFund: 0 }).total, 20_000, 0.01);
});

test('projection is plain compound savings (month-end contributions, APY-style yield)', () => {
  const r = planSavings(base('condo'), 24);
  const i = Math.pow(1.03, 1 / 12) - 1;
  const fv12 = 110_000 * Math.pow(1 + i, 12) + 2_000 * ((Math.pow(1 + i, 12) - 1) / i);
  near(r.points[12].balance, fv12, 0.01);
  near(r.points[12].balance - 110_000 * 1.03, 2_000 * ((Math.pow(1 + i, 12) - 1) / i), 0.01);
});

test('ready month is when cash is covered; zero-yield case is exact arithmetic', () => {
  const p = base('condo', { savingsYieldPct: 0, annualIncome: 200_000 });
  const r = planSavings(p);
  const need = cashNeeded(p).total;
  assert.equal(r.cashReadyMonth, Math.ceil((need - 110_000) / 2_000));
  assert.equal(r.readyMonth, r.cashReadyMonth);
  assert.ok(r.leftOverAtReady! >= 0 && r.leftOverAtReady! < 2_000);
});

test('income can be the blocker: a $600K co-op at $145K never qualifies without raises', () => {
  const r = planSavings(base('coop'));
  assert.notEqual(r.cashReadyMonth, null);
  assert.equal(r.incomeReadyMonth, null);
  assert.equal(r.readyMonth, null);
});

test('co-op reserves make the timeline longer than a condo at the same price', () => {
  const coop = planSavings(base('coop', { annualIncome: 250_000 }));
  const condo = planSavings(base('condo', { annualIncome: 250_000 }));
  assert.ok(coop.readyMonth! > condo.readyMonth!, `${coop.readyMonth} vs ${condo.readyMonth}`);
});

test('price growth pushes the date out; raises can unlock income', () => {
  const flat = planSavings(base('condo', { annualIncome: 200_000 }));
  const rising = planSavings(base('condo', { annualIncome: 200_000, priceGrowthPct: 4 }));
  assert.ok(rising.cashReadyMonth! > flat.cashReadyMonth!);
  const blocked = planSavings(base('condo', { targetPrice: 700_000, annualIncome: 150_000 }));
  const raises = planSavings(base('condo', { targetPrice: 700_000, annualIncome: 150_000, incomeGrowthPct: 4 }));
  assert.equal(blocked.incomeReadyMonth, null);
  assert.ok(raises.incomeReadyMonth !== null && raises.incomeReadyMonth % 12 === 0, 'raises land on anniversaries');
});

test('monthlyNeededFor hits the target exactly on the chosen date', () => {
  for (const o of [{}, { savingsYieldPct: 0 }, { priceGrowthPct: 3 }]) {
    const p = base('coop', o);
    const c = monthlyNeededFor(p, 24);
    const r = planSavings({ ...p, monthlyContribution: c }, 24);
    near(r.points[24].balance, r.points[24].required, 0.5);
  }
  assert.equal(monthlyNeededFor(base('condo', { currentSavings: 500_000 }), 12), 0);
});
