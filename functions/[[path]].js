/**
 * Cloudflare Worker / Pages Function — multi-domain host-based routing
 *
 * Hub domain (landing page):
 *   www.nyc-affordability.com      → / (pass through as-is)
 *   nyc-affordability.com          → 301 redirect to www.nyc-affordability.com (same path)
 *
 * Legacy calculator domains (canonical redirects):
 *   nyc-co-op-affordability.com    → https://www.nyc-affordability.com/coop/
 *
 * Default Pages domain / unknown hosts: pass through as-is.
 * Calculator paths are served under the primary domain:
 *   www.nyc-affordability.com/coop/
 *   www.nyc-affordability.com/condo/
 *   www.nyc-affordability.com/rent/
 *
 * To add a new domain:
 *   1. Add an entry to DOMAIN_ROUTES below (both apex and www), or to
 *      DOMAIN_REDIRECTS when retiring a standalone calculator domain.
 *      Use '' as the prefix for hub/root domains; use '/slug' for future section domains.
 *   2. Add the custom domain to the Worker route/custom domain setup.
 *   3. Point the domain's DNS to the Worker.
 */

const CANONICAL_HOST = 'www.nyc-affordability.com';

// Apex hosts that should 301 to the canonical www host (same path/query), rather
// than being served directly — keeps a single canonical origin for SEO.
const APEX_TO_WWW_REDIRECTS = new Set([
  'nyc-affordability.com',
]);

const DOMAIN_REDIRECTS = {
  'nyc-co-op-affordability.com':     '/coop',
  'www.nyc-co-op-affordability.com': '/coop',
};

// '' prefix = hub domain, serve root as-is.
const DOMAIN_ROUTES = {
  'www.nyc-affordability.com':       '',
};

export default {
  async fetch(request, env) {
    return handleRequest(request, env);
  },
};

export async function onRequest(context) {
  return handleRequest(context.request, context.env);
}

async function handleRequest(request, env) {
  const url     = new URL(request.url);
  const host    = url.hostname.toLowerCase();
  const reqPath = url.pathname;

  if (APEX_TO_WWW_REDIRECTS.has(host)) {
    const target = new URL(url);
    target.protocol = 'https:';
    target.hostname = CANONICAL_HOST;
    return Response.redirect(target.toString(), 301);
  }

  const prefix = DOMAIN_ROUTES[host];
  const redirectPrefix = DOMAIN_REDIRECTS[host];

  if (redirectPrefix) {
    return migrateLocalStorageThenRedirect(request, url, redirectPrefix);
  }

  // Hub domain or unrecognised host — serve files as-is from root.
  if (prefix === '' || prefix === undefined) {
    return env.ASSETS.fetch(request);
  }

  // Future section domain — rewrite to subdirectory with full path preservation.
  // / on the custom domain → /prefix/
  // /some/path            → /prefix/some/path  (fallback → /prefix/)
  // Clone the URL so method, headers, and query params are all preserved.
  //
  // Strip any duplicate prefix so /slug/foo on a section domain does not
  // become /slug/slug/foo.
  const strippedPath = reqPath.startsWith(prefix + '/') ? reqPath.slice(prefix.length) : reqPath;

  const rewrittenUrl = new URL(url);
  rewrittenUrl.pathname = strippedPath === '/' ? prefix + '/' : prefix + strippedPath;

  const res = await env.ASSETS.fetch(new Request(rewrittenUrl.toString(), request));

  // Only fall back to index.html for navigation requests — assets (CSS/JS/images)
  // that are genuinely missing should return 404, not the app shell.
  const isNavRequest = !rewrittenUrl.pathname.match(/\.[^/]+$/);
  if (res.status === 404 && isNavRequest) {
    const fallbackUrl = new URL(url);
    fallbackUrl.pathname = prefix + '/';
    return env.ASSETS.fetch(new Request(fallbackUrl.toString(), request));
  }
  return res;
}

function buildCanonicalUrl(url, prefix) {
  const target = new URL(url);
  target.protocol = 'https:';
  target.hostname = CANONICAL_HOST;

  const reqPath = url.pathname;
  const strippedPath =
    reqPath === prefix ? '/' :
    reqPath.startsWith(prefix + '/') ? reqPath.slice(prefix.length) :
    reqPath;
  target.pathname = strippedPath === '/' ? prefix + '/' : prefix + strippedPath;
  return target;
}

function migrateLocalStorageThenRedirect(request, url, prefix) {
  const target = buildCanonicalUrl(url, prefix);
  const accept = request.headers.get('accept') || '';
  const isNavigation = request.method === 'GET' && accept.includes('text/html');

  if (!isNavigation) {
    return Response.redirect(target.toString(), 301);
  }

  return new Response(renderStorageMigrationPage(target), {
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'no-store',
      'x-robots-tag': 'noindex',
      'x-content-type-options': 'nosniff',
      'referrer-policy': 'strict-origin-when-cross-origin',
      'x-frame-options': 'DENY',
    },
  });
}

// Co-op calculator settings that may travel in the migration URL. Keep in
// sync with SAFE_COOP_INPUT_KEYS in src/lib/migrationPayload.ts
// (test/migrationPayload.test.ts checks). Income, debts and account
// balances never go in a URL: it lands in the address bar and history.
const SAFE_COOP_INPUT_KEYS = [
  'mtgRate', 'loanTerm', 'dpPct', 'reserveMo', 'maxDti', 'monthlyMaint',
  'fcAtty', 'fcBankAtty', 'fcCoop', 'fcMoveIn', 'fcOther', 'varPct',
];

