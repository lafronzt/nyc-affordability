import {
  renterMoveCost,
  buyerMoveCost,
  defaultRenterMoveInputs,
  defaultBuyerMoveInputs,
  type MoveCost,
  type MoveMode,
  type LineKind,
} from '../lib/engines/moveCost';
import { ASSUMPTIONS } from '../data/assumptions';

/* ============================================================
   Cost to move page script
   ============================================================
   Math: ../lib/engines/moveCost.ts (tested in test/moveCost.test.ts).
   Input precedence: URL query > this page's saved inputs (only with
   "Save inputs" on) > the example below. No balances, income, or debts
   are asked for, so the share link carries the whole scenario.
   ============================================================ */

const LS_KEY = 'nyc_cost_to_move_inputs';
const $ = (id: string) => document.getElementById(id);
const $in = (id: string) => document.getElementById(id) as HTMLInputElement;
const money = (n: number) => '$' + Math.round(n).toLocaleString('en-US');
const num = (v: string | null | undefined) => {
  const n = Number(v);
  return v !== null && v !== undefined && v !== '' && isFinite(n) ? n : null;
};
const modeFrom = (v: unknown): MoveMode => (v === 'coop' || v === 'condo' ? v : 'rent');
type BrokerType = 'none' | 'pct_annual' | 'months' | 'flat';
const brokerFrom = (v: unknown): BrokerType => (v === 'pct_annual' || v === 'months' || v === 'flat' ? v : 'none');

const renter = defaultRenterMoveInputs();
const coop = defaultBuyerMoveInputs('coop');
const condo = defaultBuyerMoveInputs('condo');

interface State {
  mode: MoveMode;
  rent: number; brokerType: BrokerType; brokerFeePct: number; brokerFeeMonths: number; brokerFlat: number;
  guarantorOn: boolean; guarantorFeePct: number; petFee: number; buildingFee: number;
  price: number; downPaymentPct: number; buildingCharges: number; reserveMonths: number; mortgageRate: number;
  movers: number; supplies: number; overlapDays: number; currentMonthlyHousing: number; leaseBreakFee: number; furnishing: number; utilitySetup: number;
}

// A one-bedroom-ish example: $3,500/month rent, or a $600,000 purchase.
const DEFAULTS: State = {
  mode: 'rent',
  rent: 3_500, brokerType: 'none', brokerFeePct: renter.brokerFeePct, brokerFeeMonths: renter.brokerFeeMonths, brokerFlat: renter.brokerFlat,
  guarantorOn: false, guarantorFeePct: ASSUMPTIONS.guarantorCompanyFeePct.value, petFee: 0, buildingFee: renter.buildingFee,
  price: 600_000, downPaymentPct: coop.downPaymentPct, buildingCharges: coop.buildingCharges, reserveMonths: coop.reserveMonths, mortgageRate: coop.mortgageRate,
  movers: renter.movers, supplies: renter.supplies, overlapDays: 0, currentMonthlyHousing: 0, leaseBreakFee: 0, furnishing: 0, utilitySetup: renter.utilitySetup,
};

const NUM_FIELDS: [string, keyof State, string][] = [
  ['cm-rent', 'rent', 'rent'], ['cm-broker-pct', 'brokerFeePct', 'bpct'], ['cm-broker-months', 'brokerFeeMonths', 'bmo'], ['cm-broker-flat', 'brokerFlat', 'bflat'],
  ['cm-guarantor', 'guarantorFeePct', 'gfee'], ['cm-pet', 'petFee', 'pet'], ['cm-building', 'buildingFee', 'bldg'],
  ['cm-price', 'price', 'price'], ['cm-dp', 'downPaymentPct', 'dp'], ['cm-charges', 'buildingCharges', 'charges'], ['cm-reserves', 'reserveMonths', 'res'], ['cm-rate', 'mortgageRate', 'rate'],
  ['cm-movers', 'movers', 'movers'], ['cm-supplies', 'supplies', 'sup'], ['cm-overlap', 'overlapDays', 'overlap'], ['cm-current', 'currentMonthlyHousing', 'now'],
  ['cm-leasebreak', 'leaseBreakFee', 'break'], ['cm-furnishing', 'furnishing', 'furn'], ['cm-utilities', 'utilitySetup', 'util'],
];

