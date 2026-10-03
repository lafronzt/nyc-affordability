// Fails the build if any page ships an inline script that the Content-Security-Policy
// in public/_headers would block. The CSP allows inline scripts only by exact SHA-256
// hash, so an inlined script that changes stops running in production while working
// fine under `astro dev`/`preview` and local static servers (which send no CSP).
// JSON-LD blocks are data, not script, and aren't subject to script-src.
import { readFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const headers = await readFile(join(root, 'public/_headers'), 'utf8');
const csp = headers.match(/Content-Security-Policy:\s*(.+)/)?.[1] ?? '';
const scriptSrc = csp.match(/script-src([^;]*)/)?.[1] ?? '';
const allowed = new Set([...scriptSrc.matchAll(/'sha256-([^']+)'/g)].map((m) => m[1]));
const allowsAnyInline = /'unsafe-inline'/.test(scriptSrc) && allowed.size === 0;

async function htmlFiles(dir) {
  const out = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...(await htmlFiles(p)));
    else if (e.name.endsWith('.html')) out.push(p);
  }
  return out;
}

const blocked = new Map();
if (!allowsAnyInline) {
  for (const file of await htmlFiles(join(root, 'dist'))) {
    const html = await readFile(file, 'utf8');
    for (const [, attrs, body] of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)) {
      if (/\bsrc=/.test(attrs) || /application\/(ld\+)?json/.test(attrs) || !body.trim()) continue;
      const hash = createHash('sha256').update(body).digest('base64');
      if (allowed.has(hash)) continue;
      if (!blocked.has(hash)) blocked.set(hash, { pages: 0, example: file.slice(root.length), start: body.slice(0, 80) });
      blocked.get(hash).pages++;
    }
  }
}

if (blocked.size) {
  const lines = [...blocked].map(([h, b]) => `  sha256-${h} on ${b.pages} page(s), e.g. ${b.example}: ${JSON.stringify(b.start)}…`);
  throw new Error(
    'Inline <script> blocks that the CSP in public/_headers would block in production:\n' + lines.join('\n') +
    '\nMove the script to an external file (Astro emits processed scripts to /_astro/ when vite.build.assetsInlineLimit is 0), ' +
    'or, for a deliberate inline script, add its hash to script-src.'
  );
}
console.log(`check-csp: no inline scripts outside the CSP allow-list (${allowed.size} hash${allowed.size === 1 ? '' : 'es'} listed).`);
