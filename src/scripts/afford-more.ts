import { loadSharedProfile, saveSharedProfile } from '../lib/sharedProfile';
import {
  defaultPlanInputs,
  rankLevers,
  gapToTarget,
  type PlanInputs,
  type PropertyType,
  type LeverResult,
} from '../lib/engines/levers';

/* ============================================================
   "How do I afford more?" page script
   ============================================================
   All math lives in ../lib/engines/levers.ts (tested in
   test/levers.test.ts); this file only reads inputs and renders.

   Input precedence on load: URL query (a shared scenario link) >
   this page's own saved inputs (only if the visitor turned on "Save
   inputs") > the shared profile other calculators saved (income,
   debts, accounts; read-only) > the example from the project brief.

   Privacy: nothing is sent anywhere. "Copy scenario link" includes
   only assumptions by default; income, savings, and debts are added
   to the link only if the visitor ticks the box.
   ============================================================ */

const LS_KEY = 'nyc_afford_more_inputs';

interface PageState extends PlanInputs {
  targetPrice: number | null;
}

const $ = (id: string) => document.getElementById(id);
const $in = (id: string) => document.getElementById(id) as HTMLInputElement;
const money = (n: number) => (isFinite(n) ? '$' + Math.round(n).toLocaleString('en-US') : 'more than $20M');
const num = (v: string | null | undefined) => {
  const n = Number(v);
  return v !== null && v !== undefined && v !== '' && isFinite(n) ? n : null;
};

// Brief example: "$145,000, $110,000 saved, $400/month on student loans".
const EXAMPLE = { annualIncome: 145_000, monthlyDebts: 400, cash: 110_000, investments: 0 };

const PERSONAL_PARAMS = { inc: 'annualIncome', debt: 'monthlyDebts', cash: 'cash', inv: 'investments' } as const;
const ASSUMPTION_PARAMS = {
  rate: 'mortgageRate', dp: 'downPaymentPct', charges: 'buildingCharges', dti: 'maxDtiPct',
  res: 'reserveMonths', tax: 'condoPropertyTax', ins: 'condoInsurance', liq: 'investmentsLiquidityPct',
} as const;

function typeFrom(v: unknown): PropertyType {
  return v === 'condo' ? 'condo' : 'coop';
}

function initialState(): { state: PageState; saved: boolean } {
  const params = new URLSearchParams(location.search);
  if ([...params.keys()].length > 0) {
    const s: PageState = { ...defaultPlanInputs(typeFrom(params.get('type'))), ...EXAMPLE, targetPrice: num(params.get('target')) };
    for (const [p, k] of Object.entries({ ...PERSONAL_PARAMS, ...ASSUMPTION_PARAMS })) {
      const v = num(params.get(p));
      if (v !== null) (s as unknown as Record<string, number>)[k] = v;
    }
    return { state: s, saved: false };
  }
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) {
      const d = JSON.parse(raw);
      return { state: { ...defaultPlanInputs(typeFrom(d.propertyType)), ...EXAMPLE, targetPrice: null, ...d }, saved: true };
    }
  } catch { /* storage blocked: fall through */ }
  const shared = loadSharedProfile();
  if (shared) {
    const accts = Array.isArray(shared.accounts) ? (shared.accounts as { balance?: number; liquidity?: number }[]) : [];
    const cash = accts.filter((a) => (a.liquidity ?? 100) >= 100).reduce((s, a) => s + (Number(a.balance) || 0), 0);
    const inv = accts.filter((a) => (a.liquidity ?? 100) < 100).reduce((s, a) => s + (Number(a.balance) || 0), 0);
    return {
      state: {
        ...defaultPlanInputs('coop'),
        annualIncome: Number(shared.annualIncome) || EXAMPLE.annualIncome,
        monthlyDebts: Number(shared.otherDebts) || 0,
        cash: accts.length ? cash : EXAMPLE.cash,
        investments: accts.length ? inv : 0,
        targetPrice: null,
      },
      saved: false,
    };
  }
  return { state: { ...defaultPlanInputs('coop'), ...EXAMPLE, targetPrice: null }, saved: false };
}

let { state, saved } = initialState();

