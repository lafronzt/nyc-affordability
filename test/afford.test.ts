import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  maxAffordableRent,
  requiredIncomeForRent,
  maxAffordablePrice,
  requiredIncomeForPrice,
  DEFAULT_ASSUMPTIONS,
} from '../src/lib/afford.ts';
import { calcMortgageRecordingTax } from '../src/lib/calc.ts';

// Golden fixtures for the build-time affordability engine behind the homepage
// table, /income/, /buy/, /rent/<n>/, and neighborhood pages. Values were
// captured from the current engine at default assumptions (6.95% / 30yr /
// 20% down; co-op 28% DTI + $1,200 maint; condo 43% DTI + $2,325 carrying)
// and spot-checked by hand. If a sourced default changes (e.g. the mortgage
// rate), these goldens are expected to change with it. Update them in the
// same PR and say so.

const near = (actual: number, expected: number, tol = 0.5) =>
  assert.ok(Math.abs(actual - expected) <= tol, `expected ${expected}, got ${actual}`);

test('rent: 40x rule both directions', () => {
  near(maxAffordableRent({ annualIncome: 150_000 }).maxRent, 3_750);
  near(maxAffordableRent({ annualIncome: 75_000 }).maxRent, 1_875);
  near(requiredIncomeForRent({ targetRent: 3_000 }).annualIncomeNeeded, 120_000);
  near(maxAffordableRent({ annualIncome: 150_000, incomeMultiplier: 0 }).maxRent, 0);
});

test('DTI ceilings at representative incomes (homepage / income-page goldens)', () => {
  const cases: [number, 'coop' | 'condo', number][] = [
    [75_000, 'coop', 103_860.14],
    [75_000, 'condo', 68_453.27],
    [150_000, 'coop', 434_324.21],
    [150_000, 'condo', 575_951.67],
    [250_000, 'coop', 874_942.97],
    [250_000, 'condo', 1_252_616.19],
  ];
  for (const [income, type, expected] of cases) {
    near(maxAffordablePrice({ annualIncome: income, propertyType: type }).maxPrice, expected);
  }
});

test('DTI ceiling is zero when carrying costs alone exceed the DTI budget', () => {
  // Co-op: 28% of $50K/12 = $1,166.67 < $1,200 maintenance.
  assert.equal(maxAffordablePrice({ annualIncome: 50_000, propertyType: 'coop' }).maxPrice, 0);
});

test('monthly debt lowers the DTI ceiling', () => {
  const base = maxAffordablePrice({ annualIncome: 150_000, propertyType: 'condo' }).maxPrice;
  const withDebt = maxAffordablePrice({ annualIncome: 150_000, propertyType: 'condo', otherDebts: 500 }).maxPrice;
  near(withDebt, 481_533.36);
  assert.ok(base - withDebt > 90_000);
});

test('DTI boundary: income from requiredIncomeForPrice round-trips to the same max price', () => {
  for (const type of ['coop', 'condo'] as const) {
    for (const price of [500_000, 750_000, 1_250_000]) {
      const { annualIncomeNeeded } = requiredIncomeForPrice({ targetPrice: price, propertyType: type });
      near(maxAffordablePrice({ annualIncome: annualIncomeNeeded, propertyType: type }).maxPrice, price, 1);
    }
  }
});

test('required income at representative prices', () => {
  near(requiredIncomeForPrice({ targetPrice: 500_000, propertyType: 'coop' }).annualIncomeNeeded, 164_905.36);
  near(requiredIncomeForPrice({ targetPrice: 500_000, propertyType: 'condo' }).annualIncomeNeeded, 138_775.58);
  near(requiredIncomeForPrice({ targetPrice: 1_000_000, propertyType: 'coop' }).annualIncomeNeeded, 278_382.14);
  near(requiredIncomeForPrice({ targetPrice: 1_500_000, propertyType: 'condo' }).annualIncomeNeeded, 286_559.30);
});

test('mansion tax threshold shows up in cash needed at exactly $1M', () => {
  for (const type of ['coop', 'condo'] as const) {
    const under = requiredIncomeForPrice({ targetPrice: 999_999, propertyType: type });
    const at = requiredIncomeForPrice({ targetPrice: 1_000_000, propertyType: type });
    assert.equal(under.mansionTax, 0);
    assert.equal(at.mansionTax, 10_000);
    assert.ok(at.estimatedCashNeeded - under.estimatedCashNeeded > 10_000);
  }
});

test('co-op reserves = 12 months of P&I + maintenance; condo reserves off by default', () => {
  const coop = requiredIncomeForPrice({ targetPrice: 500_000, propertyType: 'coop' });
  near(coop.estimatedReserves, 12 * (coop.monthlyPI + coop.monthlyCarrying));
  near(coop.estimatedReserves, 46_173.5);
  assert.equal(requiredIncomeForPrice({ targetPrice: 500_000, propertyType: 'condo' }).estimatedReserves, 0);
});

test('mortgage recording tax applies to condos, not co-ops', () => {
  const condo = requiredIncomeForPrice({ targetPrice: 500_000, propertyType: 'condo' });
  // $5,000 + $3,500 + $1,000 + $750 + $1,500 fixed; 0.45% title on price; 0.10% on loan; MRT on $400K loan.
  near(condo.estimatedClosingCosts, 11_750 + 2_250 + 400 + calcMortgageRecordingTax(400_000));
  near(condo.estimatedCashNeeded, 121_600);
});

// Regression: the /coop/ calculator's "Total Fixed" closing costs include five
// fees (attorney $4,000, bank attorney $1,500, board fee $750, move-in deposit
// $1,000, other $800 = $8,050). The build-time engine used to sum only the
// first three ($6,250), so every /buy/<price>/ co-op cash figure was $1,800
// lower than the calculator it links to.
test('co-op fixed closing costs match the /coop/ calculator defaults ($8,050)', () => {
  assert.equal(DEFAULT_ASSUMPTIONS.coopFixedClosingCosts, 8_050);
  const coop = requiredIncomeForPrice({ targetPrice: 500_000, propertyType: 'coop' });
  near(coop.estimatedClosingCosts, 8_050 + 2_500); // + 0.5% variable
  near(coop.estimatedCashNeeded, 100_000 + 10_550 + 46_173.5);
});
