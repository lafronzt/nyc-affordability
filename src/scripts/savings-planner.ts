import { loadSharedProfile, saveSharedProfile } from '../lib/sharedProfile';
import { ASSUMPTIONS } from '../data/assumptions';
import {
  defaultSavingsInputs,
  planSavings,
  monthlyNeededFor,
  cashNeeded,
  type SavingsInputs,
  type SavingsPlan,
  type PropertyType,
} from '../lib/engines/savings';

/* ============================================================
   Savings planner page script
   ============================================================
   Math: ../lib/engines/savings.ts (tested in test/savings.test.ts).
   Same input precedence and privacy rules as /afford-more/: URL query >
   this page's saved inputs (only with "Save inputs" on) > shared profile
   (read-only) > the project brief's example. Savings and income go into
   a shared link only if the visitor opts in.
   ============================================================ */

const LS_KEY = 'nyc_savings_planner_inputs';
const $ = (id: string) => document.getElementById(id);
const $in = (id: string) => document.getElementById(id) as HTMLInputElement;
const money = (n: number) => '$' + Math.round(n).toLocaleString('en-US');
const num = (v: string | null | undefined) => {
  const n = Number(v);
  return v !== null && v !== undefined && v !== '' && isFinite(n) ? n : null;
};
const typeFrom = (v: unknown): PropertyType => (v === 'coop' ? 'coop' : 'condo');

interface PageState extends SavingsInputs { targetDate: string | null }

// Project brief: $145K income, $110K saved, $400/mo student loans. A $450K condo
// is within reach on that income, so the timeline has a real answer.
const EXAMPLE = {
  targetPrice: 450_000, currentSavings: 110_000, monthlyContribution: 1_500, annualIncome: 145_000, monthlyDebts: 400, emergencyFund: 15_000,
  savingsYieldPct: ASSUMPTIONS.savingsYieldPct.value,
};

const FIELDS: [string, keyof SavingsInputs][] = [
  ['sp-price', 'targetPrice'], ['sp-savings', 'currentSavings'], ['sp-monthly', 'monthlyContribution'], ['sp-yield', 'savingsYieldPct'],
  ['sp-income', 'annualIncome'], ['sp-debts', 'monthlyDebts'], ['sp-emergency', 'emergencyFund'], ['sp-raise', 'incomeGrowthPct'],
  ['sp-pricegrowth', 'priceGrowthPct'], ['sp-rate', 'mortgageRate'], ['sp-dp', 'downPaymentPct'], ['sp-charges', 'buildingCharges'],
  ['sp-dti', 'maxDtiPct'], ['sp-reserves', 'reserveMonths'],
];
const PARAM: Record<string, keyof SavingsInputs> = {
  price: 'targetPrice', yield: 'savingsYieldPct', raise: 'incomeGrowthPct', pg: 'priceGrowthPct', rate: 'mortgageRate',
  dp: 'downPaymentPct', charges: 'buildingCharges', dti: 'maxDtiPct', res: 'reserveMonths', ef: 'emergencyFund',
};
const PERSONAL: Record<string, keyof SavingsInputs> = { saved: 'currentSavings', monthly: 'monthlyContribution', inc: 'annualIncome', debt: 'monthlyDebts' };

function initialState(): { state: PageState; saved: boolean } {
  const params = new URLSearchParams(location.search);
  if ([...params.keys()].length) {
    const s: PageState = { ...defaultSavingsInputs(typeFrom(params.get('type'))), ...EXAMPLE, targetDate: params.get('by') };
    for (const [k, f] of Object.entries({ ...PARAM, ...PERSONAL })) {
      const v = num(params.get(k));
      if (v !== null) (s as unknown as Record<string, number>)[f] = v;
    }
    return { state: s, saved: false };
  }
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) {
      const d = JSON.parse(raw);
      return { state: { ...defaultSavingsInputs(typeFrom(d.propertyType)), ...EXAMPLE, targetDate: null, ...d }, saved: true };
    }
  } catch { /* storage blocked */ }
  const shared = loadSharedProfile();
  const base: PageState = { ...defaultSavingsInputs('condo'), ...EXAMPLE, targetDate: null };
  if (shared) {
    const accts = Array.isArray(shared.accounts) ? (shared.accounts as { balance?: number }[]) : [];
    if (Number(shared.annualIncome)) base.annualIncome = Number(shared.annualIncome);
    if (shared.otherDebts !== undefined) base.monthlyDebts = Number(shared.otherDebts) || 0;
    if (accts.length) base.currentSavings = accts.reduce((s, a) => s + (Number(a.balance) || 0), 0);
  }
  return { state: base, saved: false };
}

