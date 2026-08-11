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
main{max-width:480px;padding:32px;text-align:center}
a{color:#2563eb}
</style>
</head>
<body>
<main>
<h1>Opening the co-op calculator...</h1>
<p>Your saved inputs are moving to the new NYC Affordability URL in this browser.</p>
<p><a id="fallback" href="${canonical}">Continue to the co-op calculator</a></p>
</main>
<script>
(function () {
  var target = ${JSON.stringify(target.toString())};
  var keys = ['nyc_coop_inputs', 'nyc_shared_profile'];
  var payload = {};

  function encodeUtf8Base64(value) {
    var bytes = new TextEncoder().encode(value);
    var binary = '';
    var chunkSize = 0x8000;
    for (var i = 0; i < bytes.length; i += chunkSize) {
      binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunkSize));
    }
    return btoa(binary);
  }

  keys.forEach(function (key) {
    try {
      var value = localStorage.getItem(key);
      if (value !== null) payload[key] = value;
    } catch (e) {}
  });
  try {
    if (Object.keys(payload).length) {
      var encoded = encodeUtf8Base64(JSON.stringify(payload));
      var targetUrl = new URL(target);
      targetUrl.hash = 'migrate-local-storage=' + encodeURIComponent(encoded);
      target = targetUrl.toString();
    }
  } catch (e) {}
  location.replace(target);
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
