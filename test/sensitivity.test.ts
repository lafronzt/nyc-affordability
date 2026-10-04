import { test } from 'node:test';
import assert from 'node:assert/strict';
import { defaultPlanInputs, evaluatePlan } from '../src/lib/engines/levers.ts';
import { pointAt, sweep, rateRange, chargesRange, impactPerStep, chargesInRatePoints, highestReaching } from '../src/lib/engines/sensitivity.ts';
import { requiredIncomeForPrice } from '../src/lib/afford.ts';

// Rate and maintenance sensitivity: every point is the shared engine run
// with one input changed, so these tests check the sweep is wired right
// and that the direction and size of each effect make sense.

const near = (a: number, b: number, tol = 1) => assert.ok(Math.abs(a - b) <= tol, `expected ${b}, got ${a}`);
// Project brief example.
// Behavior tests use a fixed rate, not the site default, so they keep testing
// the same scenario when the weekly PMMS update moves the default (see
// .github/workflows/data-update-pmms.yml). Default-dependent figures are
// checked in test/afford.test.ts and test/guideExamples.test.ts instead.
const TEST_RATE = 6.95;

const brief = (type: 'coop' | 'condo', o = {}) => defaultPlanInputs(type, { annualIncome: 145_000, monthlyDebts: 400, cash: 110_000, mortgageRate: TEST_RATE, ...o });

test('a point at the current rate is exactly evaluatePlan', () => {
  for (const type of ['coop', 'condo'] as const) {
    const p = brief(type);
    const pt = pointAt(p, 'rate', p.mortgageRate);
    const r = evaluatePlan(p);
    assert.equal(pt.maxPrice, r.maxPrice);
    assert.equal(pt.binding, r.binding);
    assert.equal(pt.incomeLimit, r.dtiMaxPrice);
    assert.equal(pt.cashLimit, r.cashMax);
  }
});

test('max price is the lower of the income and cash limits', () => {
  for (const type of ['coop', 'condo'] as const) {
    for (const cash of [60_000, 110_000, 400_000]) {
      for (const pt of sweep(brief(type, { cash }), 'rate', rateRange(6.95))) {
        near(pt.maxPrice, Math.min(pt.incomeLimit, pt.cashLimit), 1);
      }
    }
  }
});

test('higher rates and higher charges only ever lower the income limit', () => {
  for (const type of ['coop', 'condo'] as const) {
    const p = brief(type);
    const byRate = sweep(p, 'rate', rateRange(p.mortgageRate));
    for (let i = 1; i < byRate.length; i++) assert.ok(byRate[i].incomeLimit < byRate[i - 1].incomeLimit);
    const byCharges = sweep(p, 'charges', chargesRange(p.buildingCharges));
    for (let i = 1; i < byCharges.length; i++) assert.ok(byCharges[i].incomeLimit < byCharges[i - 1].incomeLimit);
  }
});

test('income needed at a target matches the /buy/ pages at default assumptions', () => {
  for (const type of ['coop', 'condo'] as const) {
    const p = defaultPlanInputs(type, { annualIncome: 100_000, cash: 100_000 });
    const pt = pointAt(p, 'rate', p.mortgageRate, 600_000);
    near(pt.incomeNeededAtTarget!, requiredIncomeForPrice({ targetPrice: 600_000, propertyType: type }).annualIncomeNeeded, 0.01);
  }
});

test('$100/month more in charges is $100/month more at the target', () => {
  const p = brief('coop');
  const pts = sweep(p, 'charges', [1_000, 1_100], 450_000);
  near(pts[1].monthlyAtTarget! - pts[0].monthlyAtTarget!, 100, 0.001);
  near(impactPerStep(p, 'charges', 450_000).monthlyPerStep!, 100, 0.001);
});

test('one point of rate changes the target payment by the amortization difference', () => {
  const p = brief('condo', { downPaymentPct: 20 });
  const loan = 450_000 * 0.8;
  const pmt = (rate: number) => { const i = rate / 1200; return loan * i / (1 - Math.pow(1 + i, -360)); };
  near(impactPerStep(p, 'rate', 450_000).monthlyPerStep!, pmt(p.mortgageRate + 0.5) - pmt(p.mortgageRate - 0.5), 0.01);
});

test('when cash binds a condo buyer, charges move the income limit but not the max price', () => {
  const p = brief('condo');
  assert.equal(evaluatePlan(p).binding, 'DP / Closing Costs');
  const imp = impactPerStep(p, 'charges');
  assert.ok(imp.incomeLimitPerStep < -10_000);
  assert.equal(imp.maxPricePerStep, 0);
});

test('co-op reserves include the mortgage, so rates move a co-op cash limit too', () => {
  const pts = sweep(brief('coop'), 'rate', [5, 9]);
  assert.ok(pts[1].cashLimit < pts[0].cashLimit);
  const condo = sweep(brief('condo'), 'rate', [5, 9]);
  near(condo[1].cashLimit, condo[0].cashLimit, 1); // condo cash limit ignores the rate (reserves off by default)
});

test('ranges: quarter points around the rate (>= 1%), $100 steps around charges (>= $0), current value included', () => {
  const r = rateRange(6.95);
  assert.ok(r.includes(6.95) && r[0] >= 1 && r[0] <= 4 && r[r.length - 1] >= 9.75);
  assert.deepEqual(rateRange(2).slice(0, 2), [1, 1.25]);
  const c = chargesRange(1_250);
  assert.ok(c.includes(1_250) && c[0] === 300 && c[c.length - 1] === 2_300);
  assert.equal(chargesRange(400)[0], 0);
  for (const xs of [r, c]) for (let i = 1; i < xs.length; i++) assert.ok(xs[i] > xs[i - 1]);
});

test('$100/month of charges converts to a sensible number of rate points', () => {
  for (const type of ['coop', 'condo'] as const) {
    const p = brief(type);
    const pts = chargesInRatePoints(p);
    assert.ok(pts > 0.2 && pts < 1, `${type}: ${pts}`);
    near(pts, impactPerStep(p, 'charges').incomeLimitPerStep / impactPerStep(p, 'rate').incomeLimitPerStep, 1e-9);
  }
});

test('highestReaching finds the last rate where the target is still affordable', () => {
  const p = brief('coop', { cash: 300_000 });
  const pts = sweep(p, 'rate', rateRange(p.mortgageRate));
  const target = pts.find((pt) => pt.x === 6)!.maxPrice;
  assert.equal(highestReaching(pts, target), 6);
  assert.equal(highestReaching(pts, 50_000_000), null);
  assert.equal(highestReaching(pts, 1), pts[pts.length - 1].x);
});