let { state, saved } = initialState();

function syncType() {
  const coop = state.propertyType === 'coop';
  document.body.classList.toggle('type-coop', coop);
  document.body.classList.toggle('type-condo', !coop);
  $('sp-charges-label')!.textContent = coop ? 'Monthly maintenance' : 'Monthly common charges';
  $('sp-dti-label')!.textContent = coop ? 'Board DTI limit' : 'Lender DTI limit';
  $('sp-bd-type')!.textContent = coop ? 'co-op' : 'condo';
}

function writeFields() {
  for (const [id, k] of FIELDS) $in(id).value = String(state[k] ?? '');
  $in('sp-date').value = state.targetDate ?? '';
  (document.querySelector(`input[name="sp-type"][value="${state.propertyType}"]`) as HTMLInputElement).checked = true;
  syncType();
}

function readFields() {
  for (const [id, k] of FIELDS) {
    const v = num($in(id).value);
    const allowNegative = k === 'priceGrowthPct';
    (state as unknown as Record<string, number>)[k] = v === null ? 0 : allowNegative ? v : Math.max(0, v);
  }
  state.targetDate = $in('sp-date').value || null;
}

// ---- dates ----
const today = new Date();
const monthDate = (m: number) => new Date(today.getFullYear(), today.getMonth() + m, 1);
const fmtMonth = (m: number) => monthDate(m).toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
function monthsUntil(ym: string): number {
  const [y, mo] = ym.split('-').map(Number);
  return (y - today.getFullYear()) * 12 + (mo - 1 - today.getMonth());
}
const duration = (m: number) => {
  const y = Math.floor(m / 12), r = m % 12;
  if (m === 0) return 'now';
  return [y ? `${y} year${y > 1 ? 's' : ''}` : '', r ? `${r} month${r > 1 ? 's' : ''}` : ''].filter(Boolean).join(', ');
};

/** The other type at its standard defaults, keeping the visitor's money and growth inputs. */
function asType(type: PropertyType): SavingsInputs {
  if (type === state.propertyType) return state;
  const d = defaultSavingsInputs(type);
  return { ...state, propertyType: type, downPaymentPct: d.downPaymentPct, buildingCharges: d.buildingCharges, maxDtiPct: d.maxDtiPct, reserveMonths: d.reserveMonths, mortgageRate: state.mortgageRate };
}

function whenText(plan: SavingsPlan): string {
  if (plan.readyMonth === 0) return 'Now';
  if (plan.readyMonth !== null) return fmtMonth(plan.readyMonth);
  return plan.incomeReadyMonth === null ? 'Out of reach on current income' : 'Not within 30 years';
}

function blockerText(p: SavingsInputs, plan: SavingsPlan): string {
  const type = p.propertyType === 'coop' ? 'co-op' : 'condo';
  if (plan.readyMonth !== null) {
    const wait = plan.readyMonth === 0 ? 'You already have the cash and the income for it.' : `That's <strong>${duration(plan.readyMonth)}</strong> from now.`;
    const by = plan.cashReadyMonth !== null && plan.incomeReadyMonth !== null && plan.incomeReadyMonth > plan.cashReadyMonth
      ? ` Your savings get there first (${fmtMonth(plan.cashReadyMonth)}); you're waiting on income to clear the ${p.maxDtiPct}% DTI limit.`
      : '';
    return `${wait}${by}`;
  }
  if (plan.incomeReadyMonth === null) {
    return `At ${money(p.annualIncome)}, your income doesn't clear the ${p.maxDtiPct}% DTI limit for a ${money(p.targetPrice)} ${type} (it takes about <strong>${money(plan.needNow.incomeNeeded)}</strong>)${plan.cashReadyMonth !== null ? `, even though your savings would get there by ${fmtMonth(plan.cashReadyMonth)}` : ''}. Try a lower price, add expected raises under Assumptions, or see <a href="/afford-more/">what moves your number</a>.`;
  }
  return `At ${money(p.monthlyContribution)}/month your savings don't reach the ${money(plan.needNow.total)} target within 30 years. Raise the monthly amount or lower the price.`;
}

