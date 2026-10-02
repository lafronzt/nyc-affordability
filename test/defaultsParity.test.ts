import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ASSUMPTIONS } from '../src/data/assumptions.ts';

// The interactive calculators still declare their defaults as <input value>
// attributes. This test reads those attributes straight from the .astro
// source and fails if any disagree with src/data/assumptions.ts, which is
// what the build-time pages (/income/, /buy/, /rent/<n>/, neighborhoods,
// homepage) compute from. It is the guard against the two drifting apart.

function inputDefaults(page: string): Map<string, string> {
  const src = readFileSync(new URL(`../src/pages/${page}/index.astro`, import.meta.url), 'utf8');
  const out = new Map<string, string>();
  for (const tag of src.match(/<input\b[^>]*>/g) ?? []) {
    const id = tag.match(/\bid="([^"]+)"/)?.[1];
    const value = tag.match(/\bvalue="([^"]*)"/)?.[1];
    if (id && value !== undefined) out.set(id, value);
  }
  // <select>: the option marked `selected`, else the first option (browser default).
  for (const [, attrs, body] of src.matchAll(/<select\b([^>]*)>([\s\S]*?)<\/select>/g)) {
    const id = attrs.match(/\bid="([^"]+)"/)?.[1];
    const options = [...body.matchAll(/<option\b([^>]*)>/g)].map((m) => m[1]);
    const chosen = options.find((o) => /\bselected\b/.test(o)) ?? options[0];
    const value = chosen?.match(/\bvalue="([^"]*)"/)?.[1];
    if (id && value !== undefined) out.set(id, value);
  }
  return out;
}

const pages = new Map<string, Map<string, string>>();
const defaultsFor = (page: string) => {
  if (!pages.has(page)) pages.set(page, inputDefaults(page));
  return pages.get(page)!;
};

for (const [key, a] of Object.entries(ASSUMPTIONS)) {
  for (const { page, id } of a.inputs ?? []) {
    test(`${key} matches /${page}/ #${id}`, () => {
      const raw = defaultsFor(page).get(id);
      assert.notEqual(raw, undefined, `no <input id="${id}" value=...> on /${page}/`);
      assert.equal(Number(raw), a.value, `/${page}/ #${id} defaults to ${raw}, registry says ${a.value}`);
    });
  }
}

test('every registry entry is honest about its source', () => {
  for (const [key, a] of Object.entries(ASSUMPTIONS)) {
    if (a.sourceUrl !== null) assert.match(a.sourceUrl, /^https:\/\//, key);
    if (a.lastVerified !== null) assert.match(a.lastVerified, /^\d{4}-\d{2}-\d{2}$/, key);
    // A figure presented as law or official data must say where it's from.
    if (a.basis === 'law' || a.basis === 'official-data') {
      assert.ok(a.sourceOrg && a.sourceUrl, `${key} is ${a.basis} but has no source`);
    }
  }
});
