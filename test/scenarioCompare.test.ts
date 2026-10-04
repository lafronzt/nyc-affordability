import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calculateCoop } from '../src/lib/engines/coop.ts';
import { calculateCondo } from '../src/lib/engines/condo.ts';
import { calculateRent } from '../src/lib/engines/rent.ts';
import { coopInputsFromDefaults, condoInputsFromDefaults, rentInputsFromDefaults, defaultSharedAssumptions } from '../src/lib/engines/defaults.ts';
import { SAMPLE_PROFILE, normalizeAccounts, coopOption, condoOption, rentOption } from '../src/lib/housingOptions.ts';
import { scenarioModel, scenarioOutcome, compareScenarios, summarize } from '../src/lib/scenarioCompare.ts';
import { ASSUMPTIONS as A } from '../src/data/assumptions.ts';

// Scenario A/B on /my-data/ runs each saved snapshot through the /compare/
// model (src/lib/housingOptions.ts). These check that model is the
// calculators' engines, and that missing or junk saved values fall back
// to defaults visibly instead of silently.

// Behavior tests use a fixed rate, not the site default (see levers.test.ts).
const TEST_RATE = 6.95;
const near = (a: number, b: number, tol = 0.01) => assert.ok(Math.abs(a - b) <= tol, `expected ${b}, got ${a}`);

const profile = (income: number, cash: number, debts = 0) => JSON.stringify({
  annualIncome: income, otherDebts: debts,
  accounts: [{ name: 'Savings', balance: cash, liquidity: 100, closing: true }],
});
const coopAsmp = (over: Record<string, unknown> = {}) => JSON.stringify({ ...defaultSharedAssumptions().coop, mortgageRate: TEST_RATE, ...over });
const condoAsmp = (over: Record<string, unknown> = {}) => JSON.stringify({ ...defaultSharedAssumptions().condo, mortgageRate: TEST_RATE, ...over });

test('housingOptions runs the calculators\' engines with the saved assumption set', () => {
  const base = { annualIncome: 160_000, otherDebts: 300, accounts: normalizeAccounts(SAMPLE_PROFILE.accounts) };
  const asmp = defaultSharedAssumptions();
  asmp.coop.mortgageRate = TEST_RATE;
  asmp.condo.mortgageRate = TEST_RATE;
  near(coopOption(base, asmp).maxPrice, calculateCoop(coopInputsFromDefaults({ ...base, mortgageRate: TEST_RATE })).maxPrice);
  near(condoOption(base, asmp).maxPrice, calculateCondo(condoInputsFromDefaults({ ...base, mortgageRate: TEST_RATE })).maxPrice);
  near(rentOption(base, asmp).maxRent, calculateRent(rentInputsFromDefaults(base)).maxRent);
  near(coopOption(base, asmp, 8).maxPrice, calculateCoop(coopInputsFromDefaults({ ...base, mortgageRate: 8 })).maxPrice);
});

test('an empty snapshot is the sample profile at site defaults, and says so', () => {
  const m = scenarioModel({});
  assert.equal(m.profile, 'sample');
  assert.deepEqual(m.assumptions, { rent: 'default', coop: 'default', condo: 'default' });
  assert.equal(m.base.annualIncome, SAMPLE_PROFILE.annualIncome);
  assert.equal(m.asmp.coop.mortgageRate, A.mortgageRatePct.value);
});

test('saved values are used; junk and unknown fields are ignored', () => {
  const m = scenarioModel({
    nyc_shared_profile: profile(120_000, 90_000, 250),
    nyc_shared_assumptions_coop: JSON.stringify({ mortgageRate: '6.5', dpPct: 'abc', evil: 1 }),
    nyc_shared_assumptions_condo: '{not json',
    nyc_shared_assumptions_rent: JSON.stringify({ nothing: 'useful' }),
  });
  assert.equal(m.profile, 'saved');
  assert.equal(m.base.otherDebts, 250);
  assert.equal(m.asmp.coop.mortgageRate, 6.5);
  assert.equal(m.asmp.coop.dpPct, A.coopDownPaymentPct.value);
  assert.ok(!('evil' in m.asmp.coop));
  assert.deepEqual(m.assumptions, { rent: 'default', coop: 'saved', condo: 'default' });
});

test('a scenario keeps the rate it was saved with, not today\'s default', () => {
  const o = scenarioOutcome({ nyc_shared_profile: profile(150_000, 120_000), nyc_shared_assumptions_coop: coopAsmp({ mortgageRate: 5.5 }) });
  assert.equal(o.asmp.coop.mortgageRate, 5.5);
  const at55 = calculateCoop(coopInputsFromDefaults({ ...o.base, mortgageRate: 5.5 })).maxPrice;
  near(o.coop.maxPrice, at55);
});

