/* ============================================================
   /my-data/: saved data, scenarios, export/import, reset
   ============================================================
   All storage logic lives in src/lib/profileStore.ts (tested in
   test/profileStore.test.ts); this file only wires it to the page.
   Nothing here makes a network request. Export is a Blob the browser
   downloads; import reads a file the visitor picks.

   Every string from storage or an imported file (scenario names, keys)
   goes into the page with textContent, never innerHTML.
   ============================================================ */

import {
  STORAGE_KEYS, MAX_SCENARIOS,
  savedKeys, listScenarios, saveScenario, loadScenario, renameScenario, deleteScenario,
  resetAll, exportData, parseImport, applyImport,
  type StorageLike, type ParsedImport, type Scenario,
} from '../lib/profileStore.ts';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const LABEL = new Map(STORAGE_KEYS.map((k) => [k.key, k.label]));

function getStorage(): StorageLike | null {
  try {
    const s = window.localStorage;
    const probe = '__nyc_probe__';
    s.setItem(probe, '1');
    s.removeItem(probe);
    return s;
  } catch {
    return null;
  }
}

const storage = getStorage();

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

function button(text: string, cls: string, onClick: () => void): HTMLButtonElement {
  const b = el('button', `btn ${cls}`, text);
  b.type = 'button';
  b.addEventListener('click', onClick);
  return b;
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return 'date unknown';
  return d.toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
}

// ---- What's saved ----

function renderSaved() {
  if (!storage) return;
  const saved = new Set(savedKeys(storage).map((k) => k.key));
  document.querySelectorAll<HTMLTableRowElement>('tr[data-key]').forEach((row) => {
    const on = saved.has(row.dataset.key!);
    row.classList.toggle('is-saved', on);
    row.querySelector('.state')!.textContent = on ? 'Saved' : 'Nothing saved';
  });
  $('saved-summary').textContent = saved.size
    ? `${plural(saved.size, 'tool has', 'tools have')} saved inputs in this browser.`
    : 'Nothing is saved in this browser yet. Turn on "Save inputs" in a calculator and it will show up here.';
}

// ---- Scenarios ----

function setStatus(id: string, text: string) {
  $(id).textContent = text;
}

function scenarioItem(s: Scenario): HTMLLIElement {
  const li = el('li');
  const main = el('div', 's-main');
  const name = el('span', 's-name', s.name);
  const tools = Object.keys(s.data).map((k) => LABEL.get(k)).filter(Boolean);
  const meta = el('span', 's-meta', `Saved ${formatDate(s.savedAt)} · ${plural(tools.length, 'tool')}`);
  meta.title = tools.join(', ');
  main.append(name, meta);

  const actions = el('div', 's-actions');
  actions.append(
    button('Load', 'btn-primary', () => {
      if (!window.confirm(`Load "${s.name}"? It replaces what the calculators have saved now. Save the current inputs as a scenario first if you want to keep them.`)) return;
      if (loadScenario(storage!, s.id)) setStatus('scenario-status', `Loaded "${s.name}". Open any calculator to see it.`);
      refresh();
    }),
    button('Rename', 'btn-secondary', () => startRename(li, s)),
    button('Delete', 'btn-danger', () => {
      if (!window.confirm(`Delete the scenario "${s.name}"? What the calculators have saved now isn't affected.`)) return;
      if (deleteScenario(storage!, s.id)) setStatus('scenario-status', `Deleted "${s.name}".`);
      refresh();
    }),
  );
  li.append(main, actions);
  return li;
}

function startRename(li: HTMLLIElement, s: Scenario) {
  const form = el('form', 's-form');
  const wrap = el('div', 's-main');
  const input = el('input');
  input.type = 'text';
  input.maxLength = 60;
  input.value = s.name;
  input.setAttribute('aria-label', `New name for ${s.name}`);
  wrap.append(input);
  const save = el('button', 'btn btn-primary', 'Save name');
  save.type = 'submit';
  const actions = el('div', 's-actions');
  actions.append(save, button('Cancel', 'btn-secondary', refresh));
  form.append(wrap, actions);
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    if (renameScenario(storage!, s.id, input.value)) {
      setStatus('scenario-status', `Renamed to "${input.value.trim()}".`);
      refresh();
    } else {
      setStatus('scenario-status', input.value.trim() ? 'Another scenario already has that name.' : 'A scenario needs a name.');
      input.focus();
    }
  });
  li.replaceChildren(form);
  input.focus();
  input.select();
}

function renderScenarios() {
  if (!storage) return;
  const list = listScenarios(storage);
  $('scenario-list').replaceChildren(...list.map(scenarioItem));
  $('scenario-empty').hidden = list.length > 0;
}

