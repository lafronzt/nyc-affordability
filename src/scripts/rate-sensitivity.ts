import { loadSharedProfile, saveSharedProfile } from '../lib/sharedProfile';
import { defaultPlanInputs, type PlanInputs, type PropertyType } from '../lib/engines/levers';
import {
  sweep,
  pointAt,
  rateRange,
  chargesRange,
  impactPerStep,
  chargesInRatePoints,
  highestReaching,
  type SweepVariable,
  type SweepPoint,
} from '../lib/engines/sensitivity';

/* ============================================================
   Rate & maintenance sensitivity page script
   ============================================================
   Math: ../lib/engines/sensitivity.ts (tested in
   test/sensitivity.test.ts), which reruns the shared co-op/condo engine.
   Same input precedence and privacy rules as /afford-more/: URL query >
   this page's saved inputs (only with "Save inputs" on) > shared profile
   (read-only) > the project brief's example. Income, savings, and debts
   go into a share link only if the visitor ticks the box.
   ============================================================ */

const LS_KEY = 'nyc_rate_sensitivity_inputs';

interface PageState extends PlanInputs { targetPrice: number | null; mode: SweepVariable }

const $ = (id: string) => document.getElementById(id);
const $in = (id: string) => document.getElementById(id) as HTMLInputElement;
const money = (n: number) => (isFinite(n) ? '$' + Math.round(n).toLocaleString('en-US') : 'more than $20M');
const signed = (n: number) => (n < 0 ? '−' : '+') + money(Math.abs(n));
const num = (v: string | null | undefined) => {
  const n = Number(v);
  return v !== null && v !== undefined && v !== '' && isFinite(n) ? n : null;
};
const typeFrom = (v: unknown): PropertyType => (v === 'condo' ? 'condo' : 'coop');
const modeFrom = (v: unknown): SweepVariable => (v === 'charges' ? 'charges' : 'rate');
const pct = (r: number) => `${Number(r.toFixed(2))}%`;

// Project brief: $145,000 income, $110,000 saved, $400/month student loans.
const EXAMPLE = { annualIncome: 145_000, monthlyDebts: 400, cash: 110_000, investments: 0 };

const PERSONAL_PARAMS = { inc: 'annualIncome', debt: 'monthlyDebts', cash: 'cash', inv: 'investments' } as const;
const ASSUMPTION_PARAMS = {
  rate: 'mortgageRate', dp: 'downPaymentPct', charges: 'buildingCharges', dti: 'maxDtiPct',
  res: 'reserveMonths', tax: 'condoPropertyTax', ins: 'condoInsurance', liq: 'investmentsLiquidityPct',
} as const;

const FIELDS: [string, keyof PlanInputs][] = [
  ['rs-income', 'annualIncome'], ['rs-debts', 'monthlyDebts'], ['rs-cash', 'cash'], ['rs-invest', 'investments'],
  ['rs-rate', 'mortgageRate'], ['rs-dp', 'downPaymentPct'], ['rs-charges', 'buildingCharges'], ['rs-dti', 'maxDtiPct'],
  ['rs-reserves', 'reserveMonths'], ['rs-tax', 'condoPropertyTax'], ['rs-ins', 'condoInsurance'], ['rs-liq', 'investmentsLiquidityPct'],
];

function initialState(): { state: PageState; saved: boolean } {
  const params = new URLSearchParams(location.search);
  if ([...params.keys()].length) {
    const s: PageState = { ...defaultPlanInputs(typeFrom(params.get('type'))), ...EXAMPLE, targetPrice: num(params.get('target')), mode: modeFrom(params.get('mode')) };
    for (const [k, f] of Object.entries({ ...PERSONAL_PARAMS, ...ASSUMPTION_PARAMS })) {
      const v = num(params.get(k));
      if (v !== null) (s as unknown as Record<string, number>)[f] = v;
    }
    return { state: s, saved: false };
  }
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) {
      const d = JSON.parse(raw);
      return { state: { ...defaultPlanInputs(typeFrom(d.propertyType)), ...EXAMPLE, targetPrice: null, mode: 'rate', ...d }, saved: true };
    }
  } catch { /* storage blocked */ }
  const base: PageState = { ...defaultPlanInputs('coop'), ...EXAMPLE, targetPrice: null, mode: 'rate' };
  const shared = loadSharedProfile();
  if (shared) {
    const accts = Array.isArray(shared.accounts) ? (shared.accounts as { balance?: number; liquidity?: number }[]) : [];
    if (Number(shared.annualIncome)) base.annualIncome = Number(shared.annualIncome);
    if (shared.otherDebts !== undefined) base.monthlyDebts = Number(shared.otherDebts) || 0;
    if (accts.length) {
      base.cash = accts.filter((a) => (a.liquidity ?? 100) >= 100).reduce((s, a) => s + (Number(a.balance) || 0), 0);
      base.investments = accts.filter((a) => (a.liquidity ?? 100) < 100).reduce((s, a) => s + (Number(a.balance) || 0), 0);
    }
  }
  return { state: base, saved: false };
}