function initialState(): { state: State; saved: boolean } {
  const params = new URLSearchParams(location.search);
  if ([...params.keys()].length) {
    const s: State = { ...DEFAULTS, mode: modeFrom(params.get('mode')), brokerType: brokerFrom(params.get('broker')), guarantorOn: params.get('g') === '1' };
    if (s.mode !== 'rent') Object.assign(s, typeDefaults(s.mode));
    for (const [, k, p] of NUM_FIELDS) {
      const v = num(params.get(p));
      if (v !== null) (s as unknown as Record<string, number>)[k] = v;
    }
    return { state: s, saved: false };
  }
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) return { state: { ...DEFAULTS, ...JSON.parse(raw) }, saved: true };
  } catch { /* storage blocked */ }
  return { state: { ...DEFAULTS }, saved: false };
}

function typeDefaults(mode: MoveMode): Partial<State> {
  if (mode === 'rent') return {};
  const d = mode === 'coop' ? coop : condo;
  return { downPaymentPct: d.downPaymentPct, buildingCharges: d.buildingCharges };
}

let { state, saved } = initialState();

function sync() {
  for (const m of ['rent', 'coop', 'condo']) document.body.classList.toggle(`mode-${m}`, state.mode === m);
  $('cm-charges-label')!.textContent = state.mode === 'coop' ? 'Monthly maintenance' : 'Monthly common charges';
  $('cm-broker-pct-field')!.hidden = state.brokerType !== 'pct_annual';
  $('cm-broker-months-field')!.hidden = state.brokerType !== 'months';
  $('cm-broker-flat-field')!.hidden = state.brokerType !== 'flat';
  $in('cm-guarantor').disabled = !state.guarantorOn;
}

function writeFields() {
  for (const [id, k] of NUM_FIELDS) $in(id).value = String(state[k] ?? '');
  (document.querySelector(`input[name="cm-mode"][value="${state.mode}"]`) as HTMLInputElement).checked = true;
  ($('cm-broker-type') as HTMLSelectElement).value = state.brokerType;
  $in('cm-guarantor-on').checked = state.guarantorOn;
  sync();
}

function readFields() {
  for (const [id, k] of NUM_FIELDS) {
    const v = num($in(id).value);
    (state as unknown as Record<string, number>)[k] = v === null ? 0 : Math.max(0, v);
  }
  state.brokerType = brokerFrom(($('cm-broker-type') as HTMLSelectElement).value);
  state.guarantorOn = $in('cm-guarantor-on').checked;
}

function compute(): MoveCost {
  const moving = {
    movers: state.movers, supplies: state.supplies, overlapDays: state.overlapDays, currentMonthlyHousing: state.currentMonthlyHousing,
    leaseBreakFee: state.leaseBreakFee, furnishing: state.furnishing, utilitySetup: state.utilitySetup,
  };
  if (state.mode === 'rent') {
    return renterMoveCost(defaultRenterMoveInputs({
      ...moving, rent: state.rent, brokerType: state.brokerType, brokerFeePct: state.brokerFeePct, brokerFeeMonths: state.brokerFeeMonths,
      brokerFlat: state.brokerFlat, guarantorFeePct: state.guarantorOn ? state.guarantorFeePct : 0, petFee: state.petFee, buildingFee: state.buildingFee,
    }));
  }
  return buyerMoveCost(defaultBuyerMoveInputs(state.mode, {
    ...moving, price: state.price, downPaymentPct: state.downPaymentPct, buildingCharges: state.buildingCharges,
    reserveMonths: state.reserveMonths, mortgageRate: state.mortgageRate,
  }));
}

const KINDS: { kind: LineKind; label: string; tag: string }[] = [
  { kind: 'equity', label: 'Becomes equity', tag: 'equity' },
  { kind: 'spent', label: 'Spent', tag: 'spent' },
  { kind: 'refundable', label: 'Comes back later', tag: 'back later' },
  { kind: 'held', label: 'Stays in your account', tag: 'stays in account' },
];

