import { fmtMoney as fmt$, fmtPercent as fmtPct } from '../lib/format';
import { loadSharedProfile, saveSharedProfile, SHARED_KEY } from '../lib/sharedProfile';
import { AMI_BASE } from '../lib/amiTable';

const LS_KEY = 'nyc_affordable_inputs';

const BANDS = [30, 40, 50, 60, 70, 80, 90, 100, 110, 120, 130];

const UNIT_HH: Record<string, number> = { studio: 1, '1br': 2, '2br': 3, '3br': 4, '4br': 5 };
const UNIT_LABELS: Record<string, string> = { studio: 'Studio', '1br': '1 BR', '2br': '2 BR', '3br': '3 BR', '4br': '4 BR' };

const BOROUGH_LABELS: Record<string, string> = {
  any: '',
  manhattan: 'Manhattan',
  brooklyn: 'Brooklyn',
  queens: 'Queens',
  bronx: 'the Bronx',
  'staten-island': 'Staten Island',
};

function $(id: string) { return document.getElementById(id); }
function $input(id: string) { return document.getElementById(id) as HTMLInputElement | null; }
function $select(id: string) { return document.getElementById(id) as HTMLSelectElement | null; }

function getBandClass(pct: number) {
  if (pct <= 30)  return { name: 'Extremely Low Income', short: 'ELI', code: 'eli' };
  if (pct <= 50)  return { name: 'Very Low Income',      short: 'VLI', code: 'vli' };
  if (pct <= 80)  return { name: 'Low Income',           short: 'LI',  code: 'li'  };
  if (pct <= 120) return { name: 'Moderate Income',      short: 'MOD', code: 'mod' };
  if (pct <= 165) return { name: 'Middle Income',        short: 'MI',  code: 'mi'  };
  return { name: 'Above AMI', short: '>AMI', code: 'above' };
}

function getBandShortName(band: number) {
  if (band <= 30)  return 'ELI';
  if (band <= 50)  return 'VLI';
  if (band <= 80)  return 'LI';
  if (band <= 120) return 'MOD';
  return 'MI';
}

/* ── Read current AMI reference values ── */
function getAmiRef(): Record<number, number> {
  const ref: Record<number, number> = {};
  for (let i = 1; i <= 8; i++) {
    const el  = $input('ami-ref-' + i);
    const val = el ? parseFloat(el.value) : NaN;
    ref[i] = (Number.isFinite(val) && val > 0) ? val : AMI_BASE[i];
  }
  return ref;
}

/* ── Read all inputs ── */
function readInputs() {
  return {
    hhSize:     parseInt($select('hh-size')!.value)      || 2,
    income:     Math.max(0, parseFloat($input('annual-income')!.value) || 0),
    unitSize:   $select('unit-size')!.value               || '1br',
    borough:    $select('borough')!.value                 || 'any',
    targetBand: parseInt($select('target-band')!.value)  || 60,
    amiRef:     getAmiRef(),
  };
}

type Inputs = ReturnType<typeof readInputs>;

/* ── Core calculation ── */
function calculate(inp: Inputs) {
  const hh100  = inp.amiRef[inp.hhSize] || AMI_BASE[inp.hhSize];
  const amiPct = hh100 > 0 ? (inp.income / hh100) * 100 : 0;
  const bandClass = getBandClass(amiPct);

  const eligibility = BANDS.map(band => {
    const limit      = hh100 * band / 100;
    const stdHh      = UNIT_HH[inp.unitSize] || 2;
    const unitHh100  = inp.amiRef[stdHh] || AMI_BASE[stdHh];
    const affordableRent = Math.round(unitHh100 * band / 100 * 0.30 / 12);
    const minIncome  = affordableRent * 40;
    const eligible   = inp.income <= limit;
    return { band, limit: Math.round(limit), affordableRent, minIncome, eligible };
  });

  const unitSizes = ['studio', '1br', '2br', '3br', '4br'];
  const rentTable = unitSizes.map(unit => {
    const stdHh     = UNIT_HH[unit];
    const unitHh100 = inp.amiRef[stdHh] || AMI_BASE[stdHh];
    return {
      unit,
      stdHh,
      rents: BANDS.map(band => Math.round(unitHh100 * band / 100 * 0.30 / 12)),
    };
  });

  return { amiPct, bandClass, eligibility, rentTable, hh100 };
}