let { state, saved } = initialState();

const chargesWord = () => (state.propertyType === 'coop' ? 'maintenance' : 'common charges');

function syncLabels() {
  const coop = state.propertyType === 'coop';
  document.body.classList.toggle('type-coop', coop);
  document.body.classList.toggle('type-condo', !coop);
  $('rs-charges-label')!.textContent = coop ? 'Monthly maintenance' : 'Monthly common charges';
  $('rs-mode-charges-label')!.textContent = coop ? 'Maintenance' : 'Common charges';
  $('rs-dti-label')!.textContent = coop ? 'Board DTI limit' : 'Lender DTI limit';
}

function writeFields() {
  for (const [id, k] of FIELDS) $in(id).value = String(state[k] ?? '');
  $in('rs-target').value = state.targetPrice ? String(state.targetPrice) : '';
  (document.querySelector(`input[name="rs-type"][value="${state.propertyType}"]`) as HTMLInputElement).checked = true;
  (document.querySelector(`input[name="rs-mode"][value="${state.mode}"]`) as HTMLInputElement).checked = true;
  syncLabels();
}

function readFields() {
  for (const [id, k] of FIELDS) {
    const v = num($in(id).value);
    (state as unknown as Record<string, number>)[k] = v === null ? 0 : Math.max(0, v);
  }
  if (state.mortgageRate < 0.5) state.mortgageRate = 0.5;
  const t = num($in('rs-target').value);
  state.targetPrice = t && t > 0 ? t : null;
}

const limitWord = (pt: SweepPoint) => (pt.binding === 'DTI / Income' ? 'income' : 'cash');
const xLabel = (x: number) => (state.mode === 'rate' ? pct(x) : `${money(x)}/mo`);

