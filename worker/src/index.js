/**
 * russelllee.net/hype/*  ->  Streamlit on Railway
 *
 * A transparent reverse proxy. The only reason this Worker exists is that Cloudflare
 * Pages serves static files and Streamlit is a stateful Python process, so one path on
 * the domain has to be routed somewhere else.
 *
 * Two things make or break it:
 *
 *   1. The path is forwarded UNCHANGED. Streamlit runs with server.baseUrlPath = "hype",
 *      so it already expects to live under /hype and generates its own asset and
 *      websocket URLs accordingly. Stripping the prefix here would break every one of them.
 *
 *   2. The websocket upgrade is passed straight through. Streamlit holds an open
 *      connection at /hype/_stcore/stream for the entire session; without it the page
 *      renders once and then sits there frozen. Returning fetch()'s response directly
 *      preserves the 101 and the socket. Do not read or rebuild the response.
 */

const FALLBACK_HTML = `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>HYPE Buyback Model — starting up</title>
<link rel="stylesheet" href="/style.css">
<meta http-equiv="refresh" content="15">
</head><body>
<header class="site">
  <a class="wordmark" href="/">Russell&nbsp;Lee</a>
  <nav><a href="/">About</a><a href="/gas">Gas Hedge</a><a href="/hype" aria-current="page">HYPE Buybacks</a></nav>
</header>
<main><section class="status">
  <h1>The dashboard is waking up</h1>
  <p>The model server did not respond. This page refreshes itself every 15 seconds.</p>
  <p>If it persists, the pipeline and its documentation are on
     <a href="https://github.com/rujole13/hype-buyback-dashboard">GitHub</a>.</p>
</section></main>
</body></html>`;

export default {
  async fetch(request, env) {
    if (!env.ORIGIN) {
      return new Response("ORIGIN is not configured on this Worker.", { status: 500 });
    }

    const incoming = new URL(request.url);
    const origin = new URL(env.ORIGIN);

    // Same path, same query. Only the host changes.
    const target = new URL(incoming.pathname + incoming.search, origin);

    const proxied = new Request(target, request);

    // Let Streamlit build absolute URLs against the public hostname rather than Railway's.
    proxied.headers.set("X-Forwarded-Host", incoming.host);
    proxied.headers.set("X-Forwarded-Proto", incoming.protocol.replace(":", ""));
    proxied.headers.set("X-Real-IP", request.headers.get("CF-Connecting-IP") || "");

    let response;
    try {
      response = await fetch(proxied, { redirect: "manual" });
    } catch (err) {
      return new Response(FALLBACK_HTML, {
        status: 502,
        headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
      });
    }

    // A websocket upgrade must be handed back exactly as received, socket attached.
    if (response.status === 101 || response.webSocket) {
      return response;
    }

    // Origin is asleep or unhealthy. Show the holding page, not a Cloudflare error screen.
    if (response.status >= 502 && response.status <= 504) {
      return new Response(FALLBACK_HTML, {
        status: 503,
        headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
      });
    }

    const out = new Response(response.body, response);

    // Rewrite any redirect that points back at the Railway host onto the public domain,
    // so the address bar never leaks the origin.
    const location = out.headers.get("Location");
    if (location) {
      try {
        const dest = new URL(location, target);
        if (dest.host === origin.host) {
          dest.protocol = incoming.protocol;
          dest.host = incoming.host;
          out.headers.set("Location", dest.toString());
        }
      } catch {
        // Relative or malformed Location, leave it alone.
      }
    }

    // The app is a public read-only dashboard, so let it be framed only by this site.
    out.headers.set("Content-Security-Policy", `frame-ancestors 'self' https://${incoming.host}`);
    out.headers.set("X-Content-Type-Options", "nosniff");
    out.headers.delete("X-Frame-Options");

    return out;
  },
};
