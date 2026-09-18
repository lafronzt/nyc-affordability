/* ============================================================
   Tax-year 2026 constants for the Required Salary Calculator
   (src/lib/salaryCalc.ts). Externalized here, separate from the
   calculation logic, so next year's update is a data swap: copy this
   file to salaryTaxConstants2027.ts, edit the numbers, and repoint the
   import in salaryCalc.ts (or the page that constructs inputs).

   A plain TS module (not tax-constants-2026.json) so it can be
   type-checked and so both the Vite build and the plain-Node unit test
   (see salaryCalc.test.ts) can import it without extra loader config —
   Node's ESM JSON-import rules currently require an import-attribute
   Vite doesn't need, which would make the two runtimes disagree on
   syntax for no benefit here.

   Sources (verified 2026-09-17):
   - Federal brackets + standard deduction: IRS Rev. Proc. 2025-32
     (https://www.irs.gov/pub/irs-drop/rp-25-32.pdf) via
     https://www.irs.gov/newsroom/irs-releases-tax-inflation-adjustments-for-tax-year-2026-including-amendments-from-the-one-big-beautiful-bill
   - Additional Medicare Tax thresholds ($200k single/HOH, $250k MFJ):
     fixed by statute, not inflation-indexed.
   - Social Security wage base ($184,500) + 401(k)/HSA limits: IRS 2026
     COLA adjustments, https://www.irs.gov/newsroom/401k-limit-increases-to-24500-for-2026-ira-limit-increases-to-7500
   - NY State brackets + standard deduction: NYS Dept. of Taxation and
     Finance 2026 rate schedules (aggregated via ustax.tools / nerdwallet
     NY State tax summaries, cross-checked for internal consistency).
   - NYC resident surcharge brackets: NYC's 4-bracket resident schedule
     (3.078% / 3.762% / 3.819% / 3.876%) — fixed dollar thresholds, not
     inflation-indexed; unchanged for many tax years per NY IT-201
     instructions.
   - Commuter benefit (transit/parking) + Healthcare FSA limits: IRS 2026
     COLA adjustments, same annual Rev. Proc. 2025-32 as the federal
     brackets above (https://www.irs.gov/pub/irs-drop/rp-25-32.pdf).
   - Dependent Care FSA limit ($7,500): OBBBA §70404, the first permanent
     increase to this cap since 1986 (previously a fixed, non-indexed
     $5,000) — effective for plan years beginning in 2026. We don't model
     Married Filing Separately, so the separate $3,750 MFS cap isn't used.
   - NY Paid Family Leave rate/cap (0.432%, $411.91/yr): NYS Workers'
     Compensation Board 2026 announcement,
     https://www.wcb.ny.gov/content/main/PressRe/paid-family-leave-2026.jsp
   - NY State Disability Insurance (SDI/DBL) employee contribution cap
     ($0.60/week = $31.20/year): a long-standing fixed statutory cap under
     the NY Disability Benefits Law, not inflation-indexed. Modeled as a
     flat annual constant rather than a real per-paycheck formula — every
     wage earner above a trivial income hits this cap almost immediately,
     so computing it more precisely wouldn't change the number for any
     salary this calculator is realistically used for.

   This tool is scoped to NYC residents only — NY State tax plus the NYC
   resident local surcharge always apply; there is no other-jurisdiction
   option. NY SDI/PFL are therefore always-on too. (NJ has its own
   SDI/family-leave-insurance program at different rates — out of scope
   unless a NJ jurisdiction option gets reintroduced.)
   ============================================================ */

export type FilingStatus = 'single' | 'marriedFilingJointly' | 'headOfHousehold';

export interface TaxBracket {
  /** Upper bound of this bracket's taxable income, inclusive. Use Infinity for the top bracket. */
  upTo: number;
  rate: number;
}

export interface TaxYearConstants {
  year: number;
  federal: {
    standardDeduction: Record<FilingStatus, number>;
    brackets: Record<FilingStatus, TaxBracket[]>;
  };
  fica: {
    socialSecurityRate: number;
    socialSecurityWageBase: number;
    medicareRate: number;
    additionalMedicareRate: number;
    additionalMedicareThreshold: Record<FilingStatus, number>;
  };
  nyState: {
    standardDeduction: Record<FilingStatus, number>;
    brackets: Record<FilingStatus, TaxBracket[]>;
  };
  nycLocal: {
    brackets: Record<FilingStatus, TaxBracket[]>;
  };
  contributionLimits: {
    year: number;
    /** catchUp50/catchUp55 are ADD-ONS to the standard/coverage cap, not totals. */
    k401: { standard: number; catchUp50: number };
    hsa: { selfOnly: number; family: number; catchUp55: number };
  };
  commuterBenefit: { transitMonthly: number; parkingMonthly: number };
  fsa: { healthcareAnnual: number; dependentCareAnnual: number };
  /** NY-specific mandatory payroll deductions — always apply, since this tool is NYC-only. */
  ny: { pflRate: number; pflAnnualCap: number; sdiAnnualCap: number };
}

