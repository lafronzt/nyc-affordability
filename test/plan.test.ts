import { test } from 'node:test';
import assert from 'node:assert/strict';
import { defaultSharedAssumptions } from '../src/lib/engines/defaults.ts';
import { coopOption, condoOption, rentOption, type BaseInputs } from '../src/lib/housingOptions.ts';
import { ceiling, liftToOtherSide, nextSteps, buildPlan } from '../src/lib/plan.ts';

// /plan/ explains each ceiling (rent, co-op, condo) and what would move it.
// Every figure must be reproducible with the same engines, one change at a time.

// Behavior tests use a fixed rate, not the site default (see levers.test.ts).
const TEST_RATE = 6.95;
const asmp = () => {
  const a = defaultSharedAssumptions();
  a.coop.mortgageRate = TEST_RATE;
  a.condo.mortgageRate = TEST_RATE;
  return a;
};
const person = (income: number, cash: number, debts = 0): BaseInputs => ({
  annualIncome: income, otherDebts: debts,
  accounts: [{ name: 'Savings', balance: cash, liquidity: 100, closing: true }],
});
const near = (a: number, b: number, tol = 0.01) => assert.ok(Math.abs(a - b) <= tol, `expected ${b}, got ${a}`);

const cashPoor = person(220_000, 90_000);   // plenty of income, little cash
const incomePoor = person(90_000, 600_000); // lots of cash, modest income
const cashPoorRenter = person(220_000, 8_000); // $90K covers $5,500/mo of move-in costs; $8K doesn't

test('ceilings are the same numbers /compare/ shows', () => {
  for (const p of [cashPoor, incomePoor]) {
    const a = asmp();
    near(ceiling('coop', p, a).max, coopOption(p, a).maxPrice);
    near(ceiling('condo', p, a).max, condoOption(p, a).maxPrice);
    near(ceiling('rent', p, a).max, rentOption(p, a).maxRent);
  }
});

test('the binding side is the lower of the two ceilings', () => {
  for (const path of ['rent', 'coop', 'condo'] as const) {
    const c = ceiling(path, path === 'rent' ? cashPoorRenter : cashPoor, asmp());
    assert.notEqual(c.limit, 'income', `${path} should be cash-bound`);
    near(c.max, c.cashMax, 1);
    assert.ok(c.incomeMax > c.cashMax);
    const d = ceiling(path, incomePoor, asmp());
    assert.equal(d.limit, 'income', path);
    near(d.max, d.incomeMax, 1);
    assert.ok(d.cashMax > d.incomeMax);
  }
});

test('lift: the amount of cash that brings a cash-bound ceiling up to income, and not a dollar less', () => {
  for (const path of ['coop', 'condo'] as const) {
    const a = asmp();
    const c = ceiling(path, cashPoor, a);
    const l = liftToOtherSide(path, cashPoor, a)!;
    assert.equal(l.side, 'cash');
    near(l.reaches, c.incomeMax);
    assert.ok(ceiling(path, cashPoor, a, { extraCash: l.amount }).cashMax >= c.incomeMax - 100);
    assert.ok(ceiling(path, cashPoor, a, { extraCash: l.amount - 2 }).cashMax < c.incomeMax - 100);
  }
});

test('lift: income needed when income binds', () => {
  const a = asmp();
  const p = person(90_000, 90_000, 400);
  const c = ceiling('coop', p, a);
  const l = liftToOtherSide('coop', p, a)!;
  assert.equal(l.side, 'income');
  assert.ok(ceiling('coop', p, a, { extraIncome: l.amount }).incomeMax >= c.cashMax - 100);
  assert.ok(ceiling('coop', p, a, { extraIncome: l.amount - 2 }).incomeMax < c.cashMax - 100);
});

test('rent lift uses the 40x rule exactly', () => {
  const a = asmp();
  const renter = person(90_000, 6_000);
  const c = ceiling('rent', renter, a);
  const l = liftToOtherSide('rent', renter, a)!;
  assert.equal(l.side, 'income');
  near(l.amount, (c.cashMax - 1) * a.rent.incomeMult - renter.annualIncome, a.rent.incomeMult + 1);
  // A raise that would more than double income isn't quoted.
  assert.equal(liftToOtherSide('rent', incomePoor, a), null);
  assert.equal(liftToOtherSide('coop', person(40_000, 600_000), a), null);
});