function renderCompare(plans: Record<PropertyType, SavingsPlan>) {
  const html = (['coop', 'condo'] as PropertyType[]).map((t) => {
    const p = asType(t);
    const plan = plans[t];
    const n = plan.needNow;
    const extra = t === 'coop'
      ? `Includes <strong>${money(n.reserves)}</strong> of board reserves (${p.reserveMonths} months of mortgage + maintenance).`
      : `Includes <strong>${money(n.mortgageRecordingTax)}</strong> of mortgage recording tax; no board reserves.`;
    const swatch = t === 'coop' ? '#eb6834' : '#1baf7a';
    return `<div class="cmp">
      <h3><span class="key" style="background:${swatch}"></span>${t === 'coop' ? 'Co-op' : 'Condo'}</h3>
      <div class="when">${whenText(plan)}</div>
      <p>Cash needed: <strong>${money(n.total)}</strong>. ${extra}</p>
      <p>Income needed: <strong>${money(n.incomeNeeded)}</strong> (${p.maxDtiPct}% DTI).</p>
    </div>`;
  }).join('');
  $('sp-compare')!.innerHTML = html;
}

function renderBreakdown(p: SavingsInputs) {
  const n = cashNeeded(p);
  const rows: [string, number, string?][] = [
    [`Down payment (${p.downPaymentPct}%)`, n.downPayment],
    ['Closing costs', n.closingCosts, p.propertyType === 'coop' ? 'Attorneys, board/application fees, move-in deposit, loan origination' : 'Attorney, lender, appraisal, recording, building fees, title insurance'],
  ];
  if (n.mansionTax > 0) rows.push(['Mansion tax', n.mansionTax, 'NYS tax on purchases of $1M or more, on the whole price']);
  if (n.mortgageRecordingTax > 0) rows.push(['Mortgage recording tax', n.mortgageRecordingTax, 'On the loan amount; condos only']);
  if (n.reserves > 0) rows.push([`Board reserves (${p.reserveMonths} months)`, n.reserves, 'Must still be in your accounts after closing']);
  if (n.emergencyFund > 0) rows.push(['Your emergency fund', n.emergencyFund]);
  $('sp-breakdown')!.innerHTML = rows.map(([l, v, sub]) =>
    `<tr><th scope="row">${l}${sub ? `<span class="sub">${sub}</span>` : ''}</th><td class="num">${money(v)}</td></tr>`).join('')
    + `<tr class="total"><th scope="row">Total cash needed</th><td class="num">${money(n.total)}</td></tr>`;
}

// ---- chart ----
const NS = 'http://www.w3.org/2000/svg';
const SERIES = [
  { key: 'savings', label: 'Your savings', color: '#2a78d6' },
  { key: 'coop', label: 'Cash needed: co-op', color: '#eb6834' },
  { key: 'condo', label: 'Cash needed: condo', color: '#1baf7a' },
] as const;

