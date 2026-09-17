import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeBreakdown, solveRequiredSalary, applyBrackets, getHsaCap } from '../src/lib/salaryCalc.ts';
import type { RequiredSalaryInputs } from '../src/lib/salaryCalc.ts';
import { TAX_CONSTANTS_2026 } from '../src/lib/salaryTaxConstants2026.ts';

// Known-good hand-calculated case: gross=$193,000, single, NYC, 10% Traditional
// 401(k), HSA self-only maxed -> expect roughly $110,000 annual net take-home.
// Tolerance is wide because the hand-calc this was checked against used a
// different tax year's brackets/limits than TAX_CONSTANTS_2026.
test('gross $193k, single, NYC, 10% Traditional 401k, HSA self-only maxed -> ~$110k net', () => {
  const inputs: RequiredSalaryInputs = {
    filingStatus: 'single',
    k401PercentOfGross: 10,
    k401IsTraditional: true,
    hsaCoverage: 'selfOnly',
    hsaContribution: getHsaCap('selfOnly', false, TAX_CONSTANTS_2026),
    age50Plus: false,
  };
  const breakdown = computeBreakdown(193000, inputs, TAX_CONSTANTS_2026);
  assert.ok(
    Math.abs(breakdown.netTakeHome - 110000) < 5000,
    `expected net take-home near $110,000, got $${breakdown.netTakeHome.toFixed(0)}`,
  );
});

test('applyBrackets taxes each bracket at its own marginal rate', () => {
  const brackets = [
    { upTo: 10000, rate: 0.10 },
    { upTo: 40000, rate: 0.20 },
    { upTo: Infinity, rate: 0.30 },
  ];
  assert.equal(applyBrackets(0, brackets), 0);
  assert.equal(applyBrackets(5000, brackets), 500);
  assert.equal(applyBrackets(10000, brackets), 1000);
  // 1000 (first bracket) + 20% of next 20000
  assert.equal(applyBrackets(30000, brackets), 1000 + 20000 * 0.20);
  // 1000 + 6000 (full 2nd bracket) + 30% of remaining 10000
  assert.equal(applyBrackets(50000, brackets), 1000 + 6000 + 10000 * 0.30);
});

test('solveRequiredSalary inverts computeBreakdown.netTakeHome', () => {
  const inputs: RequiredSalaryInputs = {
    filingStatus: 'marriedFilingJointly',
    k401PercentOfGross: 5,
    k401IsTraditional: true,
    hsaCoverage: 'family',
    hsaContribution: 3000,
    age50Plus: false,
  };
  const targetNet = 150000;
  const requiredGross = solveRequiredSalary(targetNet, inputs, TAX_CONSTANTS_2026);
  const actualNet = computeBreakdown(requiredGross, inputs, TAX_CONSTANTS_2026).netTakeHome;
  assert.ok(Math.abs(actualNet - targetNet) < 1, `expected net ~$${targetNet}, got $${actualNet.toFixed(2)} at gross $${requiredGross.toFixed(2)}`);
});

test('Social Security stops accruing above the wage base', () => {
  const inputs: RequiredSalaryInputs = {
    filingStatus: 'single',
    k401PercentOfGross: 0,
    k401IsTraditional: true,
    hsaCoverage: 'none',
    hsaContribution: 0,
    age50Plus: false,
  };
  const wageBase = TAX_CONSTANTS_2026.fica.socialSecurityWageBase;
  const atBase = computeBreakdown(wageBase, inputs, TAX_CONSTANTS_2026);
  const wellAbove = computeBreakdown(wageBase * 2, inputs, TAX_CONSTANTS_2026);
  assert.ok(Math.abs(atBase.socialSecurity - wageBase * TAX_CONSTANTS_2026.fica.socialSecurityRate) < 0.01);
  assert.equal(atBase.socialSecurity, wellAbove.socialSecurity);
});

test('HSA contribution above the coverage-type cap is clamped and flagged', () => {
  const inputs: RequiredSalaryInputs = {
    filingStatus: 'single',
    k401PercentOfGross: 0,
    k401IsTraditional: true,
    hsaCoverage: 'selfOnly',
    hsaContribution: 999999,
    age50Plus: false,
  };
  const breakdown = computeBreakdown(150000, inputs, TAX_CONSTANTS_2026);
  assert.equal(breakdown.hsaContribution, TAX_CONSTANTS_2026.contributionLimits.hsa.selfOnly);
  assert.equal(breakdown.hsaClamped, true);
});

test('401(k) percent that would exceed the dollar cap is clamped by dollars, not percent', () => {
  const inputs: RequiredSalaryInputs = {
    filingStatus: 'single',
    k401PercentOfGross: 50,
    k401IsTraditional: true,
    hsaCoverage: 'none',
    hsaContribution: 0,
    age50Plus: false,
  };
  const breakdown = computeBreakdown(500000, inputs, TAX_CONSTANTS_2026);
  assert.equal(breakdown.k401Contribution, TAX_CONSTANTS_2026.contributionLimits.k401.standard);
  assert.equal(breakdown.k401Clamped, true);
});

test('zero savings goal (pure expense-covering case) still solves', () => {
  const inputs: RequiredSalaryInputs = {
    filingStatus: 'single',
    k401PercentOfGross: 0,
    k401IsTraditional: true,
    hsaCoverage: 'none',
    hsaContribution: 0,
    age50Plus: false,
  };
  const requiredGross = solveRequiredSalary(0, inputs, TAX_CONSTANTS_2026);
  assert.ok(requiredGross < 1, `expected required gross near $0, got $${requiredGross}`);
});
