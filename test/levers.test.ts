import { test } from 'node:test';
import assert from 'node:assert/strict';
import { defaultPlanInputs, evaluatePlan, rankLevers, gapToTarget, leversFor } from '../src/lib/engines/levers.ts';
import { calculateCoop } from '../src/lib/engines/coop.ts';
import { coopInputsFromDefaults } from '../src/lib/engines/defaults.ts';

// "How do I afford more?" levers. The scenario is the one from the project
// brief: $145K income, $110K saved, $400/month student loans.

const near = (a: number, b: number, tol = 1) => assert.ok(Math.abs(a - b) <= tol, `expected ${b}, got ${a}`);
// Behavior tests use a fixed rate, not the site default, so they keep testing
// the same scenario when the weekly PMMS update moves the default (see
// .github/workflows/data-update-pmms.yml). Default-dependent figures are
// checked in test/afford.test.ts and test/guideExamples.test.ts instead.
const TEST_RATE = 6.95;

const coop = defaultPlanInputs('coop', { annualIncome: 145_000, monthlyDebts: 400, cash: 110_000, mortgageRate: TEST_RATE });
const condo = defaultPlanInputs('condo', { annualIncome: 145_000, monthlyDebts: 400, cash: 110_000, mortgageRate: TEST_RATE });
const byId = (p: typeof coop) => Object.fromEntries(rankLevers(p).results.map((r) => [r.lever.id, r]));

test('evaluatePlan matches calling the co-op engine directly', () => {
  const direct = calculateCoop(coopInputsFromDefaults({
    annualIncome: 145_000, otherDebts: 400, mortgageRate: TEST_RATE,
    accounts: [
      { name: 'Cash', balance: 110_000, liquidity: 100, closing: true },
      { name: 'Investments', balance: 0, liquidity: 80, closing: true },
    ],
  }));
  near(evaluatePlan(coop).maxPrice, direct.maxPrice, 0.01);
});

test('co-op baseline: reserves bind just below the income ceiling', () => {
  const r = evaluatePlan(coop);
  near(r.maxPrice, 326_014);
  near(r.dtiMaxPrice, 336_759);
  assert.equal(r.binding, 'Cash / Reserves');
});

test('co-op: income and debt levers do nothing while cash binds', () => {
  const L = byId(coop);
  assert.equal(Math.round(L['raise-10k'].delta), 0);
  assert.equal(Math.round(L['clear-debt'].delta), 0);
  assert.match(L['raise-10k'].explanation, /^No effect/);
});

test('co-op: saving helps only until income becomes the limit', () => {
  const L = byId(coop);
  near(L['save-10k'].delta, 10_745);
  near(L['save-25k'].delta, L['save-10k'].delta); // capped by the DTI ceiling
  assert.equal(L['save-25k'].after.binding, 'DTI / Income');
  assert.match(L['save-25k'].explanation, /becomes the limit instead/);
});

test('co-op: a bigger down payment lowers the ceiling when reserves bind', () => {
  const L = byId(coop);
  assert.ok(L['dp-up-5'].delta < -40_000);
  assert.match(L['dp-up-5'].explanation, /^Lowers your ceiling/);
});

test('co-op: lower maintenance helps even when cash binds (it shrinks the reserve requirement)', () => {
  assert.ok(byId(coop)['charges-300'].delta > 10_000);
});

test('levers are ranked by improvement, best first', () => {
  const { results } = rankLevers(coop);
  for (let i = 1; i < results.length; i++) assert.ok(results[i - 1].delta >= results[i].delta);
});

test('lever availability follows the situation', () => {
  const ids = (p: typeof coop) => leversFor(p).map((l) => l.id);
  assert.ok(!ids({ ...coop, monthlyDebts: 0 }).includes('clear-debt'));
  assert.ok(ids(coop).includes('reserves-6'));
  assert.ok(!ids(condo).includes('reserves-6'), 'reserve months are a co-op board rule');
  assert.ok(!ids(coop).includes('dp-down-5'), 'co-op boards rarely allow under 20% down');
  assert.ok(ids(condo).includes('dp-down-5'));
});

test('condo below 20% down: PMI can make a smaller down payment backfire', () => {
  const L = byId(condo);
  assert.equal(evaluatePlan(condo).binding, 'DP / Closing Costs');
  assert.ok(L['dp-down-5'].delta < 0);
  assert.equal(L['dp-down-5'].after.binding, 'DTI / Income');
});

test('gap to target: cash and income gaps are solved independently and actually close the gap', () => {
  const g = gapToTarget(coop, 450_000);
  assert.equal(g.reachable, false);
  assert.ok(g.extraCash > 0 && g.extraIncome > 0);
  const fixed = evaluatePlan({ ...coop, cash: coop.cash + g.extraCash, annualIncome: coop.annualIncome + g.extraIncome });
  assert.ok(fixed.maxPrice >= 450_000 - 1, `got ${fixed.maxPrice}`);
  // One dollar less of either is not enough.
  assert.ok(evaluatePlan({ ...coop, cash: coop.cash + g.extraCash - 2 }).cashMax < 450_000 - 1);
  assert.ok(evaluatePlan({ ...coop, annualIncome: coop.annualIncome + g.extraIncome - 2 }).dtiMaxPrice < 450_000 - 1);
});

test('gap to target: nothing needed when the target is already reachable', () => {
  const g = gapToTarget(coop, 300_000);
  assert.equal(g.reachable, true);
  assert.equal(g.extraCash, 0);
  assert.equal(g.extraIncome, 0);
});

test('gap to target: debt payoff offered as an alternative when it is enough', () => {
  const p = defaultPlanInputs('condo', { annualIncome: 145_000, monthlyDebts: 900, cash: 400_000 });
  const target = evaluatePlan(p).maxPrice + 20_000;
  const g = gapToTarget(p, target);
  assert.equal(g.extraCash, 0);
  assert.ok(g.debtCutEquivalent > 0 && g.debtCutEquivalent <= 900);
  const fixed = evaluatePlan({ ...p, monthlyDebts: p.monthlyDebts - g.debtCutEquivalent });
  assert.ok(fixed.maxPrice >= target - 2, `got ${fixed.maxPrice}`);
});