function onSave(e: Event) {
  e.preventDefault();
  if (!storage) return;
  const input = $<HTMLInputElement>('scenario-name');
  const r = saveScenario(storage, input.value);
  if (r.ok) {
    setStatus('scenario-status', r.replaced ? `Updated "${r.scenario.name}" with the current inputs.` : `Saved "${r.scenario.name}".`);
    input.value = '';
  } else {
    setStatus('scenario-status', {
      'empty-name': 'Give the scenario a name first.',
      'nothing-saved': 'Nothing to save yet. Turn on "Save inputs" in a calculator, enter your numbers, then come back.',
      limit: `That's the limit of ${MAX_SCENARIOS}. Delete one, or reuse a name to update it.`,
    }[r.reason]);
  }
  refresh();
}

// ---- Export / import ----

function onExport() {
  if (!storage) return;
  const data = exportData(storage);
  if (!Object.keys(data.current).length && !data.scenarios.length) {
    setStatus('export-status', 'Nothing is saved in this browser, so there\'s nothing to export.');
    return;
  }
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = el('a');
  a.href = url;
  a.download = `nyc-affordability-saved-data-${data.exported.slice(0, 10)}.json`;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  setStatus('export-status', `Downloaded ${plural(Object.keys(data.current).length, 'tool')} and ${plural(data.scenarios.length, 'scenario')}.`);
}

let pending: ParsedImport | null = null;

function closePreview() {
  pending = null;
  $('import-preview').hidden = true;
  $<HTMLInputElement>('import-file').value = '';
}

async function onFile() {
  const input = $<HTMLInputElement>('import-file');
  const file = input.files?.[0];
  if (!file) return;
  closePreview();
  const r = parseImport(await file.text());
  if (!r.ok) {
    setStatus('export-status', r.error);
    return;
  }
  pending = r.data;
  setStatus('export-status', '');
  const tools = Object.keys(r.data.current).map((k) => LABEL.get(k)!);
  $('import-summary').textContent = r.data.kind === 'legacy-coop'
    ? `A saved-data file from the old co-op site, with ${plural(tools.length, 'tool')}:`
    : `${plural(tools.length, 'tool')} and ${plural(r.data.scenarios.length, 'scenario')}${tools.length ? ':' : '.'}`;
  $('import-keys').replaceChildren(...tools.map((t) => el('li', undefined, t)), ...r.data.scenarios.map((s) => el('li', undefined, `Scenario: ${s.name}`)));
  const skipped = $('import-skipped');
  skipped.hidden = !r.data.skipped.length;
  skipped.textContent = r.data.skipped.length ? `Skipped, because this site doesn't use them: ${r.data.skipped.slice(0, 10).join(', ')}${r.data.skipped.length > 10 ? '…' : ''}` : '';
  $('import-preview').hidden = false;
  $<HTMLButtonElement>('import-confirm').focus();
}

function onImport() {
  if (!storage || !pending) return;
  const mode = (document.querySelector<HTMLInputElement>('input[name="import-mode"]:checked')?.value ?? 'merge') as 'merge' | 'replace';
  const r = applyImport(storage, pending, mode);
  const dropped = pending.scenarios.length - r.scenarios;
  closePreview();
  setStatus('export-status', `Imported ${plural(r.keys, 'tool')} and ${plural(r.scenarios, 'scenario')}.${dropped ? ` ${plural(dropped, 'scenario')} didn't fit under the limit of ${MAX_SCENARIOS}.` : ''}`);
  refresh();
}

// ---- Reset ----

function showResetConfirm(on: boolean) {
  $('reset-start').hidden = on;
  $('reset-confirm').hidden = !on;
  (on ? $('reset-no') : $('reset-btn')).focus();
}

function onReset() {
  if (!storage) return;
  resetAll(storage);
  showResetConfirm(false);
  setStatus('reset-status', 'Deleted. Nothing from this site is saved in this browser now.');
  setStatus('scenario-status', '');
  refresh();
}

function refresh() {
  renderSaved();
  renderScenarios();
}

function init() {
  if (!storage) {
    $('saved-summary').textContent = 'This browser is blocking local storage (private mode or a privacy setting), so the calculators can\'t save anything here and there\'s nothing to show.';
    document.querySelectorAll<HTMLButtonElement | HTMLInputElement>('main button, main input').forEach((b) => { b.disabled = true; });
    return;
  }
  $('save-form').addEventListener('submit', onSave);
  $('export-btn').addEventListener('click', onExport);
  $('import-file').addEventListener('change', onFile);
  $('import-confirm').addEventListener('click', onImport);
  $('import-cancel').addEventListener('click', closePreview);
  $('reset-btn').addEventListener('click', () => showResetConfirm(true));
  $('reset-no').addEventListener('click', () => showResetConfirm(false));
  $('reset-yes').addEventListener('click', onReset);
  // Another tab changing a calculator updates this page.
  window.addEventListener('storage', refresh);
  refresh();
}

init();
