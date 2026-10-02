import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  calcMansionTax,
  calcMortgageRecordingTax,
  calcPmiRate,
  calcPmiMonthly,
  calcNycRptt,
  calcNysTransferTax,
  bsearchMaxPrice,
} from '../src/lib/calc.ts';

// Characterization tests for the shared NYC tax/fee helpers. Every expected
// value below is hand-computed from the rate tables cited in src/lib/calc.ts,
// so a failure here means a rate or threshold changed, not a rounding nit.

const near = (actual: number, expected: number, tol = 0.01) =>
  assert.ok(Math.abs(actual - expected) <= tol, `expected ${expected}, got ${actual}`);

test('mansion tax: $0 below $1M, whole-price (not marginal) at each tier boundary', () => {
  near(calcMansionTax(999_999), 0);
  near(calcMansionTax(1_000_000), 10_000);      // 1.00%
  near(calcMansionTax(1_999_999), 19_999.99);
  near(calcMansionTax(2_000_000), 25_000);      // 1.25%
  near(calcMansionTax(3_000_000), 45_000);      // 1.50%
  near(calcMansionTax(5_000_000), 112_500);     // 2.25%
  near(calcMansionTax(10_000_000), 325_000);    // 3.25%
  near(calcMansionTax(15_000_000), 525_000);    // 3.50%
  near(calcMansionTax(20_000_000), 750_000);    // 3.75%
  near(calcMansionTax(25_000_000), 975_000);    // 3.90%
});

test('mansion tax cliff: one dollar over $1M costs ~$10,000', () => {
  assert.ok(calcMansionTax(1_000_000) - calcMansionTax(999_999) >= 10_000);
});

test('mortgage recording tax: borrower share switches from 1.80% to 1.925% at a $500K loan', () => {
  near(calcMortgageRecordingTax(0), 0);
  near(calcMortgageRecordingTax(-1), 0);
  near(calcMortgageRecordingTax(499_999), 8_999.98);
  near(calcMortgageRecordingTax(500_000), 9_625);
  near(calcMortgageRecordingTax(800_000), 15_400);
});

test('PMI rate tiers by down payment', () => {
  assert.equal(calcPmiRate(0.25), 0);
  assert.equal(calcPmiRate(0.20), 0);
  assert.equal(calcPmiRate(0.15), 0.0052);
  assert.equal(calcPmiRate(0.10), 0.0070);
  assert.equal(calcPmiRate(0.05), 0.0095);
  assert.equal(calcPmiRate(0.03), 0.0120);
  near(calcPmiMonthly(400_000, 0.10), 233.33);
  near(calcPmiMonthly(400_000, 0.20), 0);
});

test('NYC RPTT: 1.00% through $500K, 1.425% of the whole price above it', () => {
  near(calcNycRptt(0), 0);
  near(calcNycRptt(500_000), 5_000);
  near(calcNycRptt(500_001), 7_125.01);
  near(calcNycRptt(1_000_000), 14_250);
});

test('NYS transfer tax: 0.4% base, plus 0.25% additional base tax on NYC residential sales of $3M+', () => {
  near(calcNysTransferTax(0), 0);
  near(calcNysTransferTax(1_000_000), 4_000);
  near(calcNysTransferTax(2_999_999), 12_000);
  near(calcNysTransferTax(3_000_000), 19_500); // 0.65% combined
});

test('bsearchMaxPrice finds the largest passing price to within $1', () => {
  const p = bsearchMaxPrice((x) => x <= 123_456, 10_000_000);
  assert.ok(p <= 123_456 && p > 123_455, `got ${p}`);
  assert.equal(bsearchMaxPrice(() => false, 1_000), 0);
  assert.equal(bsearchMaxPrice(() => true, 1_000), 1_000);
});