/* ── Render results ── */
function updateResults() {
  const inp = readInputs();
  const r   = calculate(inp);

  const heroEl  = $('hero-ami-pct')!;
  heroEl.textContent = fmtPct(r.amiPct);
  heroEl.className   = 'hero-price' + (r.amiPct === 0 ? ' zero' : '');

  $('hero-band-pill-wrap')!.innerHTML =
    '<span class="hero-band-pill ' + r.bandClass.code + '">' +
    r.bandClass.short + ' — ' + r.bandClass.name + '</span>';

  const meterPct    = Math.min(r.amiPct, 165);
  const rawPct      = meterPct / 165 * 100;
  const markerPct   = rawPct.toFixed(1) + '%';
  const labelPct    = Math.min(Math.max(rawPct, 4), 96).toFixed(1) + '%';
  ($('ami-marker-ptr') as HTMLElement).style.left   = markerPct;
  ($('ami-marker-label') as HTMLElement).style.left = labelPct;
  $('ami-marker-label')!.textContent = fmtPct(r.amiPct);

  $('s-ami-pct')!.textContent     = fmtPct(r.amiPct);
  $('s-income')!.textContent      = fmt$(inp.income);
  $('s-hh-size-lbl')!.textContent = String(inp.hhSize);
  $('s-hh-100-ami')!.textContent  = fmt$(r.hh100);
  $('s-band-class')!.textContent  = r.bandClass.name + ' (' + r.bandClass.short + ')';

  const tgt    = r.eligibility.find(e => e.band === inp.targetBand);
  const trEl   = $('target-result')!;
  const trIcon = $('tr-icon')!;
  const trTitle = $('tr-title')!;
  const trSub  = $('tr-sub')!;
  if (tgt) {
    const unitLabel = UNIT_LABELS[inp.unitSize];
    if (tgt.eligible) {
      trEl.className        = 'target-result ok';
      trIcon.textContent    = '✅';
      trTitle.textContent   = 'You qualify for ' + inp.targetBand + '% AMI listings';
      trSub.textContent     =
        'Your income (' + fmt$(inp.income) + ') is at or below the ' +
        inp.targetBand + '% AMI limit of ' + fmt$(tgt.limit) +
        ' for a ' + inp.hhSize + '-person household. ' +
        'Affordable rent for a ' + unitLabel + ' at this band: ' +
        fmt$(tgt.affordableRent) + '/mo.';
    } else {
      const gap = inp.income - tgt.limit;
      const overMin = inp.income < tgt.minIncome;
      trEl.className        = 'target-result over';
      trIcon.textContent    = '❌';
      trTitle.textContent   = overMin
        ? 'Under minimum income for ' + inp.targetBand + '% AMI'
        : 'Over income for ' + inp.targetBand + '% AMI';
      trSub.textContent     = overMin
        ? 'Your income (' + fmt$(inp.income) + ') is below the minimum of ' +
          fmt$(tgt.minIncome) + ' (40× the ' + fmt$(tgt.affordableRent) + '/mo rent) required by most ' +
          inp.targetBand + '% AMI listings. ' +
          'Affordable rent for a ' + UNIT_LABELS[inp.unitSize] + ' at this band: ' + fmt$(tgt.affordableRent) + '/mo.'
        : 'Your income (' + fmt$(inp.income) + ') exceeds the ' +
          inp.targetBand + '% AMI limit of ' + fmt$(tgt.limit) +
          ' by ' + fmt$(gap) + '. ' +
          'Affordable rent for a ' + UNIT_LABELS[inp.unitSize] + ' at this band: ' + fmt$(tgt.affordableRent) + '/mo. ' +
          'You may qualify for a higher band — see the list below.';
    }
  }

  let bandHTML = '';
  r.eligibility.forEach(e => {
    const isTarget = e.band === inp.targetBand;
    const cls = ['band-row', e.eligible ? 'ok' : 'over', isTarget ? 'target' : ''].join(' ').trim();
    const icon = e.eligible ? '✓' : '✗';
    bandHTML +=
      '<div class="' + cls + '" role="listitem">' +
        '<span class="band-icon" aria-hidden="true">' + icon + '</span>' +
        '<span class="band-pct-col">' +
          '<span class="band-pct-val">' + e.band + '% AMI</span>' +
          '<span class="band-pct-name">' + getBandShortName(e.band) + '</span>' +
        '</span>' +
        '<span class="band-limit">≤ ' + fmt$(e.limit) + '</span>' +
        '<span class="band-rent">' + fmt$(e.affordableRent) + '/mo</span>' +
        (isTarget ? '<span class="band-target-tag">Your target</span>' : '') +
      '</div>';
  });
  $('band-list')!.innerHTML = bandHTML;

  const bLabel = BOROUGH_LABELS[inp.borough];
  $('borough-note')!.textContent = bLabel
    ? ' Filter listings by ' + bLabel + ' on Housing Connect.'
    : '';

  renderRentTable(inp, r);

  if (($('save-toggle-cb') as HTMLInputElement).checked) saveToStorage(inp);
}