function renderAnswer(points: SweepPoint[], now: SweepPoint) {
  const rateMode = state.mode === 'rate';
  const step = rateMode ? 1 : 100;
  const cur = rateMode ? state.mortgageRate : state.buildingCharges;
  const up = pointAt(state, state.mode, cur + step, state.targetPrice);
  const down = pointAt(state, state.mode, Math.max(rateMode ? 0.5 : 0, cur - step), state.targetPrice);
  const imp = impactPerStep(state, state.mode, state.targetPrice);

  $('rs-big-label')!.textContent = rateMode ? `At ${pct(cur)}, you can buy up to` : `With ${money(cur)}/mo in ${chargesWord()}, you can buy up to`;
  $('rs-max')!.textContent = money(now.maxPrice);
  $('rs-up-label')!.textContent = rateMode ? `At ${pct(cur + 1)}` : `At ${money(cur + 100)}/mo`;
  $('rs-up')!.textContent = `${money(up.maxPrice)} (${signed(up.maxPrice - now.maxPrice)})`;
  $('rs-down-label')!.textContent = rateMode ? `At ${pct(Math.max(0.5, cur - 1))}` : `At ${money(Math.max(0, cur - 100))}/mo`;
  $('rs-down')!.textContent = `${money(down.maxPrice)} (${signed(down.maxPrice - now.maxPrice)})`;
  $('rs-step-label')!.textContent = rateMode ? 'Income limit per rate point' : `Income limit per $100/mo`;
  $('rs-step')!.textContent = money(Math.abs(imp.incomeLimitPerStep));
  const eq = chargesInRatePoints(state);
  $('rs-equiv-label')!.textContent = `$100/mo of ${chargesWord()} costs as much as`;
  $('rs-equiv')!.textContent = `${eq.toFixed(2)} rate points`;

  const which = limitWord(now);
  const what = rateMode ? 'each point of rate' : `each $100/month of ${chargesWord()}`;
  let head = `Your <strong>${which}</strong> is the tighter limit right now (income allows ${money(now.incomeLimit)}; cash allows ${money(now.cashLimit)}). `;
  if (which === 'income') {
    head += `So ${what} moves your max price by about <strong>${money(Math.abs(imp.maxPricePerStep))}</strong>.`;
  } else if (Math.abs(imp.maxPricePerStep) < 1000) {
    head += `So ${rateMode ? 'rates barely matter to you yet' : `${chargesWord()} barely matter to you yet`}: ${what} moves your income limit by ${money(Math.abs(imp.incomeLimitPerStep))}, but cash stops you first.`;
  } else {
    head += `${state.propertyType === 'coop' && rateMode ? 'Rates still matter, because the board\'s reserve rule counts months of mortgage payments: ' : ''}${what} moves your max price by about <strong>${money(Math.abs(imp.maxPricePerStep))}</strong>.`;
  }
  // Where the two limits cross, if they do inside the range.
  const cross = points.findIndex((pt, i) => i > 0 && limitWord(pt) !== limitWord(points[i - 1]));
  if (cross > 0) head += ` Past ${xLabel(points[cross].x)}, ${limitWord(points[cross])} becomes the limit instead.`;
  $('rs-headline')!.innerHTML = head;

  const line = $('rs-target-line')!;
  if (state.targetPrice) {
    const t = state.targetPrice;
    const reach = highestReaching(points, t);
    const monthly = now.monthlyAtTarget!;
    let txt = `At ${money(t)}, your monthly cost is <strong>${money(monthly)}</strong>; ${what} changes it by about <strong>${money(Math.abs(imp.monthlyPerStep ?? 0))}/mo</strong>. `;
    if (now.maxPrice >= t) {
      txt += reach !== null && reach >= points[points.length - 1].x
        ? `It stays within reach across the whole range shown.`
        : `It stays within reach up to <strong>${xLabel(reach!)}</strong>.`;
    } else if (reach !== null) {
      txt += `It comes within reach at <strong>${xLabel(reach)}</strong> or ${rateMode ? 'lower' : 'less'}.`;
    } else if (points.every((pt) => pt.cashLimit < t)) {
      txt += `${rateMode ? 'No rate in this range' : 'No charge level in this range'} gets you there: cash caps you at ${money(Math.max(...points.map((pt) => pt.cashLimit)))}. See <a href="/savings-planner/">how long it takes to save the gap</a>.`;
    } else {
      txt += `It's out of reach across this whole range; you'd need about ${money(now.incomeNeededAtTarget!)} of income at ${xLabel(rateMode ? state.mortgageRate : state.buildingCharges)}.`;
    }
    line.innerHTML = txt;
    line.hidden = false;
  } else {
    line.hidden = true;
  }
}

// ---- chart ----
const NS = 'http://www.w3.org/2000/svg';
const INCOME = '#2a78d6';
const CASH = '#eb6834';

