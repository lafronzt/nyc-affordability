import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { SITE_CHANGES, CORRECTIONS, changeId, correctionsFor } from '../src/data/siteChanges.ts';
import { MAINTAINER, REVIEWER } from '../src/data/editorial.ts';

// The public changelog and corrections pages (src/data/siteChanges.ts).
// A trust page that's wrong or stale is worse than none, so these check
// it stays internally consistent and in step with change-log.md.

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const ISO = /^\d{4}-\d{2}-\d{2}$/;

/** A site path resolves to a page in this repo: a static page, a guide, or a glossary term. */
function resolves(path: string): boolean {
  if (!/^\/([a-z0-9-]+\/)*$/.test(path)) return false;
  if (existsSync(`${ROOT}src/pages${path}index.astro`)) return true;
  const m = path.match(/^\/(guides|glossary)\/([a-z0-9-]+)\/$/);
  if (m) return existsSync(`${ROOT}src/content/${m[1]}/${m[2]}.md`) || existsSync(`${ROOT}src/content/${m[1]}/${m[2]}.mdx`);
  return false;
}

test('entries: valid dates, newest first, unique anchors', () => {
  assert.ok(SITE_CHANGES.length > 0);
  for (const c of SITE_CHANGES) assert.match(c.date, ISO, c.title);
  for (let i = 1; i < SITE_CHANGES.length; i++) {
    assert.ok(SITE_CHANGES[i - 1].date >= SITE_CHANGES[i].date, `${SITE_CHANGES[i].title} is out of order`);
  }
  const ids = SITE_CHANGES.map(changeId);
  assert.equal(new Set(ids).size, ids.length);
  for (const id of ids) assert.match(id, /^[a-z0-9-]+$/);
});

test('corrections say what was wrong and what\'s right; other entries don\'t pretend to', () => {
  assert.ok(CORRECTIONS.length >= 5);
  for (const c of SITE_CHANGES) {
    if (c.kind === 'correction') {
      assert.ok(c.wrong && c.wrong.length > 30, `${c.title}: needs "wrong"`);
      assert.ok(c.right && c.right.length > 30, `${c.title}: needs "right"`);
      assert.ok(c.affects.length > 0, `${c.title}: which pages showed it?`);
    } else {
      assert.equal(c.wrong, undefined, c.title);
      assert.equal(c.right, undefined, c.title);
    }
  }
});

test('every affected path is a real page on the site', () => {
  const bad = SITE_CHANGES.flatMap((c) => c.affects.filter((a) => !resolves(a)).map((a) => `${c.title}: ${a}`));
  assert.deepEqual(bad, []);
});

test('every "Fix:" in change-log.md has a correction (or is listed here as not changing a figure)', () => {
  // Fixes that never changed a number anyone could have relied on.
  const NOT_A_FIGURE = new Set(['2026-10-03: Fix: nav dropdowns blocked by the Content-Security-Policy']);
  const log = readFileSync(`${ROOT}change-log.md`, 'utf8');
  const headings = [...log.matchAll(/^## (.+)$/gm)].map((m) => m[1]);
  const linked = new Set(SITE_CHANGES.map((c) => c.logHeading).filter(Boolean));
  const missing = headings.filter((h) => / Fix: /.test(h) && !linked.has(h) && !NOT_A_FIGURE.has(h));
  assert.deepEqual(missing, [], 'add a correction to src/data/siteChanges.ts with logHeading set');
  for (const h of linked) assert.ok(headings.includes(h!), `logHeading not found in change-log.md: ${h}`);
});

test('pages hit by a correction get a dated note from the byline', () => {
  const ami = correctionsFor('/guides/nyc-ami-housing-connect-explained/');
  assert.equal(ami.length, 1);
  assert.match(ami[0].title, /AMI/);
  assert.deepEqual(correctionsFor('/guides/nyc-40x-rent-rule/'), []);
});

test('editorial: a maintainer, and no reviewer unless one is fully named and dated', () => {
  assert.ok(MAINTAINER.name && /^https:\/\//.test(MAINTAINER.url));
  if (REVIEWER) {
    assert.ok(REVIEWER.name && REVIEWER.credential, 'a reviewer needs a name and a credential');
    assert.match(REVIEWER.reviewed, ISO);
  }
});
