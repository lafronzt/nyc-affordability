/* ============================================================
   Pay-period view of an annual paycheck breakdown (pure, DOM-free)
   ============================================================
   Splits the annual figures from computeBreakdown() evenly across the
   number of paychecks in a year. Real withholding follows the payroll
   tables and can differ check to check (bonuses, the Social Security
   wage cap partway through a high earner's year), so this is the
   average paycheck, which is what a budget is built on.
   ============================================================ */

export const PAY_FREQUENCIES = [
  { id: 'weekly', label: 'Weekly', perYear: 52 },
  { id: 'biweekly', label: 'Every two weeks', perYear: 26 },
  { id: 'semimonthly', label: 'Twice a month', perYear: 24 },
  { id: 'monthly', label: 'Monthly', perYear: 12 },
] as const;

export interface AnnualPay { gross: number; netTakeHome: number }

export interface PayPeriodRow {
  id: (typeof PAY_FREQUENCIES)[number]['id'];
  label: string;
  perYear: number;
  gross: number;
  /** Everything withheld: income taxes, FICA, NY PFL/SDI (gross minus net). */
  withheld: number;
  net: number;
}

export function payPeriods(annual: AnnualPay): PayPeriodRow[] {
  return PAY_FREQUENCIES.map((f) => ({
    id: f.id,
    label: f.label,
    perYear: f.perYear,
    gross: annual.gross / f.perYear,
    withheld: (annual.gross - annual.netTakeHome) / f.perYear,
    net: annual.netTakeHome / f.perYear,
  }));
}