function renderRentTable(inp: Inputs, r: ReturnType<typeof calculate>) {
  let html =
    '<table class="rent-tbl" aria-label="Affordable rent table by unit size and AMI band">' +
    '<thead><tr><th>Unit</th>';

  BANDS.forEach(band => {
    html += '<th class="' + (band === inp.targetBand ? 'th-target' : '') + '">' + band + '%</th>';
  });
  html += '</tr></thead><tbody>';

  r.rentTable.forEach(row => {
    const isUserUnit = row.unit === inp.unitSize;
    html += '<tr>';
    html += '<td class="' + (isUserUnit ? 'cell-unit' : '') + '">' + UNIT_LABELS[row.unit] + '</td>';
    row.rents.forEach((rent, i) => {
      const band = BANDS[i];
      const isTarget = band === inp.targetBand;
      let cls = '';
      if (isTarget && isUserUnit) cls = 'cell-focus';
      else if (isTarget)          cls = 'cell-target';
      else if (isUserUnit)        cls = 'cell-unit';
      html += '<td class="' + cls + '">' + fmt$(rent) + '</td>';
    });
    html += '</tr>';
  });
  html += '</tbody></table>';
  $('rent-tbl-wrap')!.innerHTML = html;
}

function renderAmiRefTable(hhSize: number) {
  let html = '';
  for (let i = 1; i <= 8; i++) {
    html +=
      '<tr class="' + (i === hhSize ? 'active-row' : '') + '">' +
        '<td class="hh-lbl">' + i + ' person' + (i > 1 ? 's' : '') + '</td>' +
        '<td style="text-align:right;padding:3px 3px">' +
          '<input type="number" id="ami-ref-' + i + '" value="' + AMI_BASE[i] +
          '" min="0" step="100" aria-label="100% AMI for ' + i + ' person' + (i > 1 ? 's' : '') + '">' +
        '</td>' +
      '</tr>';
  }
  $('ami-ref-tbody')!.innerHTML = html;

  for (let i = 1; i <= 8; i++) {
    const el = $input('ami-ref-' + i);
    if (el) {
      el.addEventListener('input',  onChange);
      el.addEventListener('change', onChange);
    }
  }
}

function updateActiveRow(hhSize: number) {
  const rows = document.querySelectorAll('#ami-ref-tbody tr');
  rows.forEach((row, idx) => {
    const active = (idx + 1) === hhSize;
    row.classList.toggle('active-row', active);
  });
}

function initCards() {
  [1, 2, 3].forEach(n => {
    const title = $('card-title-' + n);
    const body  = $('card-body-' + n);
    if (!title || !body) return;
    const chev = title.querySelector('.card-chev');
    title.setAttribute('tabindex', '0');
    title.setAttribute('role', 'button');
    const toggle = () => {
      const isOpen = !body.classList.contains('collapsed');
      body.classList.toggle('collapsed', isOpen);
      if (chev) chev.classList.toggle('open', !isOpen);
      title.setAttribute('aria-expanded', isOpen ? 'false' : 'true');
    };
    title.addEventListener('click', toggle);
    title.addEventListener('keydown', e => {
      if ((e as KeyboardEvent).key === 'Enter' || (e as KeyboardEvent).key === ' ') { e.preventDefault(); toggle(); }
    });
  });
}

function initTabs() {
  const tabs = document.querySelectorAll('[role="tab"]');
  tabs.forEach(btn => {
    btn.addEventListener('click', () => {
      tabs.forEach(t => {
        t.classList.remove('active');
        t.setAttribute('aria-selected', 'false');
        (t as HTMLElement).tabIndex = -1;
        const panel = $(t.getAttribute('aria-controls')!);
        if (panel) (panel as HTMLElement).hidden = true;
      });
      btn.classList.add('active');
      btn.setAttribute('aria-selected', 'true');
      (btn as HTMLElement).tabIndex = 0;
      const panel = $(btn.getAttribute('aria-controls')!);
      if (panel) (panel as HTMLElement).hidden = false;
    });

    btn.addEventListener('keydown', e => {
      const evt = e as KeyboardEvent;
      const arr = Array.from(tabs);
      const idx = arr.indexOf(btn);
      let next = -1;
      if (evt.key === 'ArrowRight') next = (idx + 1) % arr.length;
      if (evt.key === 'ArrowLeft')  next = (idx - 1 + arr.length) % arr.length;
      if (evt.key === 'Home')       next = 0;
      if (evt.key === 'End')        next = arr.length - 1;
      if (next !== -1) { evt.preventDefault(); (arr[next] as HTMLElement).click(); (arr[next] as HTMLElement).focus(); }
    });
  });
}