function renderStorageMigrationPage(target) {
  const canonical = escapeHtml(target.toString());
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<link rel="canonical" href="${canonical}">
<title>Moving to NYC Affordability</title>
<style>
body{font-family:system-ui,-apple-system,Segoe UI,Arial,sans-serif;margin:0;min-height:100vh;display:grid;place-items:center;background:#f3f4f6;color:#111827}
main{max-width:520px;padding:32px 20px;text-align:center}
a{color:#2563eb}
#personal{text-align:left;background:#fff;border:1px solid #e2e4e9;border-radius:10px;padding:20px 22px;margin-top:8px}
#personal h2{font-size:17px;margin:0 0 8px}
#personal p{font-size:14px;line-height:1.6;color:#4b5563;margin:0 0 10px}
#saved{font-size:14px;line-height:1.7;margin:0 0 14px;padding-left:20px}
.actions{display:flex;flex-wrap:wrap;gap:10px;align-items:center}
button{font:inherit;font-size:14px;font-weight:600;padding:9px 14px;border-radius:8px;border:1px solid #2563eb;background:#2563eb;color:#fff;cursor:pointer}
</style>
</head>
<body>
<main>
<h1 id="heading">Opening the co-op calculator...</h1>
<p id="lede">Your saved settings are moving to the new NYC Affordability address in this browser.</p>
<section id="personal" hidden>
<h2>Your saved numbers stay here</h2>
<p>This browser saved some personal figures on the old address. We don't put income, debts or account balances in a web address, because addresses end up in your browser history. Your calculator settings (rate, down payment, fees) will carry over; re-enter these on the new page:</p>
<ul id="saved"></ul>
<p>Or download them as a file. It stays on your device; keep it private.</p>
<div class="actions"><button type="button" id="download">Download my saved data</button></div>
</section>
<p><a id="continue" href="${canonical}">Continue to the co-op calculator</a></p>
</main>
<script>
(function () {
  var target = ${JSON.stringify(target.toString())};
  var SAFE = ${JSON.stringify(SAFE_COOP_INPUT_KEYS)};
  var stored = {};
  ['nyc_coop_inputs', 'nyc_shared_profile'].forEach(function (key) {
    try { var v = localStorage.getItem(key); if (v !== null) stored[key] = v; } catch (e) {}
  });
  function parse(s) { try { return JSON.parse(s); } catch (e) { return null; } }
  var coop = parse(stored.nyc_coop_inputs) || {};
  var profile = parse(stored.nyc_shared_profile) || {};
  var inputs = coop.inputs || {};

  // Only allowlisted calculator settings go in the link.
  var safe = {};
  SAFE.forEach(function (k) {
    var v = inputs[k];
    var n = typeof v === 'number' ? v : (typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN);
    if (isFinite(n)) safe[k] = n;
  });
  try {
    if (Object.keys(safe).length) {
      var payload = { nyc_coop_inputs: JSON.stringify({ inputs: safe }) };
      var bytes = new TextEncoder().encode(JSON.stringify(payload));
      var binary = '';
      for (var i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
      var url = new URL(target);
      url.hash = 'migrate-local-storage=' + encodeURIComponent(btoa(binary));
      target = url.toString();
    }
  } catch (e) {}
  document.getElementById('continue').href = target;

  // Anything personal? Show it here instead of sending it on.
  function money(n) { var x = Number(n); return isFinite(x) ? '$' + Math.round(x).toLocaleString('en-US') : null; }
  var items = [];
  var income = inputs.annualIncome != null && inputs.annualIncome !== '' ? inputs.annualIncome : profile.annualIncome;
  var debts = inputs.otherDebts != null && inputs.otherDebts !== '' ? inputs.otherDebts : profile.otherDebts;
  if (money(income) && Number(income) > 0) items.push('Annual income: ' + money(income));
  if (money(debts) && Number(debts) > 0) items.push('Monthly debt payments: ' + money(debts));
  var accounts = Array.isArray(coop.accounts) && coop.accounts.length ? coop.accounts : (Array.isArray(profile.accounts) ? profile.accounts : []);
  accounts.forEach(function (a) {
    if (!a) return;
    var bal = money(a.balance);
    if (bal) items.push((a.name ? String(a.name) : 'Account') + ': ' + bal);
  });

  if (!items.length) { location.replace(target); return; }

  document.getElementById('heading').textContent = 'Moving to the new address';
  document.getElementById('lede').textContent = 'One step before you go.';
  var list = document.getElementById('saved');
  items.forEach(function (t) { var li = document.createElement('li'); li.textContent = t; list.appendChild(li); });
  document.getElementById('personal').hidden = false;
  document.getElementById('download').addEventListener('click', function () {
    var data = { exported: new Date().toISOString(), from: location.hostname, nyc_coop_inputs: coop, nyc_shared_profile: profile };
    var blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'nyc-co-op-saved-data.json';
    document.body.appendChild(a); a.click(); a.remove();
  });
}());
</script>
</body>
</html>`;
}

function escapeHtml(value) {
  return value.replace(/[&<>"']/g, char => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[char]);
}
