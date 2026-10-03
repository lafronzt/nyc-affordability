import { test } from 'node:test';
import assert from 'node:assert/strict';
import { payPeriods } from '../src/lib/payPeriods.ts';
import { computeBreakdown, SALARY_LANDING_PAGE_BASELINE } from '../src/lib/salaryCalc.ts';
import { TAX_CONSTANTS_2026 } from '../src/lib/salaryTaxConstants2026.ts';

// Pay-period rows are the annual breakdown split evenly; every row must add
// back up to the annual figures.

const near = (a: number, b: number, tol = 0.01) => assert.ok(Math.abs(a - b) <= tol, `expected ${b}, got ${a}`);

test('each frequency multiplies back to the annual gross, withholding, and net', () => {
  const b = computeBreakdown(100_000, SALARY_LANDING_PAGE_BASELINE, TAX_CONSTANTS_2026);
  const rows = payPeriods(b);
  assert.deepEqual(rows.map((r) => r.perYear), [52, 26, 24, 12]);
  for (const r of rows) {
    near(r.gross * r.perYear, 100_000);
    near(r.net * r.perYear, b.netTakeHome);
    near(r.gross - r.withheld, r.net);
  }
});

test('biweekly is not twice-a-month: 26 checks vs 24', () => {
  const rows = payPeriods({ gross: 120_000, netTakeHome: 84_000 });
  const bi = rows.find((r) => r.id === 'biweekly')!;
  const semi = rows.find((r) => r.id === 'semimonthly')!;
  near(bi.net, 84_000 / 26);
  near(semi.net, 3_500);
  assert.ok(semi.net > bi.net);
});