test('next steps: only changes that help, best first, each reproducible', () => {
  const a = asmp();
  const steps = nextSteps('coop', cashPoor, a);
  assert.ok(steps.length > 0);
  assert.ok(!steps.some((s) => s.id === 'raise-10k'), 'more income does nothing while cash binds');
  assert.ok(!steps.some((s) => s.id === 'clear-debts'), 'no debts to clear');
  for (let i = 1; i < steps.length; i++) assert.ok(steps[i - 1].delta >= steps[i].delta);
  const save = steps.find((s) => s.id === 'save-10k')!;
  near(save.after, ceiling('coop', cashPoor, a, { extraCash: 10_000 }).max);

  const withDebt = person(110_000, 600_000, 700);
  const ids = nextSteps('condo', withDebt, a).map((s) => s.id);
  assert.ok(ids.includes('clear-debts') && ids.includes('raise-10k'));
  assert.ok(!ids.includes('save-10k'), 'more cash does nothing while income binds');
  assert.ok(!nextSteps('rent', withDebt, a).some((s) => s.id === 'rate-down-50'), 'rates don\'t move rent');
});

test('buildPlan: sentences carry the engine numbers and name the limit', () => {
  const snap = {
    nyc_shared_profile: JSON.stringify({ annualIncome: 220_000, otherDebts: 0, accounts: cashPoor.accounts }),
    nyc_shared_assumptions_coop: JSON.stringify({ ...asmp().coop }),
    nyc_shared_assumptions_condo: JSON.stringify({ ...asmp().condo }),
  };
  const plan = buildPlan(snap);
  assert.equal(plan.model.profile, 'saved');
  assert.equal(plan.cash, 90_000);
  const coop = plan.paths.find((p) => p.path === 'coop')!;
  assert.match(coop.why, /^Cash sets it\./);
  assert.match(coop.why, /\$90,000/);
  assert.match(coop.other!, /^Your income alone would support up to \$[\d,]+\.$/);
  assert.match(coop.lift!, /^About \$[\d,]+000 more saved would let cash keep up with your income/);
  const rent = plan.paths.find((p) => p.path === 'rent')!;
  assert.ok(rent.steps.length <= 3);

  const rich = buildPlan({ nyc_shared_profile: JSON.stringify({ annualIncome: 90_000, otherDebts: 400, accounts: person(0, 90_000).accounts }) });
  const r = rich.paths.find((p) => p.path === 'rent')!;
  assert.equal(r.why, 'Income sets it. Landlords usually want yearly income of 40× the monthly rent, and $90,000 ÷ 40 is $2,250.');
  const c = rich.paths.find((p) => p.path === 'coop')!;
  assert.match(c.why, /plus your \$400\/mo of other debts reaches the board's \d+% debt-to-income limit\.$/);
  assert.match(c.lift!, /more a year in income would let it keep up with your cash/);
});

test('when the other side is far away, say so instead of quoting a huge figure', () => {
  // $600K of cash against a $2,250 rent: "cash would cover $299K/mo" helps nobody.
  const plan = buildPlan({ nyc_shared_profile: JSON.stringify({ annualIncome: 90_000, otherDebts: 0, accounts: incomePoor.accounts }) });
  const rent = plan.paths.find((p) => p.path === 'rent')!;
  assert.equal(rent.other, 'Cash isn\'t close to limiting this: it would cover more than twice as much.');
  assert.equal(rent.lift, null);
});

test('a step that runs into the other limit says where it stops', () => {
  // Income binds the condo, cash is just above: every income-side step stops at the cash ceiling.
  const p = person(150_000, 115_000, 650);
  const a = asmp();
  const c = ceiling('condo', p, a);
  assert.equal(c.limit, 'income');
  const steps = nextSteps('condo', p, a);
  const capped = steps.filter((s) => s.capped);
  assert.ok(capped.length > 0, 'expected at least one step to hit the cash ceiling');
  for (const s of capped) near(s.after, c.cashMax, 1);
  for (const s of steps.filter((x) => !x.capped)) assert.ok(s.after < c.cashMax - 1);
});

test('with nothing saved, the plan runs on the sample profile and says so', () => {
  const plan = buildPlan({});
  assert.equal(plan.model.profile, 'sample');
  assert.equal(plan.paths.length, 3);
});