test('identical scenarios: every difference is zero and nothing is marked better', () => {
  const snap = { nyc_shared_profile: profile(150_000, 120_000), nyc_shared_assumptions_coop: coopAsmp(), nyc_shared_assumptions_condo: condoAsmp() };
  const sections = compareScenarios(scenarioOutcome(snap), scenarioOutcome(snap));
  for (const r of sections.flatMap((s) => s.rows)) {
    assert.equal(r.better, null, r.label);
    if (r.delta !== null) assert.equal(r.delta, 0, r.label);
  }
  assert.deepEqual(sections.map((s) => s.kind), ['inputs', 'calculated', 'calculated', 'calculated']);
});

test('more income and cash in B: B is marked better on income, cash, and every ceiling', () => {
  const a = scenarioOutcome({ nyc_shared_profile: profile(120_000, 80_000), nyc_shared_assumptions_coop: coopAsmp(), nyc_shared_assumptions_condo: condoAsmp() });
  const b = scenarioOutcome({ nyc_shared_profile: profile(180_000, 200_000), nyc_shared_assumptions_coop: coopAsmp(), nyc_shared_assumptions_condo: condoAsmp() });
  const rows = Object.fromEntries(compareScenarios(a, b).flatMap((s) => s.rows.map((r) => [`${s.id}:${r.label}`, r])));
  assert.equal(rows['inputs:Annual income'].better, 'b');
  assert.equal(rows['inputs:Annual income'].delta, 60_000);
  assert.equal(rows['inputs:Cash available (liquidity-weighted)'].better, 'b');
  for (const id of ['coop', 'condo']) {
    const r = rows[`${id}:Max price`];
    assert.equal(r.better, 'b', id);
    // Whole dollars, so the difference matches the two values as displayed.
    assert.equal(r.delta, Math.round((b as any)[id].maxPrice) - Math.round((a as any)[id].maxPrice));
    assert.equal(r.delta, (r.b as number) - (r.a as number));
  }
  assert.equal(rows['rent:Max rent'].better, 'b');
  assert.equal(rows['coop:What limits it'].delta, null);
});

test('a higher rate is marked worse; down payment is neither better nor worse', () => {
  const a = scenarioOutcome({ nyc_shared_profile: profile(150_000, 150_000), nyc_shared_assumptions_coop: coopAsmp({ mortgageRate: 6, dpPct: 20 }) });
  const b = scenarioOutcome({ nyc_shared_profile: profile(150_000, 150_000), nyc_shared_assumptions_coop: coopAsmp({ mortgageRate: 7.5, dpPct: 25 }) });
  const inputs = compareScenarios(a, b)[0].rows;
  assert.equal(inputs.find((r) => r.label === 'Co-op mortgage rate')!.better, 'a');
  assert.equal(inputs.find((r) => r.label === 'Co-op down payment')!.better, null);
});

test('rows flag values that came from defaults, per side', () => {
  const a = scenarioOutcome({});
  const b = scenarioOutcome({ nyc_shared_profile: profile(150_000, 150_000), nyc_shared_assumptions_coop: coopAsmp() });
  const inputs = compareScenarios(a, b)[0].rows;
  const income = inputs.find((r) => r.label === 'Annual income')!;
  assert.deepEqual([income.defaultA, income.defaultB], [true, false]);
  const condoRate = inputs.find((r) => r.label === 'Condo mortgage rate')!;
  assert.deepEqual([condoRate.defaultA, condoRate.defaultB], [true, true]);
});

test('summary sentences: direction of each ceiling, plus what came from defaults', () => {
  const a = scenarioOutcome({ nyc_shared_profile: profile(120_000, 80_000), nyc_shared_assumptions_coop: coopAsmp(), nyc_shared_assumptions_condo: condoAsmp(), nyc_shared_assumptions_rent: JSON.stringify(defaultSharedAssumptions().rent) });
  const b = scenarioOutcome({});
  const s = summarize(a, b, { a: 'Plan A', b: 'Plan B' });
  assert.match(s[1], /^Co-op: Plan B reaches \$[\d,]+ (more|less) than Plan A\.$/);
  assert.ok(s.some((x) => /Plan B has no saved profile/.test(x)));
  assert.ok(s.some((x) => /Plan B didn't save rent, co-op, or condo assumptions/.test(x)));
  assert.ok(!s.some((x) => /Plan A (has no|didn't)/.test(x)));
  const two = summarize(scenarioOutcome({ nyc_shared_profile: profile(1, 1), nyc_shared_assumptions_coop: coopAsmp() }), a, { a: 'P', b: 'Q' });
  assert.ok(two.includes("P didn't save rent or condo assumptions, so it uses today's site defaults for them."));
  const same = summarize(a, a, { a: 'X', b: 'Y' });
  assert.equal(same[0], 'Rent: the same in both.');
});