export const TAX_CONSTANTS_2026: TaxYearConstants = {
  year: 2026,
  federal: {
    standardDeduction: {
      single: 16100,
      marriedFilingJointly: 32200,
      headOfHousehold: 24150,
    },
    brackets: {
      single: [
        { upTo: 12400, rate: 0.10 },
        { upTo: 50400, rate: 0.12 },
        { upTo: 105700, rate: 0.22 },
        { upTo: 201775, rate: 0.24 },
        { upTo: 256225, rate: 0.32 },
        { upTo: 640600, rate: 0.35 },
        { upTo: Infinity, rate: 0.37 },
      ],
      marriedFilingJointly: [
        { upTo: 24800, rate: 0.10 },
        { upTo: 100800, rate: 0.12 },
        { upTo: 211400, rate: 0.22 },
        { upTo: 403550, rate: 0.24 },
        { upTo: 512450, rate: 0.32 },
        { upTo: 768700, rate: 0.35 },
        { upTo: Infinity, rate: 0.37 },
      ],
      headOfHousehold: [
        { upTo: 17700, rate: 0.10 },
        { upTo: 63150, rate: 0.12 },
        { upTo: 100500, rate: 0.22 },
        { upTo: 191950, rate: 0.24 },
        { upTo: 243700, rate: 0.32 },
        { upTo: 609350, rate: 0.35 },
        { upTo: Infinity, rate: 0.37 },
      ],
    },
  },
  fica: {
    socialSecurityRate: 0.062,
    socialSecurityWageBase: 184500,
    medicareRate: 0.0145,
    additionalMedicareRate: 0.009,
    additionalMedicareThreshold: {
      single: 200000,
      marriedFilingJointly: 250000,
      headOfHousehold: 200000,
    },
  },
  nyState: {
    standardDeduction: {
      single: 8000,
      marriedFilingJointly: 16050,
      headOfHousehold: 11200,
    },
    brackets: {
      single: [
        { upTo: 8500, rate: 0.04 },
        { upTo: 11700, rate: 0.045 },
        { upTo: 13900, rate: 0.0525 },
        { upTo: 80650, rate: 0.055 },
        { upTo: 215400, rate: 0.06 },
        { upTo: 2155350, rate: 0.0685 },
        { upTo: 5000000, rate: 0.0965 },
        { upTo: 25000000, rate: 0.103 },
        { upTo: Infinity, rate: 0.109 },
      ],
      marriedFilingJointly: [
        { upTo: 17150, rate: 0.04 },
        { upTo: 23600, rate: 0.045 },
        { upTo: 27900, rate: 0.0525 },
        { upTo: 161550, rate: 0.055 },
        { upTo: 323200, rate: 0.06 },
        { upTo: 2155350, rate: 0.0685 },
        { upTo: 5000000, rate: 0.0965 },
        { upTo: 25000000, rate: 0.103 },
        { upTo: Infinity, rate: 0.109 },
      ],
      headOfHousehold: [
        { upTo: 12800, rate: 0.04 },
        { upTo: 17650, rate: 0.045 },
        { upTo: 20900, rate: 0.0525 },
        { upTo: 107650, rate: 0.055 },
        { upTo: 269300, rate: 0.06 },
        { upTo: 2155350, rate: 0.0685 },
        { upTo: 5000000, rate: 0.0965 },
        { upTo: 25000000, rate: 0.103 },
        { upTo: Infinity, rate: 0.109 },
      ],
    },
  },
  nycLocal: {
    brackets: {
      single: [
        { upTo: 12000, rate: 0.03078 },
        { upTo: 25000, rate: 0.03762 },
        { upTo: 50000, rate: 0.03819 },
        { upTo: Infinity, rate: 0.03876 },
      ],
      marriedFilingJointly: [
        { upTo: 21600, rate: 0.03078 },
        { upTo: 45000, rate: 0.03762 },
        { upTo: 90000, rate: 0.03819 },
        { upTo: Infinity, rate: 0.03876 },
      ],
      headOfHousehold: [
        { upTo: 14400, rate: 0.03078 },
        { upTo: 30000, rate: 0.03762 },
        { upTo: 60000, rate: 0.03819 },
        { upTo: Infinity, rate: 0.03876 },
      ],
    },
  },
  contributionLimits: {
    year: 2026,
    k401: { standard: 24500, catchUp50: 8000 },
    hsa: { selfOnly: 4400, family: 8750, catchUp55: 1000 },
  },
  commuterBenefit: { transitMonthly: 340, parkingMonthly: 340 },
  fsa: { healthcareAnnual: 3400, dependentCareAnnual: 7500 },
  ny: { pflRate: 0.00432, pflAnnualCap: 411.91, sdiAnnualCap: 31.20 },
};