const FIELDS: [string, keyof PageState][] = [
  ['am-income', 'annualIncome'], ['am-debts', 'monthlyDebts'], ['am-cash', 'cash'], ['am-invest', 'investments'],
  ['am-rate', 'mortgageRate'], ['am-dp', 'downPaymentPct'], ['am-charges', 'buildingCharges'], ['am-dti', 'maxDtiPct'],
  ['am-reserves', 'reserveMonths'], ['am-tax', 'condoPropertyTax'], ['am-ins', 'condoInsurance'], ['am-liq', 'investmentsLiquidityPct'],
];

function writeFields() {
  for (const [id, key] of FIELDS) $in(id).value = String(state[key] ?? '');
  $in('am-target').value = state.targetPrice ? String(state.targetPrice) : '';
  (document.querySelector(`input[name="am-type"][value="${state.propertyType}"]`) as HTMLInputElement).checked = true;
  syncTypeLabels();
}

function readFields() {
  for (const [id, key] of FIELDS) {
    const v = num($in(id).value);
    (state as unknown as Record<string, number>)[key] = v === null ? 0 : Math.max(0, v);
  }
  const t = num($in('am-target').value);
  state.targetPrice = t && t > 0 ? t : null;
}

function syncTypeLabels() {
  const coop = state.propertyType === 'coop';
  document.body.classList.toggle('type-coop', coop);
  document.body.classList.toggle('type-condo', !coop);
  $('am-charges-label')!.textContent = coop ? 'Monthly maintenance' : 'Monthly common charges';
  $('am-dti-label')!.textContent = coop ? 'Board DTI limit' : 'Lender DTI limit';
  $('am-type-word')!.textContent = coop ? 'co-op' : 'condo';
}

function headline(r: ReturnType<typeof rankLevers>['base']): string {
  const type = state.propertyType === 'coop' ? 'co-op' : 'condo';
  if (r.maxPrice <= 0) {
    return r.dtiMaxPrice <= 0
      ? `At these assumptions, building charges and debts already use up your ${state.maxDtiPct}% DTI limit, so no loan fits yet.`
      : 'Your cash doesn\'t yet cover the fixed closing costs, so no purchase fits yet.';
  }
  if (r.binding === 'DTI / Income') {
    return `Your savings would cover a <strong>${money(r.cashMax)}</strong> ${type}, but your income supports only <strong>${money(r.dtiMaxPrice)}</strong> at a ${state.maxDtiPct}% DTI limit. Income-side levers move your number; extra savings won't until income catches up.`;
  }
  const what = r.binding === 'Cash / Reserves' && state.propertyType === 'coop'
    ? `your cash, once the board's ${state.reserveMonths}-month reserve requirement is set aside,`
    : 'your cash for the down payment and closing costs';
  return `Your income supports a <strong>${money(r.dtiMaxPrice)}</strong> ${type}, but ${what} supports only <strong>${money(r.cashMax)}</strong>. Cash-side levers move your number; a raise won't until savings catch up.`;
}

function leverRow(r: LeverResult, i: number): string {
  const cls = r.delta > 0 ? 'up' : 'down';
  const sign = r.delta > 0 ? '+' : '−';
  const note = r.lever.note ? `<span class="lever-note">${r.lever.note}</span>` : '';
  return `<tr>
    <td class="rank">${i + 1}</td>
    <td><span class="lever-label">${r.lever.label}</span>${note}</td>
    <td class="num">${money(r.after.maxPrice)}</td>
    <td class="num ${cls}">${sign}${money(Math.abs(r.delta))}</td>
    <td class="why">${r.explanation}</td>
  </tr>`;
}