function niceStep(span: number) {
  const raw = span / 4;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  return [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? raw;
}
const short$ = (v: number) => (v === 0 ? '$0' : v >= 1e6 ? `$${(v / 1e6).toFixed(v % 1e6 === 0 ? 0 : 1)}M` : `$${Math.round(v / 1000)}K`);

function renderChart(points: SweepPoint[]) {
  const rateMode = state.mode === 'rate';
  $('rs-chart-title')!.textContent = rateMode ? 'Max price at each mortgage rate' : `Max price at each level of ${chargesWord()}`;
  const svg = $('rs-chart') as unknown as SVGSVGElement;
  const wrap = $('rs-chart-wrap')!;
  const W = wrap.clientWidth || 800;
  const H = svg.clientHeight || 300;
  const pad = { l: 56, r: 70, t: 12, b: 26 };
  const xs = points.map((p) => p.x);
  const x0 = xs[0], x1 = xs[xs.length - 1];
  const target = state.targetPrice;
  // Keep the chart about the max price: clip a runaway cash (or income) line at 1.6x the higher max.
  const maxMax = Math.max(...points.map((p) => p.maxPrice), target ?? 0);
  const cap = maxMax * 1.6;
  const yMax = Math.min(cap, Math.max(...points.map((p) => Math.max(p.incomeLimit, p.cashLimit)), target ?? 0)) * 1.05;
  const step = niceStep(yMax);
  const top = Math.ceil(yMax / step) * step;
  const x = (v: number) => pad.l + ((v - x0) / (x1 - x0 || 1)) * (W - pad.l - pad.r);
  const y = (v: number) => pad.t + (1 - Math.min(v, top) / top) * (H - pad.t - pad.b);
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
  const tickEvery = rateMode ? 1 : 500;
  for (let v = Math.ceil(x0 / tickEvery) * tickEvery; v <= x1 + 1e-9; v += tickEvery) {
    el('text', { class: 'axis-label', x: x(v), y: H - 6, 'text-anchor': 'middle' }, rateMode ? `${v}%` : `$${(v / 1000).toFixed(v % 1000 ? 1 : 0)}K`);
  }
  const path = (vals: number[]) => vals.map((v, i) => `${i ? 'L' : 'M'}${x(xs[i]).toFixed(1)},${y(v).toFixed(1)}`).join('');
  el('path', { class: 'max-band', d: path(points.map((p) => p.maxPrice)) });
  el('path', { class: 'series s-cash', d: path(points.map((p) => p.cashLimit)) });
  el('path', { class: 'series s-income', d: path(points.map((p) => p.incomeLimit)) });
  if (target) {
    el('line', { class: 'target', x1: pad.l, x2: W - pad.r, y1: y(target), y2: y(target) });
  }
  const cur = rateMode ? state.mortgageRate : state.buildingCharges;
  const nowPt = points.find((p) => p.x === cur) ?? points[0];
  el('line', { class: 'now', x1: x(cur), x2: x(cur), y1: pad.t, y2: H - pad.b });
  el('circle', { class: 'dot', cx: x(cur), cy: y(nowPt.maxPrice), r: 5, fill: limitWord(nowPt) === 'income' ? INCOME : CASH });

  // Direct labels at the right end, nudged apart; a clipped line says so.
  const last = points[points.length - 1];
  const ends = [
    { v: Math.min(last.incomeLimit, top), text: last.incomeLimit > top ? 'Income ↑' : 'Income' },
    { v: Math.min(last.cashLimit, top), text: last.cashLimit > top ? 'Cash ↑' : 'Cash' },
    ...(target ? [{ v: target, text: 'Target' }] : []),
  ].sort((a, b) => b.v - a.v);
  let lastY = -Infinity;
  for (const e of ends) {
    let ly = y(e.v) + 4;
    if (ly - lastY < 14) ly = lastY + 14;
    lastY = ly;
    el('text', { class: 'direct-label', x: W - pad.r + 8, y: ly }, e.text);
  }

  const cross = el('line', { class: 'crosshair', y1: pad.t, y2: H - pad.b, x1: 0, x2: 0, visibility: 'hidden' });
  const tip = $('rs-tooltip')!;
  const show = (i: number) => {
    i = Math.max(0, Math.min(points.length - 1, i));
    const pt = points[i];
    cross.setAttribute('x1', String(x(pt.x)));
    cross.setAttribute('x2', String(x(pt.x)));
    cross.setAttribute('visibility', 'visible');
    const row = (label: string, color: string, v: number) => `<div class="tt-row"><span><i class="sw" style="background:${color}"></i>${label}</span><b>${money(v)}</b></div>`;
    tip.innerHTML = `<div class="tt-date">${xLabel(pt.x)}</div>${row('Income limit', INCOME, pt.incomeLimit)}${row('Cash limit', CASH, pt.cashLimit)}<div class="tt-row"><span>Max price</span><b>${money(pt.maxPrice)}</b></div>${pt.monthlyAtTarget !== null ? `<div class="tt-row"><span>Monthly at target</span><b>${money(pt.monthlyAtTarget)}</b></div>` : ''}`;
    tip.hidden = false;
    const left = x(pt.x) + 12 + 200 > W ? x(pt.x) - 12 - 200 : x(pt.x) + 12;
    tip.style.left = `${Math.max(0, left)}px`;
    tip.style.top = `${pad.t}px`;
  };
  const hide = () => { tip.hidden = true; cross.setAttribute('visibility', 'hidden'); };
  const toIndex = (clientX: number) => {
    const b = svg.getBoundingClientRect();
    const v = x0 + (((clientX - b.left) * (W / b.width) - pad.l) / (W - pad.l - pad.r)) * (x1 - x0);
    let best = 0;
    for (let i = 1; i < xs.length; i++) if (Math.abs(xs[i] - v) < Math.abs(xs[best] - v)) best = i;
    return best;
  };
  svg.onpointermove = (e) => show(toIndex(e.clientX));
  svg.onpointerleave = hide;
  svg.setAttribute('tabindex', '0');
  let kb = Math.max(0, points.indexOf(nowPt));
  svg.onkeydown = (e) => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      kb = Math.max(0, Math.min(points.length - 1, kb + (e.key === 'ArrowRight' ? 1 : -1)));
      show(kb);
      e.preventDefault();
    }
  };
  svg.onblur = hide;

  const first = points[0];
  $('rs-chart-desc')!.textContent = `From ${xLabel(first.x)} to ${xLabel(last.x)}, your income limit goes from ${money(first.incomeLimit)} to ${money(last.incomeLimit)} and your cash limit from ${money(first.cashLimit)} to ${money(last.cashLimit)}. Your max price, the lower of the two, goes from ${money(first.maxPrice)} to ${money(last.maxPrice)}; at ${xLabel(cur)} it is ${money(nowPt.maxPrice)}.${target ? ` The dashed line is your ${money(target)} target.` : ''} Use the arrow keys on the chart to step through values.`;

  $('rs-thead')!.innerHTML = `<tr><th scope="col">${rateMode ? 'Rate' : chargesWord()[0].toUpperCase() + chargesWord().slice(1)}</th><th scope="col" class="num">Income limit</th><th scope="col" class="num">Cash limit</th><th scope="col" class="num">Max price</th><th scope="col">Limited by</th>${target ? '<th scope="col" class="num">Monthly at target</th><th scope="col" class="num">Income needed</th>' : ''}</tr>`;
  $('rs-table')!.innerHTML = points.map((pt) => `<tr${pt.x === cur ? ' class="current"' : ''}><td>${xLabel(pt.x)}${pt.x === cur ? ' (now)' : ''}</td><td class="num">${money(pt.incomeLimit)}</td><td class="num">${money(pt.cashLimit)}</td><td class="num">${money(pt.maxPrice)}</td><td>${limitWord(pt)}</td>${target ? `<td class="num">${money(pt.monthlyAtTarget!)}</td><td class="num">${money(pt.incomeNeededAtTarget!)}</td>` : ''}</tr>`).join('');
}