function niceStep(max: number) {
  const raw = max / 4;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  return [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? raw;
}
const short$ = (v: number) => (v >= 1e6 ? `$${(v / 1e6).toFixed(v % 1e6 === 0 ? 0 : 1)}M` : `$${Math.round(v / 1000)}K`);

function renderChart(plans: Record<PropertyType, SavingsPlan>, selected: SavingsPlan) {
  const svg = $('sp-chart') as unknown as SVGSVGElement;
  const wrap = $('sp-chart-wrap')!;
  const W = wrap.clientWidth || 800;
  const H = svg.clientHeight || 300;
  const pad = { l: 56, r: 92, t: 12, b: 26 };
  const ready = [plans.coop.readyMonth, plans.condo.readyMonth, plans.coop.cashReadyMonth, plans.condo.cashReadyMonth].filter((m): m is number => m !== null);
  const months = Math.min(360, Math.max(24, Math.ceil(((ready.length ? Math.max(...ready) : 60) + 6) / 12) * 12));
  const pts = (pl: SavingsPlan) => pl.points.slice(0, months + 1);
  const savings = pts(selected).map((p) => p.balance);
  const coopReq = pts(plans.coop).map((p) => p.required);
  const condoReq = pts(plans.condo).map((p) => p.required);
  const yMax = Math.max(...savings, ...coopReq, ...condoReq) * 1.05;
  const step = niceStep(yMax);
  const top = Math.ceil(yMax / step) * step;
  const x = (m: number) => pad.l + (m / months) * (W - pad.l - pad.r);
  const y = (v: number) => pad.t + (1 - v / top) * (H - pad.t - pad.b);
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  svg.innerHTML = '';
  const el = (tag: string, attrs: Record<string, string | number>, text?: string) => {
    const e = document.createElementNS(NS, tag);
    for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
    if (text !== undefined) e.textContent = text;
    svg.appendChild(e);
    return e;
  };
  for (let v = 0; v <= top + 1; v += step) {
    el('line', { class: 'grid', x1: pad.l, x2: W - pad.r, y1: y(v), y2: y(v) });
    el('text', { class: 'axis-label', x: pad.l - 8, y: y(v) + 4, 'text-anchor': 'end' }, short$(v));
  }
  const yearStep = months > 120 ? 5 : months > 48 ? 2 : 1;
  for (let m = 0; m <= months; m += 12 * yearStep) {
    // Ticks fall on today's month each year, so label the month too ("Oct 2027"), not just the year.
    el('text', { class: 'axis-label', x: x(m), y: H - 6, 'text-anchor': m === 0 ? 'start' : m === months ? 'end' : 'middle' }, fmtMonth(m));
  }
  const path = (vals: number[]) => vals.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join('');
  el('path', { class: 'series s-coop', d: path(coopReq) });
  el('path', { class: 'series s-condo', d: path(condoReq) });
  el('path', { class: 'series s-savings', d: path(savings) });

  // Direct labels at the right end of each need line, nudged apart if they collide.
  const ends = [
    { v: coopReq[months], text: 'Co-op' },
    { v: condoReq[months], text: 'Condo' },
    { v: savings[months], text: 'Savings' },
  ].sort((a, b) => b.v - a.v);
  let lastY = -Infinity;
  for (const e of ends) {
    let ly = y(e.v) + 4;
    if (ly - lastY < 14) ly = lastY + 14;
    lastY = ly;
    el('text', { class: 'direct-label', x: W - pad.r + 8, y: ly }, e.text);
  }
  // Mark where savings cross each cash target (if within the horizon).
  for (const [t, color] of [['coop', '#eb6834'], ['condo', '#1baf7a']] as const) {
    const m = plans[t].cashReadyMonth;
    if (m !== null && m <= months) el('circle', { class: 'dot', cx: x(m), cy: y(pts(plans[t])[m].required), r: 5, fill: color });
  }

  // Hover / keyboard crosshair.
  const cross = el('line', { class: 'crosshair', y1: pad.t, y2: H - pad.b, x1: 0, x2: 0, visibility: 'hidden' });
  const tip = $('sp-tooltip')!;
  const show = (m: number) => {
    m = Math.max(0, Math.min(months, m));
    cross.setAttribute('x1', String(x(m)));
    cross.setAttribute('x2', String(x(m)));
    cross.setAttribute('visibility', 'visible');
    const row = (s: (typeof SERIES)[number], v: number) => `<div class="tt-row"><span><i class="sw" style="background:${s.color}"></i>${s.label}</span><b>${money(v)}</b></div>`;
    tip.innerHTML = `<div class="tt-date">${fmtMonth(m)}</div>${row(SERIES[0], savings[m])}${row(SERIES[1], coopReq[m])}${row(SERIES[2], condoReq[m])}`;
    tip.hidden = false;
    const left = x(m) + 12 + 190 > W ? x(m) - 12 - 190 : x(m) + 12;
    tip.style.left = `${Math.max(0, left)}px`;
    tip.style.top = `${pad.t}px`;
  };
  const hide = () => { tip.hidden = true; cross.setAttribute('visibility', 'hidden'); };
  const toMonth = (clientX: number) => {
    const r = svg.getBoundingClientRect();
    return Math.round(((clientX - r.left) * (W / r.width) - pad.l) / (W - pad.l - pad.r) * months);
  };
  svg.onpointermove = (e) => show(toMonth(e.clientX));
  svg.onpointerleave = hide;
  svg.setAttribute('tabindex', '0');
  let kbMonth = 0;
  svg.onkeydown = (e) => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      kbMonth = Math.max(0, Math.min(months, kbMonth + (e.key === 'ArrowRight' ? 1 : -1) * (e.shiftKey ? 12 : 1)));
      show(kbMonth);
      e.preventDefault();
    }
  };
  svg.onblur = hide;

  // Text alternative + table view (yearly rows).
  const crossing = (t: PropertyType) => plans[t].cashReadyMonth === null ? 'not within 30 years' : fmtMonth(plans[t].cashReadyMonth!);
  $('sp-chart-desc')!.textContent = `Your savings grow from ${money(savings[0])} to ${money(savings[months])} by ${fmtMonth(months)}. They cover the condo cash target in ${crossing('condo')} and the co-op target in ${crossing('coop')}. Use the arrow keys on the chart to step through months.`;
  const rows: string[] = [];
  for (let m = 0; m <= months; m += 12) rows.push(`<tr><td>${fmtMonth(m)}</td><td class="num">${money(savings[m])}</td><td class="num">${money(coopReq[m])}</td><td class="num">${money(condoReq[m])}</td></tr>`);
  $('sp-table')!.innerHTML = rows.join('');
}