function render() {
  const { base, results } = rankLevers(state);
  $('am-max')!.textContent = money(base.maxPrice);
  $('am-headline')!.innerHTML = headline(base);
  $('am-dti-max')!.textContent = money(base.dtiMaxPrice);
  $('am-cash-max')!.textContent = money(base.cashMax);
  $('am-monthly')!.textContent = base.maxPrice > 0 ? `${money(base.monthlyHousingCost)}/mo` : '—';
  $('am-total-cash')!.textContent = base.maxPrice > 0 ? money(base.totalCashNeeded) : '—';
  $('am-dti-max')!.parentElement!.classList.toggle('binding', base.binding === 'DTI / Income');
  $('am-cash-max')!.parentElement!.classList.toggle('binding', base.binding !== 'DTI / Income');

  const NOISE = 50;
  const ranked = results.filter((r) => Math.abs(r.delta) >= NOISE);
  const idle = results.filter((r) => Math.abs(r.delta) < NOISE);
  $('am-levers')!.innerHTML = ranked.length
    ? ranked.map(leverRow).join('')
    : '<tr><td colspan="5">None of these levers changes your maximum price at these numbers.</td></tr>';
  $('am-nohelp-count')!.textContent = String(idle.length);
  $('am-nohelp')!.innerHTML = idle.map((r) => `<li><strong>${r.lever.label}.</strong> ${r.explanation}</li>`).join('');
  ($('am-nohelp-wrap') as HTMLElement).hidden = idle.length === 0;

  const card = $('am-gap-card') as HTMLElement;
  if (state.targetPrice) {
    const g = gapToTarget(state, state.targetPrice);
    card.hidden = false;
    $('am-gap-target')!.textContent = money(g.target);
    if (g.reachable) {
      $('am-gap-body')!.innerHTML = `<p>You're already there: your maximum is ${money(base.maxPrice)}.</p>`;
    } else {
      const items: string[] = [];
      const covers = state.propertyType === 'coop'
        ? `the down payment, closing costs, and the board's ${state.reserveMonths}-month reserve requirement`
        : 'the down payment and closing costs';
      if (g.extraCash > 0) items.push(`<li><strong>${money(g.extraCash)} more in cash savings</strong>, to cover ${covers} at that price.</li>`);
      if (g.extraIncome > 0) {
        const alt = g.debtCutEquivalent > 0 ? ` (or eliminate about <strong>${money(g.debtCutEquivalent)}/month</strong> of your debt payments)` : '';
        items.push(`<li><strong>${money(g.extraIncome)} more in annual income</strong>${alt}, to stay under the ${state.maxDtiPct}% DTI limit.</li>`);
      }
      const both = g.extraCash > 0 && g.extraIncome > 0;
      $('am-gap-body')!.innerHTML = `<p>${both ? 'You\'d need both:' : 'You\'d need:'}</p><ul>${items.join('')}</ul>${both ? '<p>These are separate limits, so closing one gap doesn\'t close the other.</p>' : ''}`;
    }
  } else {
    card.hidden = true;
  }
}

function persist() {
  if (!$in('save-toggle-cb').checked) return;
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(state));
    saveSharedProfile({ annualIncome: state.annualIncome, otherDebts: state.monthlyDebts });
  } catch { /* storage blocked */ }
}

function onChange() {
  readFields();
  render();
  persist();
}

function scenarioLink(includePersonal: boolean): string {
  const p = new URLSearchParams();
  p.set('type', state.propertyType);
  for (const [param, key] of Object.entries(ASSUMPTION_PARAMS)) p.set(param, String(state[key]));
  if (state.targetPrice) p.set('target', String(state.targetPrice));
  if (includePersonal) for (const [param, key] of Object.entries(PERSONAL_PARAMS)) p.set(param, String(state[key]));
  return `${location.origin}${location.pathname}?${p.toString()}`;
}

document.addEventListener('DOMContentLoaded', () => {
  writeFields();
  $in('save-toggle-cb').checked = saved;
  render();

  for (const [id] of FIELDS) $in(id).addEventListener('input', onChange);
  $in('am-target').addEventListener('input', onChange);
  document.querySelectorAll<HTMLInputElement>('input[name="am-type"]').forEach((el) =>
    el.addEventListener('change', () => {
      readFields();
      const next = defaultPlanInputs(typeFrom(el.value));
      // Switching type resets the type-specific assumptions to that type's defaults.
      state = { ...state, propertyType: next.propertyType, downPaymentPct: next.downPaymentPct, buildingCharges: next.buildingCharges, maxDtiPct: next.maxDtiPct };
      writeFields();
      render();
      persist();
    }));

  $in('save-toggle-cb').addEventListener('change', (e) => {
    if ((e.target as HTMLInputElement).checked) persist();
    else { try { localStorage.removeItem(LS_KEY); } catch { /* ignore */ } }
  });

  const shareBtn = $('am-share') as HTMLButtonElement;
  shareBtn.addEventListener('click', async () => {
    const url = scenarioLink($in('am-share-personal').checked);
    const label = shareBtn.textContent;
    try {
      await navigator.clipboard.writeText(url);
      shareBtn.textContent = 'Link copied';
    } catch {
      window.prompt('Copy this link:', url);
    }
    setTimeout(() => { shareBtn.textContent = label; }, 2000);
  });
  $('am-print')!.addEventListener('click', () => window.print());
});
