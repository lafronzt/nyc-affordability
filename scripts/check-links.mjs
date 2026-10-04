#!/usr/bin/env node
/* ============================================================
   External link check
   ============================================================
   Finds every https:// URL in src/ (pages, content, data, scripts) and
   checks it still resolves. Run: `npm run check-links`. The monthly
   workflow (.github/workflows/check-links.yml) runs it and opens an issue
   listing anything broken; it never edits the site.

   A link is BROKEN when, after redirects, it returns 404 or 410, or
   lands on a "Page Moved" / "Page Not Found" page that answers 200 (NYC
   DOF does this). Anything else that isn't a 2xx (403, 429, 5xx, a
   timeout) is UNVERIFIED: many sites block automated requests, so those
   are listed for a person to check, not called broken.

   Uses curl rather than fetch: it's on every CI runner, and it honors
   HTTPS_PROXY the same way locally and in CI.

   Options:
     --report <file>   also write the Markdown report to <file>
     --strict          exit 1 when anything is broken
   ============================================================ */

import { readdirSync, readFileSync, statSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execFile } from 'node:child_process';

const ROOT = new URL('..', import.meta.url).pathname;
const args = process.argv.slice(2);
const reportPath = args.includes('--report') ? args[args.indexOf('--report') + 1] : null;
const strict = args.includes('--strict');

// Links that aren't pages to check: our own site, schema.org vocab, CDNs.
const SKIP = [
  /^https:\/\/(www\.)?nyc-affordability\.com/,
  /^https:\/\/(www\.)?nyc-co-op-affordability\.com/,
  /^https:\/\/schema\.org/,
  /^https:\/\/pagead2\.googlesyndication\.com/,
  /^https:\/\/static\.cloudflareinsights\.com/,
  /^https:\/\/fonts\.(googleapis|gstatic)\.com/,
];
const MOVED_TITLE = /page (has )?moved|page not found|404/i;

function files(dir) {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? files(p) : /\.(astro|md|mdx|ts|mjs|js)$/.test(n) ? [p] : [];
  });
}

/** url -> files that use it */
function collect() {
  const found = new Map();
  for (const f of files(join(ROOT, 'src'))) {
    for (const m of readFileSync(f, 'utf8').matchAll(/https:\/\/[^\s"'`<>)\]\\]+/g)) {
      const url = m[0].replace(/[.,;:]+$/, '');
      if (url.includes('${') || url.includes('{') || SKIP.some((r) => r.test(url))) continue;
      if (!found.has(url)) found.set(url, new Set());
      found.get(url).add(f.slice(ROOT.length));
    }
  }
  return found;
}

const tmp = mkdtempSync(join(tmpdir(), 'links-'));
let n = 0;

function check(url) {
  const out = join(tmp, `${n++}.html`);
  return new Promise((resolve) => {
    execFile('curl', [
      // First 64 KB is enough for the status and <title>; servers that
      // honor ranges answer 206, which counts as ok. A descriptive
      // User-Agent gets 403s from nyc.gov's bot filter, so use a plain one.
      '-sS', '-L', '--max-time', '25', '-r', '0-65535', '-o', out, '-w', '%{http_code}',
      '-A', 'Mozilla/5.0',
      url,
    ], (err, stdout, stderr) => {
      const code = Number(stdout) || 0;
      let title = '';
      try { title = (readFileSync(out, 'utf8').match(/<title[^>]*>([^<]*)/i)?.[1] ?? '').trim(); } catch { /* no body */ }
      let status;
      if (code === 404 || code === 410) status = 'broken';
      else if (code >= 200 && code < 300) status = MOVED_TITLE.test(title) ? 'broken' : 'ok';
      else status = 'unverified';
      resolve({ url, code, title, status, error: err && !code ? (String(stderr).trim().split('\n')[0] || 'no response') : '' });
    });
  });
}

async function pool(items, size, fn) {
  const out = [];
  let i = 0;
  await Promise.all(Array.from({ length: size }, async () => {
    while (i < items.length) { const k = i++; out[k] = await fn(items[k]); }
  }));
  return out;
}

const links = collect();
const results = await pool([...links.keys()].sort(), 6, check);
rmSync(tmp, { recursive: true, force: true });

const broken = results.filter((r) => r.status === 'broken');
const unverified = results.filter((r) => r.status === 'unverified');
const line = (r) => `- ${r.url} — ${r.code || 'no response'}${r.title ? ` "${r.title}"` : ''}${r.error ? ` (${r.error})` : ''}\n  - used in: ${[...links.get(r.url)].map((f) => `\`${f}\``).join(', ')}`;

const report = [
  `Checked ${results.length} external links in \`src/\`: ${results.length - broken.length - unverified.length} ok, ${broken.length} broken, ${unverified.length} unverified.`,
  '',
  broken.length ? `### Broken (404, 410, or a "page moved" page)\n\n${broken.map(line).join('\n')}` : '### Broken\n\nNone.',
  '',
  unverified.length ? `### Unverified (blocked, rate-limited, server error, or timed out; check by hand)\n\n${unverified.map(line).join('\n')}` : '',
].join('\n');

console.log(report);
if (reportPath) writeFileSync(reportPath, report);
if (strict && broken.length) process.exit(1);