function render() {
  const plan = planSavings(state);
  const plans = { coop: planSavings(asType('coop')), condo: planSavings(asType('condo')) };
  plans[state.propertyType] = plan;
  const when = whenText(plan);
  $('sp-when')!.textContent = when;
  $('sp-when')!.classList.toggle('long', when.length > 12);
  $('sp-headline')!.innerHTML = blockerText(state, plan);
  $('sp-need')!.textContent = money(plan.needNow.total);
  $('sp-gap')!.textContent = plan.gapNow > 0 ? money(plan.gapNow) : 'None';
  $('sp-incneed')!.textContent = money(plan.needNow.incomeNeeded);
  // What's still in your accounts right after closing: anything beyond the target, plus the
  // board reserves and emergency fund, which are counted in the target but never spent.
  $('sp-left')!.textContent = plan.leftOverAtReady === null || !plan.needAtReady ? '—'
    : money(plan.leftOverAtReady + plan.needAtReady.reserves + plan.needAtReady.emergencyFund);

  const line = $('sp-target-line')!;
  if (state.targetDate) {
    const m = monthsUntil(state.targetDate);
    if (m <= 0) {
      line.innerHTML = 'Pick a month in the future to see what it takes to buy by then.';
    } else {
      const need = monthlyNeededFor(state, m);
      const incomeOk = plan.points[Math.min(m, plan.points.length - 1)].income >= plan.points[Math.min(m, plan.points.length - 1)].incomeNeeded;
      line.innerHTML = (need === 0
        ? `You'll have the cash by ${fmtMonth(m)} even without adding more.`
        : `To have the cash by <strong>${fmtMonth(m)}</strong>, save <strong>${money(need)}/month</strong> (you're saving ${money(state.monthlyContribution)}).`)
        + (incomeOk ? '' : ` Income is still the blocker at that date: you'd need about ${money(plan.points[Math.min(m, plan.points.length - 1)].incomeNeeded)}.`);
    }
    line.hidden = false;
  } else {
    line.hidden = true;
  }
  renderCompare(plans);
  renderBreakdown(state);
  renderChart(plans, plan);
}

function persist() {
  if (!$in('save-toggle-cb').checked) return;
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(state));
    saveSharedProfile({ annualIncome: state.annualIncome, otherDebts: state.monthlyDebts });
  } catch { /* storage blocked */ }
}

function scenarioLink(personal: boolean) {
  const p = new URLSearchParams({ type: state.propertyType });
  for (const [k, f] of Object.entries(PARAM)) p.set(k, String(state[f]));
  if (state.targetDate) p.set('by', state.targetDate);
  if (personal) for (const [k, f] of Object.entries(PERSONAL)) p.set(k, String(state[f]));
  return `${location.origin}${location.pathname}?${p}`;
}

document.addEventListener('DOMContentLoaded', () => {
  writeFields();
  $in('save-toggle-cb').checked = saved;
  render();
  const onChange = () => { readFields(); render(); persist(); };
  for (const [id] of FIELDS) $in(id).addEventListener('input', onChange);
  $in('sp-date').addEventListener('input', onChange);
  document.querySelectorAll<HTMLInputElement>('input[name="sp-type"]').forEach((el) => el.addEventListener('change', () => {
    readFields();
    const d = defaultSavingsInputs(typeFrom(el.value));
    state = { ...state, propertyType: d.propertyType, downPaymentPct: d.downPaymentPct, buildingCharges: d.buildingCharges, maxDtiPct: d.maxDtiPct };
    writeFields();
    render();
    persist();
  }));
  $in('save-toggle-cb').addEventListener('change', (e) => {
    if ((e.target as HTMLInputElement).checked) persist();
    else { try { localStorage.removeItem(LS_KEY); } catch { /* ignore */ } }
  });
  const btn = $('sp-share') as HTMLButtonElement;
  btn.addEventListener('click', async () => {
    const url = scenarioLink($in('sp-share-personal').checked);
    const label = btn.textContent;
    try { await navigator.clipboard.writeText(url); btn.textContent = 'Link copied'; } catch { window.prompt('Copy this link:', url); }
    setTimeout(() => { btn.textContent = label; }, 2000);
  });
  $('sp-print')!.addEventListener('click', () => window.print());
  let t: number | undefined;
  window.addEventListener('resize', () => { clearTimeout(t); t = window.setTimeout(render, 150); });
});