function initInfoSections() {
  ([['how-btn', 'how-body'], ['assump-btn', 'assump-body']] as const).forEach(([btnId, bodyId]) => {
    const btn  = $(btnId)!;
    const body = $(bodyId)!;
    btn.addEventListener('click', () => {
      const open = body.classList.contains('open');
      body.classList.toggle('open', !open);
      btn.classList.toggle('open', !open);
      btn.setAttribute('aria-expanded', open ? 'false' : 'true');
    });
  });
}

/* ── localStorage ── */
function saveToStorage(inp: Inputs) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify({
      hhSize:     inp.hhSize,
      income:     inp.income,
      unitSize:   inp.unitSize,
      borough:    inp.borough,
      targetBand: inp.targetBand,
      amiRef:     inp.amiRef,
    }));
  } catch (e) { /* ignore */ }
}

function loadFromStorage(): any {
  try { const s = localStorage.getItem(LS_KEY); return s ? JSON.parse(s) : null; } catch (e) { return null; }
}

function restoreInputs(data: any) {
  const setV = (id: string, val: unknown) => { const el = $input(id) || $select(id); if (el && val !== undefined) (el as any).value = val; };
  setV('hh-size',     data.hhSize);
  setV('annual-income', data.income);
  setV('unit-size',   data.unitSize);
  setV('borough',     data.borough);
  setV('target-band', data.targetBand);
  if (data.amiRef) {
    for (let i = 1; i <= 8; i++) {
      const el = $input('ami-ref-' + i);
      if (el && data.amiRef[i] !== undefined) el.value = data.amiRef[i];
    }
  }
}

function onChange() {
  updateActiveRow(parseInt($select('hh-size')!.value) || 2);
  updateResults();
}

function applyIncomeFromSharedProfile() {
  const shared = loadSharedProfile();
  if (!shared || shared.annualIncome === undefined) return;
  const el = $input('annual-income');
  if (el) el.value = String(shared.annualIncome);
}

/* ── Boot ── */
document.addEventListener('DOMContentLoaded', () => {
  const initHh = parseInt($select('hh-size')!.value) || 2;
  renderAmiRefTable(initHh);

  const saved = loadFromStorage();
  if (saved) {
    ($('save-toggle-cb') as HTMLInputElement).checked = true;
    restoreInputs(saved);
    updateActiveRow(saved.hhSize || 2);
  }

  if (!saved || saved.income === undefined) {
    applyIncomeFromSharedProfile();
  }

  updateResults();
  initCards();
  initTabs();
  initInfoSections();

  $('save-toggle-cb')!.addEventListener('change', () => {
    if (($('save-toggle-cb') as HTMLInputElement).checked) saveToStorage(readInputs());
    else { try { localStorage.removeItem(LS_KEY); } catch (e) { /* ignore */ } }
  });

  ['hh-size', 'annual-income', 'unit-size', 'borough', 'target-band'].forEach(id => {
    const el = $input(id) || $select(id);
    if (!el) return;
    el.addEventListener('change', onChange);
    if ((el as HTMLInputElement).type === 'number') el.addEventListener('input', onChange);
  });

  const incomeEl = $input('annual-income');
  if (incomeEl) {
    const syncIncome = () => {
      if (!($('save-toggle-cb') as HTMLInputElement).checked) return;
      const raw = incomeEl.value.trim();
      const v = parseFloat(raw);
      if (raw === '' || isNaN(v)) {
        saveSharedProfile({ annualIncome: undefined });
      } else {
        saveSharedProfile({ annualIncome: v });
      }
    };
    incomeEl.addEventListener('change', syncIncome);
    incomeEl.addEventListener('input', syncIncome);
  }

  window.addEventListener('storage', e => {
    if (e.key !== SHARED_KEY) return;
    applyIncomeFromSharedProfile();
    updateResults();
  });
});