function render() {
  const c = compute();
  const amount = (k: LineKind) => (k === 'spent' ? c.spent : k === 'equity' ? c.equity : k === 'refundable' ? c.refundable : c.held);
  $('cm-total')!.textContent = money(c.cashNeeded);
  const parts = KINDS.filter((k) => amount(k.kind) > 0).map((k) => {
    const v = amount(k.kind);
    return k.kind === 'spent' ? `<strong>${money(v)}</strong> is spent for good`
      : k.kind === 'equity' ? `${money(v)} becomes your equity`
        : k.kind === 'refundable' ? `${money(v)} should come back to you later`
          : `${money(v)} just has to stay in your account for the board`;
  });
  const last = parts.pop();
  $('cm-headline')!.innerHTML = c.cashNeeded === 0 ? 'Enter a rent or price to see the cash it takes.'
    : `Of that, ${parts.length ? parts.join(', ') + ', and ' : ''}${last}.`;
  $('cm-stack')!.innerHTML = c.cashNeeded > 0 ? KINDS.filter((k) => amount(k.kind) > 0)
    .map((k) => `<span class="k-${k.kind}" style="width:${(amount(k.kind) / c.cashNeeded * 100).toFixed(2)}%" title="${k.label}: ${money(amount(k.kind))}"></span>`).join('') : '';
  $('cm-legend')!.innerHTML = KINDS.filter((k) => amount(k.kind) > 0)
    .map((k) => `<li><i class="k-${k.kind}"></i>${k.label}<b>${money(amount(k.kind))}</b></li>`).join('');
  $('cm-housing')!.textContent = money(c.housing);
  $('cm-moving')!.textContent = money(c.moving);

  const row = (l: MoveCost['lines'][number]) => {
    const k = KINDS.find((x) => x.kind === l.kind)!;
    return `<tr><th scope="row">${l.label}<span class="tag tag-${l.kind}">${k.tag}</span>${l.note ? `<span class="sub">${l.note}</span>` : ''}</th><td class="num">${money(l.amount)}</td></tr>`;
  };
  const group = (g: 'housing' | 'moving', title: string) => {
    const ls = c.lines.filter((l) => l.group === g);
    return ls.length ? `<tr class="group"><th scope="rowgroup" colspan="2">${title}</th></tr>${ls.map(row).join('')}` : '';
  };
  $('cm-lines')!.innerHTML = group('housing', state.mode === 'rent' ? 'Signing the lease' : 'Closing')
    + group('moving', 'The move')
    + `<tr class="total"><th scope="row">Cash to have on hand</th><td class="num">${money(c.cashNeeded)}</td></tr>`;
}

function persist() {
  if (!$in('save-toggle-cb').checked) return;
  try { localStorage.setItem(LS_KEY, JSON.stringify(state)); } catch { /* storage blocked */ }
}

function scenarioLink() {
  const p = new URLSearchParams({ mode: state.mode, broker: state.brokerType, g: state.guarantorOn ? '1' : '0' });
  for (const [, k, key] of NUM_FIELDS) p.set(key, String(state[k]));
  return `${location.origin}${location.pathname}?${p}`;
}

document.addEventListener('DOMContentLoaded', () => {
  writeFields();
  $in('save-toggle-cb').checked = saved;
  render();
  const onChange = () => { readFields(); sync(); render(); persist(); };
  for (const [id] of NUM_FIELDS) $in(id).addEventListener('input', onChange);
  $('cm-broker-type')!.addEventListener('change', onChange);
  $in('cm-guarantor-on').addEventListener('change', onChange);
  document.querySelectorAll<HTMLInputElement>('input[name="cm-mode"]').forEach((el) => el.addEventListener('change', () => {
    readFields();
    state = { ...state, mode: modeFrom(el.value), ...typeDefaults(modeFrom(el.value)) };
    writeFields();
    render();
    persist();
  }));
  $in('save-toggle-cb').addEventListener('change', (e) => {
    if ((e.target as HTMLInputElement).checked) persist();
    else { try { localStorage.removeItem(LS_KEY); } catch { /* ignore */ } }
  });
  const btn = $('cm-share') as HTMLButtonElement;
  btn.addEventListener('click', async () => {
    const url = scenarioLink();
    const label = btn.textContent;
    try { await navigator.clipboard.writeText(url); btn.textContent = 'Link copied'; } catch { window.prompt('Copy this link:', url); }
    setTimeout(() => { btn.textContent = label; }, 2000);
  });
  $('cm-print')!.addEventListener('click', () => window.print());
});
