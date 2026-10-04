/* Helpers shared by the scheduled data-update scripts. Run with
   `node --experimental-strip-types`. They edit files in the checkout and
   write a Markdown report; the workflow decides whether to open a PR. */
import { execSync } from 'node:child_process';
import { appendFileSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

export const UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36 nyc-affordability-data-check';

/** Fetch a source. Set `envFile` (e.g. PMMS_SOURCE_FILE) to read a saved copy instead, for local dry runs. */
export async function fetchText(url: string, envFile?: string): Promise<string> {
  const local = envFile ? process.env[envFile] : undefined;
  if (local) { console.log(`Reading ${url} from ${local}`); return readFileSync(local, 'utf8'); }
  const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: '*/*' } });
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return res.text();
}

/** Tell the workflow what happened (no-op outside GitHub Actions). */
export function setOutput(name: string, value: string) {
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `${name}=${value}\n`);
  console.log(`${name}=${value}`);
}

/** Lines under src/ that still contain `needle`, as "path:line: text". */
export function findMentions(needle: string, skip: string[] = []): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const f of readdirSync(dir)) {
      const p = join(dir, f);
      if (statSync(p).isDirectory()) { walk(p); continue; }
      if (!/\.(astro|ts|md|mjs)$/.test(f) || skip.includes(p)) continue;
      readFileSync(p, 'utf8').split('\n').forEach((line, i) => {
        if (line.includes(needle)) out.push(`${p}:${i + 1}: ${line.trim().slice(0, 160)}`);
      });
    }
  };
  walk('src');
  return out;
}

/** Run the test suite; returns pass/fail counts and the failure messages. */
export function runTests(): { pass: number; fail: number; failures: string } {
  let output = '';
  try {
    output = execSync('npm test 2>&1', { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  } catch (e) {
    output = (e as { stdout?: string }).stdout ?? String(e);
  }
  const pass = Number(/^# pass (\d+)/m.exec(output)?.[1] ?? 0);
  const fail = Number(/^# fail (\d+)/m.exec(output)?.[1] ?? 0);
  // Keep the useful part: each failing test's name and assertion message.
  const failures = output.split('\n')
    .filter((l) => /^not ok|^\s+error: |out of date|Expected:|^\s+- /.test(l))
    .join('\n')
    .slice(0, 50_000);
  return { pass, fail, failures };
}
