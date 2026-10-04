/* ============================================================
   Sourced default assumptions: single source of truth.
   ============================================================
   Every default the site's math starts from lives here, with where it came
   from and when someone last checked it. src/lib/afford.ts (the build-time
   engine behind the homepage table, /income/, /buy/, /rent/<n>/ and
   neighborhood pages) reads its numbers from this file.

   The interactive calculators still carry their defaults as <input value>
   attributes in src/pages/{coop,condo,rent}/index.astro. Each entry's
   `inputs` list names those fields, and test/defaultsParity.test.ts fails
   if any of them disagree with the value here. Change a default here AND
   in the page, or the test will tell you which one you missed.

   HONESTY RULES (same as the rest of the site):
   - `basis` says what kind of number this is. A market convention is not a
     law, and an illustrative midpoint is not a measured median.
   - `sourceUrl` is null when the calculators cite a source by name only.
     Don't backfill a URL you haven't actually checked.
   - `lastVerified` is the date someone last checked the figure against its
     source, not the date this file was edited. Only the mortgage rate has a
     recorded check date (PR #58, 2026-09-23); everything else starts as null
     until someone re-verifies it.
   ============================================================ */

export type AssumptionBasis =
  | 'law'            // statute or regulation (tax rates, legal limits)
  | 'official-data'  // published government/GSE series (Freddie Mac PMMS, HUD)
  | 'market-survey'  // broker/industry reports and surveys
  | 'convention'     // widespread NYC practice with no single authority (40x rule)
  | 'illustrative';  // a reasonable midpoint chosen by this site; edit it

export interface Assumption {
  value: number;
  unit: '%' | 'USD' | 'USD/mo' | 'years' | 'months' | 'x';
  label: string;
  basis: AssumptionBasis;
  sourceOrg: string | null;
  sourceUrl: string | null;
  /** When the figure applies (e.g. the PMMS survey week), if it has one. */
  effectiveDate: string | null;
  /** When someone last checked the figure against its source (YYYY-MM-DD).
      null = carried over from the calculators without a recorded check date;
      shown as "not yet re-verified", never back-filled with a guess. */
  lastVerified: string | null;
  notes?: string;
  /** Calculator <input> fields that must default to this value. */
  inputs?: { page: 'coop' | 'condo' | 'rent' | 'sell'; id: string }[];
}

const asm = <T extends Record<string, Assumption>>(t: T) => t;