function render() {
  const values = state.mode === 'rate' ? rateRange(state.mortgageRate) : chargesRange(state.buildingCharges);
  const points = sweep(state, state.mode, values, state.targetPrice);
  const cur = state.mode === 'rate' ? state.mortgageRate : state.buildingCharges;
  const now = points.find((p) => p.x === cur)!;
  renderAnswer(points, now);
  renderChart(points);
}

function persist() {
  if (!$in('save-toggle-cb').checked) return;
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(state));
    saveSharedProfile({ annualIncome: state.annualIncome, otherDebts: state.monthlyDebts });
  } catch { /* storage blocked */ }
}

function scenarioLink(personal: boolean) {
  const p = new URLSearchParams({ type: state.propertyType, mode: state.mode });
  for (const [k, f] of Object.entries(ASSUMPTION_PARAMS)) p.set(k, String(state[f]));
  if (state.targetPrice) p.set('target', String(state.targetPrice));
  if (personal) for (const [k, f] of Object.entries(PERSONAL_PARAMS)) p.set(k, String(state[f]));
  return `${location.origin}${location.pathname}?${p}`;
}

document.addEventListener('DOMContentLoaded', () => {
  writeFields();
  $in('save-toggle-cb').checked = saved;
  render();
  const onChange = () => { readFields(); render(); persist(); };
  for (const [id] of FIELDS) $in(id).addEventListener('input', onChange);
  $in('rs-target').addEventListener('input', onChange);
  document.querySelectorAll<HTMLInputElement>('input[name="rs-type"]').forEach((el) => el.addEventListener('change', () => {
    readFields();
    const d = defaultPlanInputs(typeFrom(el.value));
    state = { ...state, propertyType: d.propertyType, downPaymentPct: d.downPaymentPct, buildingCharges: d.buildingCharges, maxDtiPct: d.maxDtiPct };
    writeFields();
    render();
    persist();
  }));
  document.querySelectorAll<HTMLInputElement>('input[name="rs-mode"]').forEach((el) => el.addEventListener('change', () => {
    state.mode = modeFrom(el.value);
    render();
    persist();
  }));
  $in('save-toggle-cb').addEventListener('change', (e) => {
    if ((e.target as HTMLInputElement).checked) persist();
    else { try { localStorage.removeItem(LS_KEY); } catch { /* ignore */ } }
  });
  const btn = $('rs-share') as HTMLButtonElement;
  btn.addEventListener('click', async () => {
    const url = scenarioLink($in('rs-share-personal').checked);
    const label = btn.textContent;
    try { await navigator.clipboard.writeText(url); btn.textContent = 'Link copied'; } catch { window.prompt('Copy this link:', url); }
    setTimeout(() => { btn.textContent = label; }, 2000);
  });
  $('rs-print')!.addEventListener('click', () => window.print());
  let t: number | undefined;
  window.addEventListener('resize', () => { clearTimeout(t); t = window.setTimeout(render, 150); });
});
