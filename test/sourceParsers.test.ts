import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parsePmmsCsv, parseHpdAmiPage, setInputValue } from '../src/lib/sourceParsers.ts';

// The scheduled update jobs parse these sources. Fixtures are trimmed copies
// of the real files (fetched 2026-10-04), so a parser change is tested
// against the actual formats, and a format change fails loudly.

const fixture = (f: string) => readFileSync(new URL(`./fixtures/${f}`, import.meta.url), 'utf8');

test('PMMS: latest week with a 30-year rate, ISO date', () => {
  assert.deepEqual(parsePmmsCsv(fixture('pmms-history-tail.csv')), { date: '2026-10-01', rate30: 7.28 });
});

test('PMMS: an earlier week parses to the figure published for it', () => {
  // 6.95% for the week of Sep 17, 2026: the rate the site default was set from (PR #58).
  const lines = fixture('pmms-history-tail.csv').trim().split('\n');
  const upTo917 = lines.slice(0, lines.findIndex((l) => l.startsWith('9/17/2026')) + 1).join('\n');
  assert.deepEqual(parsePmmsCsv(upTo917), { date: '2026-09-17', rate30: 6.95 });
});

test('PMMS: skips trailing rows without a 30-year rate, rejects a changed header', () => {
  assert.equal(parsePmmsCsv('date,pmms30\n1/2/2026,6.5\n1/9/2026,\n').date, '2026-01-02');
  assert.throws(() => parsePmmsCsv('week,rate\n1/2/2026,6.5\n'), /header changed/);
  assert.throws(() => parsePmmsCsv('date,pmms30\n1/2/2026,65\n'), /out of range/);
});

test('HPD AMI: the saved 2026 chart parses to HPD\'s published figures', () => {
  // Literal values, not the live table, so this keeps passing after a yearly update.
  assert.deepEqual(parseHpdAmiPage(fixture('hpd-ami-2026.html')), {
    year: 2026,
    base: { 1: 118_800, 2: 135_700, 3: 152_700, 4: 169_600, 5: 183_200, 6: 196_800, 7: 210_400, 8: 223_900 },
  });
});

test('HPD AMI: missing chart or year fails loudly', () => {
  assert.throws(() => parseHpdAmiPage('<p>nothing here</p>'), /year sentence/);
  assert.throws(() => parseHpdAmiPage('<p>The 2027 AMI for the New York City region is $1</p><p>Find your family size in the left column.</p>'), /chart header/);
});

test('setInputValue changes only that input\'s value', () => {
  const src = '<input type="number" id="mtg-rate" value="6.95" min="0">\n<input id="other" value="6.95">';
  const r = setInputValue(src, 'mtg-rate', '7.28');
  assert.equal(r.changed, true);
  assert.equal(r.src, '<input type="number" id="mtg-rate" value="7.28" min="0">\n<input id="other" value="6.95">');
  assert.equal(setInputValue(src, 'missing', '1').changed, false);
});