export const ASSUMPTIONS = asm({
  // ---- Mortgage ----
  mortgageRatePct: {
    value: 6.95,
    unit: '%',
    label: '30-year fixed mortgage rate',
    basis: 'official-data',
    sourceOrg: 'Freddie Mac Primary Mortgage Market Survey',
    sourceUrl: 'https://www.freddiemac.com/pmms',
    effectiveDate: '2026-09-17',
    lastVerified: '2026-09-23',
    notes: 'Conventional, conforming, 20% down, excellent credit. Bankrate showed 6.97% the same week. Jumbo loans and lender overlays can differ materially.',
    inputs: [{ page: 'coop', id: 'mtg-rate' }, { page: 'condo', id: 'mtg-rate' }],
  },
  loanTermYears: {
    value: 30,
    unit: 'years',
    label: 'Loan term',
    basis: 'convention',
    sourceOrg: null,
    sourceUrl: null,
    effectiveDate: null,
    lastVerified: null,
    inputs: [{ page: 'coop', id: 'loan-term' }, { page: 'condo', id: 'loan-term' }],
  },

  // ---- Co-op ----
  coopDownPaymentPct: {
    value: 20,
    unit: '%',
    label: 'Co-op down payment',
    basis: 'market-survey',
    sourceOrg: 'Skybriz; Prevu (2025)',
    sourceUrl: null,
    effectiveDate: null,
    lastVerified: null,
    notes: 'Minimum for most buildings. Mid-range Manhattan boards often require 25%; luxury buildings 30 to 50%.',
    inputs: [{ page: 'coop', id: 'dp-pct' }],
  },
  coopMaxDtiPct: {
    value: 28,
    unit: '%',
    label: 'Co-op board max debt-to-income',
    basis: 'convention',
    sourceOrg: 'Prevu; YRE (2025)',
    sourceUrl: null,
    effectiveDate: null,
    lastVerified: null,
    notes: 'Long-standing NYC board standard. Outer-borough buildings may allow 30 to 35%; some Park/Fifth Ave buildings cap at 20 to 25%.',
    inputs: [{ page: 'coop', id: 'max-dti' }],
  },
  coopReserveMonths: {
    value: 12,
    unit: 'months',
    label: 'Co-op post-closing liquidity',
    basis: 'convention',
    sourceOrg: 'Prevu; Aaron & Geoff (Compass), 2026',
    sourceUrl: null,
    effectiveDate: null,
    lastVerified: null,
    notes: 'Months of mortgage + maintenance. Conservative/luxury boards require 24+. Retirement accounts are generally excluded.',
    inputs: [{ page: 'coop', id: 'reserve-mo' }],
  },
  coopMaintenanceMo: {
    value: 1200,
    unit: 'USD/mo',
    label: 'Co-op monthly maintenance',
    basis: 'illustrative',
    sourceOrg: 'Elliman / Miller Samuel (Q4 2024)',
    sourceUrl: null,
    effectiveDate: null,
    lastVerified: null,
    notes: 'Mid-range citywide estimate. Rough medians: Queens ~$750, Brooklyn ~$900, Manhattan ~$1,500 to $1,800.',
    inputs: [{ page: 'coop', id: 'monthly-maint' }],
  },
  coopAttorneyFee: {
    value: 4000, unit: 'USD', label: 'Buyer attorney (co-op)', basis: 'market-survey',
    sourceOrg: 'Prevu; Brick Underground (2025)', sourceUrl: null, effectiveDate: null, lastVerified: null,
    notes: 'NYC range $2,500 to $5,000.',
    inputs: [{ page: 'coop', id: 'fc-atty' }],
  },
  coopBankAttorneyFee: {
    value: 1500, unit: 'USD', label: 'Bank attorney (co-op)', basis: 'illustrative',
    sourceOrg: null, sourceUrl: null, effectiveDate: null, lastVerified: null,
    inputs: [{ page: 'coop', id: 'fc-bank-atty' }],
  },
  coopBoardFee: {
    value: 750, unit: 'USD', label: 'Co-op application / board fee', basis: 'illustrative',
    sourceOrg: null, sourceUrl: null, effectiveDate: null, lastVerified: null,
    inputs: [{ page: 'coop', id: 'fc-coop' }],
  },
  coopMoveInDeposit: {
    value: 1000, unit: 'USD', label: 'Move-in deposit (refundable)', basis: 'illustrative',
    sourceOrg: null, sourceUrl: null, effectiveDate: null, lastVerified: null,
    notes: 'Refundable, but it is still cash you need on closing day.',
    inputs: [{ page: 'coop', id: 'fc-movein' }],
  },
  coopOtherFixedFees: {
    value: 800, unit: 'USD', label: 'Other fixed costs (UCC filing, lien search, etc.)', basis: 'illustrative',
    sourceOrg: null, sourceUrl: null, effectiveDate: null, lastVerified: null,
    inputs: [{ page: 'coop', id: 'fc-other' }],
  },
  coopVariableClosingPct: {
    value: 0.5, unit: '%', label: 'Co-op variable closing costs (loan origination)', basis: 'illustrative',
    sourceOrg: null, sourceUrl: null, effectiveDate: null, lastVerified: null,
    notes: 'Excludes mansion tax (calculated separately) and any buyer-side flip tax.',
    inputs: [{ page: 'coop', id: 'var-pct' }],
  },

  // ---- Condo ----
  condoDownPaymentPct: {
    value: 20, unit: '%', label: 'Condo down payment', basis: 'convention',
    sourceOrg: null, sourceUrl: null, effectiveDate: null, lastVerified: null,
    notes: 'Conventional conforming baseline. Jumbo lenders often require 25 to 30%.',
    inputs: [{ page: 'condo', id: 'dp-pct' }],
  },
  condoMaxDtiPct: {
    value: 43, unit: '%', label: 'Lender max back-end debt-to-income', basis: 'official-data',
    sourceOrg: 'CFPB / Fannie Mae (qualified mortgage guidance)',
    sourceUrl: 'https://www.consumerfinance.gov/ask-cfpb/what-is-a-debt-to-income-ratio-en-1791/',
    effectiveDate: null, lastVerified: null,
    notes: 'Some lenders target 36%; compensating factors can allow higher.',
    inputs: [{ page: 'condo', id: 'max-dti' }],
  },
  condoCommonChargesMo: {
    value: 1000, unit: 'USD/mo', label: 'Condo common charges', basis: 'illustrative',
    sourceOrg: null, sourceUrl: null, effectiveDate: null, lastVerified: null,
    notes: 'Manhattan full-service often $1,500 to $3,000+; Brooklyn/Queens boutique often $500 to $900.',
    inputs: [{ page: 'condo', id: 'common-charges' }],
  },
  condoPropertyTaxMo: {
    value: 1250, unit: 'USD/mo', label: 'Condo property tax', basis: 'market-survey',
    sourceOrg: 'Habitat Magazine / NYC DOF 2025-26 tentative assessment roll', sourceUrl: null,
    effectiveDate: null, lastVerified: null,
    notes: 'Reported citywide average is ~$15,134/yr ($1,261/mo); the default rounds to $1,250. Abatements change this dramatically.',
    inputs: [{ page: 'condo', id: 'prop-taxes' }],
  },
  condoInsuranceMo: {
    value: 75, unit: 'USD/mo', label: 'HO-6 insurance', basis: 'illustrative',
    sourceOrg: null, sourceUrl: null, effectiveDate: null, lastVerified: null,
    inputs: [{ page: 'condo', id: 'ho-insurance' }],
  },
  condoAttorneyFee: {
    value: 5000, unit: 'USD', label: 'Buyer attorney (condo)', basis: 'illustrative',
    sourceOrg: null, sourceUrl: null, effectiveDate: null, lastVerified: null,
    inputs: [{ page: 'condo', id: 'fc-atty' }],
  },
  condoLenderFees: {
    value: 3500, unit: 'USD', label: 'Lender fees', basis: 'illustrative',
    sourceOrg: null, sourceUrl: null, effectiveDate: null, lastVerified: null,
    inputs: [{ page: 'condo', id: 'fc-lender' }],
  },
  condoAppraisalFee: {
    value: 1000, unit: 'USD', label: 'Appraisal', basis: 'illustrative',
    sourceOrg: null, sourceUrl: null, effectiveDate: null, lastVerified: null,
    inputs: [{ page: 'condo', id: 'fc-appraisal' }],
  },
  condoRecordingFees: {
    value: 750, unit: 'USD', label: 'Recording fees', basis: 'illustrative',
    sourceOrg: null, sourceUrl: null, effectiveDate: null, lastVerified: null,
    inputs: [{ page: 'condo', id: 'fc-recording' }],
  },
  condoBuildingFees: {
    value: 1500, unit: 'USD', label: 'Building / managing agent fees', basis: 'illustrative',
    sourceOrg: null, sourceUrl: null, effectiveDate: null, lastVerified: null,
    inputs: [{ page: 'condo', id: 'fc-building' }],
  },
  condoOwnerTitlePct: {
    value: 0.45, unit: '%', label: "Owner's title insurance (% of price)", basis: 'illustrative',
    sourceOrg: null, sourceUrl: null, effectiveDate: null, lastVerified: null,
    notes: 'Mid-range NYC resale condo estimate; varies by insurer and endorsements.',
    inputs: [{ page: 'condo', id: 'title-price-pct' }],
  },
  condoLenderTitlePct: {
    value: 0.10, unit: '%', label: "Lender's title policy (% of loan)", basis: 'illustrative',
    sourceOrg: null, sourceUrl: null, effectiveDate: null, lastVerified: null,
    inputs: [{ page: 'condo', id: 'title-loan-pct' }],
  },
  condoReserveMonths: {
    value: 6, unit: 'months', label: 'Condo reserve buffer (when enabled)', basis: 'illustrative',
    sourceOrg: null, sourceUrl: null, effectiveDate: null, lastVerified: null,
    notes: 'Off by default: condos do not impose co-op-style board reserves, but lenders or buyers may want a buffer.',
    inputs: [{ page: 'condo', id: 'reserve-mo' }],
  },
  condoWorkingCapitalMonths: {
    value: 2, unit: 'months', label: 'Working capital contribution (months of common charges, when enabled)', basis: 'illustrative',
    sourceOrg: null, sourceUrl: null, effectiveDate: null, lastVerified: null,
    notes: 'Common in new development; off by default.',
    inputs: [{ page: 'condo', id: 'wc-months' }],
  },

  // ---- Savings ----
  savingsYieldPct: {
    value: 3, unit: '%', label: 'Yield on savings while you save to buy', basis: 'illustrative',
    sourceOrg: null, sourceUrl: null, effectiveDate: null, lastVerified: null,
    notes: 'A placeholder, not a rate quote. High-yield savings and money-market rates move with Fed policy; enter your own account\'s APY on the savings planner.',
  },

  // ---- Long-run projections (rent vs buy) ----
  // None of these is a forecast. They're round, editable midpoints so the
  // comparison has somewhere to start; /rent-vs-buy/ shows them as inputs.
  rentGrowthPct: {
    value: 3, unit: '%', label: 'Annual rent increase', basis: 'illustrative',
    sourceOrg: null, sourceUrl: null, effectiveDate: null, lastVerified: null,
    notes: 'Free-market NYC rents have swung from double-digit drops (2020) to double-digit jumps (2022). Rent-stabilized renewals follow the Rent Guidelines Board instead.',
  },
  homeAppreciationPct: {
    value: 3, unit: '%', label: 'Annual home price change', basis: 'illustrative',
    sourceOrg: null, sourceUrl: null, effectiveDate: null, lastVerified: null,
    notes: 'A placeholder, not a forecast. Co-op prices in many NYC submarkets were flat for most of the 2010s.',
  },
  ownerCostGrowthPct: {
    value: 3, unit: '%', label: 'Annual increase in maintenance / common charges, taxes and insurance', basis: 'illustrative',
    sourceOrg: null, sourceUrl: null, effectiveDate: null, lastVerified: null,
  },
  ownerUpkeepPct: {
    value: 0.5, unit: '%', label: 'In-unit repairs and upkeep (per year, % of home value)', basis: 'illustrative',
    sourceOrg: null, sourceUrl: null, effectiveDate: null, lastVerified: null,
    notes: 'The building\'s charges cover the structure and common areas; the inside of the unit (appliances, floors, paint) is on you. Lower than the house rule of thumb (1%) for that reason.',
  },
  investmentReturnPct: {
    value: 5, unit: '%', label: 'Annual return on money not tied up in the home', basis: 'illustrative',
    sourceOrg: null, sourceUrl: null, effectiveDate: null, lastVerified: null,
    notes: 'After-tax, after-inflation is not implied; this is a nominal placeholder. Use what you would actually earn on the down payment if you kept renting.',
  },

  // ---- Moving ----
  moversCost: {
    value: 1500, unit: 'USD', label: 'Movers (local NYC move)', basis: 'illustrative',
    sourceOrg: null, sourceUrl: null, effectiveDate: null, lastVerified: null,
    notes: 'A placeholder for a small local move. Walk-ups, distance, volume, and weekends move it a lot; get a quote.',
  },
  movingSupplies: {
    value: 150, unit: 'USD', label: 'Boxes and moving supplies', basis: 'illustrative',
    sourceOrg: null, sourceUrl: null, effectiveDate: null, lastVerified: null,
  },
  guarantorCompanyFeePct: {
    value: 70, unit: '%', label: 'Guarantor company fee (% of one month\'s rent, per lease year)', basis: 'illustrative',
    sourceOrg: null, sourceUrl: null, effectiveDate: null, lastVerified: null,
    notes: 'Our guarantor-companies guide reports fees commonly around 60% to 110% of a month\'s rent depending on credit and income. Off by default on /cost-to-move/; this is the value used when you turn it on.',
  },

  // ---- Selling ----
  sellBrokerPct: {
    value: 5, unit: '%', label: 'Seller broker commission', basis: 'convention',
    sourceOrg: null, sourceUrl: null, effectiveDate: null, lastVerified: null,
    notes: 'Typical NYC range is 4% to 6% of sale price, negotiable.',
    inputs: [{ page: 'sell', id: 'broker-pct' }],
  },
  sellAttorneyFee: {
    value: 2500, unit: 'USD', label: 'Seller attorney fee', basis: 'illustrative',
    sourceOrg: null, sourceUrl: null, effectiveDate: null, lastVerified: null,
    notes: 'Roughly $1,500 to $3,000 for a straightforward resale.',
    inputs: [{ page: 'sell', id: 'attorney-fee' }],
  },
  sellTitleMiscFee: {
    value: 1000, unit: 'USD', label: 'Seller title and miscellaneous closing costs', basis: 'illustrative',
    sourceOrg: null, sourceUrl: null, effectiveDate: null, lastVerified: null,
    notes: 'Payoff/satisfaction fee, move-out deposit, filing fees.',
    inputs: [{ page: 'sell', id: 'title-misc-fee' }],
  },
  sellCoopFlipTaxPct: {
    value: 2, unit: '%', label: 'Co-op flip tax (seller)', basis: 'illustrative',
    sourceOrg: null, sourceUrl: null, effectiveDate: null, lastVerified: null,
    notes: 'Set by each building\'s proprietary lease; commonly 1% to 3%, some buildings charge none.',
    inputs: [{ page: 'sell', id: 'flip-tax-pct' }],
  },
  sellCoopTransferFee: {
    value: 500, unit: 'USD', label: 'Co-op transfer / processing fee (seller)', basis: 'illustrative',
    sourceOrg: null, sourceUrl: null, effectiveDate: null, lastVerified: null,
    inputs: [{ page: 'sell', id: 'coop-transfer-fee' }],
  },

  // ---- Rent ----
  rentIncomeMultiplier: {
    value: 40, unit: 'x', label: 'Landlord income requirement (x monthly rent)', basis: 'convention',
    sourceOrg: null, sourceUrl: null, effectiveDate: null, lastVerified: null,
    notes: 'NYC market convention, not a law. Some landlords use 35x or 45x.',
    inputs: [{ page: 'rent', id: 'income-mult' }],
  },
  guarantorIncomeMultiplier: {
    value: 80, unit: 'x', label: 'Guarantor income requirement (x monthly rent)', basis: 'convention',
    sourceOrg: null, sourceUrl: null, effectiveDate: null, lastVerified: null,
    inputs: [{ page: 'rent', id: 'guarantor-mult' }],
  },
  rentDtiPct: {
    value: 35, unit: '%', label: 'Max rent-plus-debt to income (when DTI screening is on)', basis: 'convention',
    sourceOrg: null, sourceUrl: null, effectiveDate: null, lastVerified: null,
    notes: '30 to 35% is typical for buildings that screen on DTI. Off by default.',
    inputs: [{ page: 'rent', id: 'dti-pct' }],
  },
  rentSecurityDepositMonths: {
    value: 1, unit: 'months', label: 'Security deposit', basis: 'law',
    sourceOrg: 'NYC HPD (Housing Stability and Tenant Protection Act of 2019)',
    sourceUrl: 'https://www1.nyc.gov/site/hpd/renters/tenantrights.page',
    effectiveDate: '2019-06-14', lastVerified: null,
    notes: 'HSTPA caps security deposits at one month for most NYC rentals. The default is the cap.',
    inputs: [{ page: 'rent', id: 'sec-deposit' }],
  },
  rentApplicationFee: {
    value: 20, unit: 'USD', label: 'Application fee', basis: 'law',
    sourceOrg: 'NYC HPD (Housing Stability and Tenant Protection Act of 2019)',
    sourceUrl: 'https://www1.nyc.gov/site/hpd/renters/tenantrights.page',
    effectiveDate: '2019-06-14', lastVerified: null,
    notes: 'HSTPA caps background/credit check fees at $20. The default is the cap.',
    inputs: [{ page: 'rent', id: 'app-fee' }],
  },
  rentBuildingFee: {
    value: 0, unit: 'USD', label: 'Co-op/condo board move-in fee (renting in a co-op or condo)', basis: 'law',
    sourceOrg: 'NY Legislature, S.6458 (HSTPA 2019) §10, RPL §238-a',
    sourceUrl: 'https://legislation.nysenate.gov/pdf/bills/2019/S6458',
    effectiveDate: '2019-06-14', lastVerified: '2026-10-03',
    notes: 'RPL §238-a(1)(a) bars a landlord from charging any fee at the start of a tenancy other than the capped background/credit check, so the default is $0. Move-in fees are co-op and condo board charges: enter one only when renting a unit in a co-op or condo building. Buyers pay theirs in /coop/ (coopMoveInDeposit) and /condo/ (building fees).',
    inputs: [{ page: 'rent', id: 'building-fee' }],
  },
  rentUtilitySetup: {
    value: 250, unit: 'USD', label: 'Utility setup', basis: 'illustrative',
    sourceOrg: null, sourceUrl: null, effectiveDate: null, lastVerified: null,
    notes: 'Con Ed deposit, internet install, etc.',
    inputs: [{ page: 'rent', id: 'utility-setup' }],
  },
  rentersInsuranceMo: {
    value: 15, unit: 'USD/mo', label: "Renter's insurance", basis: 'market-survey',
    sourceOrg: 'ValuePenguin', sourceUrl: 'https://www.valuepenguin.com/renters-insurance/new-york',
    effectiveDate: null, lastVerified: null,
    notes: 'NYC average roughly $15 to $25/month.',
    inputs: [{ page: 'rent', id: 'renters-insurance' }],
  },
  rentReserveMonths: {
    value: 2, unit: 'months', label: 'Renter reserve buffer', basis: 'illustrative',
    sourceOrg: null, sourceUrl: null, effectiveDate: null, lastVerified: null,
    notes: 'Months of rent + insurance + debts kept in savings after move-in.',
    inputs: [{ page: 'rent', id: 'reserve-months' }],
  },
});

export type AssumptionId = keyof typeof ASSUMPTIONS;
