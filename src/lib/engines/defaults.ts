import { ASSUMPTIONS as A } from '../../data/assumptions.ts';
import type { CoopInputs } from './coop.ts';
import type { CondoInputs } from './condo.ts';
import type { RentInputs } from './rent.ts';

/* ============================================================
   Engine inputs built from the sourced defaults
   ============================================================
   Pages that don't expose every calculator field (the build-time pages,
   /compare/, /reality-check/) start from these, so a hidden field always
   has the same value as the corresponding calculator's <input> default.
   test/defaultsParity.test.ts keeps those <input> defaults in sync with
   src/data/assumptions.ts.
   ============================================================ */

export function coopInputsFromDefaults(overrides: Partial<CoopInputs> = {}): CoopInputs {
  return {
    accounts: [],
    annualIncome: 0,
    otherDebts: 0,
    mortgageRate: A.mortgageRatePct.value,
    loanTerm: A.loanTermYears.value,
    dpPct: A.coopDownPaymentPct.value,
    reserveMo: A.coopReserveMonths.value,
    maxDTIPct: A.coopMaxDtiPct.value,
    maint: A.coopMaintenanceMo.value,
    fcAtty: A.coopAttorneyFee.value,
    fcBankAtty: A.coopBankAttorneyFee.value,
    fcCoop: A.coopBoardFee.value,
    fcMoveIn: A.coopMoveInDeposit.value,
    fcOther: A.coopOtherFixedFees.value,
    varPct: A.coopVariableClosingPct.value,
    targetOverride: null,
    ...overrides,
  };
}

export function condoInputsFromDefaults(overrides: Partial<CondoInputs> = {}): CondoInputs {
  return {
    accounts: [],
    annualIncome: 0,
    otherDebts: 0,
    mortgageRate: A.mortgageRatePct.value,
    loanTerm: A.loanTermYears.value,
    dpPct: A.condoDownPaymentPct.value,
    reserveMo: A.condoReserveMonths.value,
    maxDtiPct: A.condoMaxDtiPct.value,
    commonCharges: A.condoCommonChargesMo.value,
    propTaxes: A.condoPropertyTaxMo.value,
    hoInsurance: A.condoInsuranceMo.value,
    fcAtty: A.condoAttorneyFee.value,
    fcLender: A.condoLenderFees.value,
    fcAppraisal: A.condoAppraisalFee.value,
    fcRecording: A.condoRecordingFees.value,
    fcBuilding: A.condoBuildingFees.value,
    wcMonths: A.condoWorkingCapitalMonths.value,
    titlePricePct: A.condoOwnerTitlePct.value,
    titleLoanPct: A.condoLenderTitlePct.value,
    targetOverride: null,
    reservesEnabled: false,
    workingCapEnabled: false,
    ...overrides,
  };
}

export function rentInputsFromDefaults(overrides: Partial<RentInputs> = {}): RentInputs {
  return {
    accounts: [],
    annualIncome: 0,
    otherDebts: 0,
    incomeMult: A.rentIncomeMultiplier.value,
    dtiEnabled: false,
    dtiPct: A.rentDtiPct.value,
    guarantorEnabled: false,
    guarantorMult: A.guarantorIncomeMultiplier.value,
    secDepositMonths: A.rentSecurityDepositMonths.value,
    appFee: A.rentApplicationFee.value,
    buildingFee: A.rentBuildingFee.value,
    utilitySetup: A.rentUtilitySetup.value,
    petFee: 0,
    // Under the FARE Act, a landlord's broker fee can't be passed to the
    // tenant, so the default scenario has no broker fee. The /rent/ page
    // keeps 15% / 1 month / $3,000 as the starting values for the
    // tenant-hired broker options.
    brokerType: 'none',
    brokerFeePct: 15,
    brokerFeeMonths: 1,
    brokerFlat: 3000,
    rentersInsurance: A.rentersInsuranceMo.value,
    reserveMonths: A.rentReserveMonths.value,
    ...overrides,
  };
}

/** Fresh copies of the editable assumption sets /compare/ and /reality-check/
    start from (and then overlay with whatever the calculators saved locally). */
export function defaultSharedAssumptions() {
  return {
    rent: {
      incomeMult: A.rentIncomeMultiplier.value,
      rentersInsurance: A.rentersInsuranceMo.value,
      reserveMonths: A.rentReserveMonths.value,
    },
    coop: {
      mortgageRate: A.mortgageRatePct.value,
      dpPct: A.coopDownPaymentPct.value,
      maint: A.coopMaintenanceMo.value,
      maxDTIPct: A.coopMaxDtiPct.value,
      reserveMo: A.coopReserveMonths.value,
    },
    condo: {
      mortgageRate: A.mortgageRatePct.value,
      dpPct: A.condoDownPaymentPct.value,
      commonCharges: A.condoCommonChargesMo.value,
      propTaxes: A.condoPropertyTaxMo.value,
      hoInsurance: A.condoInsuranceMo.value,
      maxDtiPct: A.condoMaxDtiPct.value,
    },
  };
}
