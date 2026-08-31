# Deployment runbook

Getting from "I own a domain" to `russelllee.net/hype` serving a live Streamlit app.

Do these in order. Steps 1 to 4 get the site live on its own, which is Phase 0 of the
dashboard plan. Steps 5 to 8 attach the dashboard. You can stop after step 4 and come back.

## The shape of it

```
russelllee.net  ──▶ Cloudflare (DNS + Workers)
                     │
                     ├─ /          ─▶ Pages    (this repo, static HTML)
                     ├─ /gas       ─▶ Pages
                     └─ /hype*     ─▶ Worker   ─▶ Railway (Streamlit)
```

Cloudflare Pages serves files. Streamlit is a long lived Python process that holds a
websocket open per visitor. They cannot be one deployment, so a Worker route claims one
path and forwards it elsewhere. A Worker route takes precedence over Pages for matching
requests, which is the whole trick.

---

## 1. Push this repo to GitHub

```bash
cd russelllee-net
git init && git add -A
git commit -m "Static site for russelllee.net"
gh repo create russelllee-net --public --source=. --push
```

## 2. Connect Cloudflare Pages

Cloudflare dashboard → **Workers & Pages** → **Create** → **Pages** → **Connect to Git**,
pick `russelllee-net`.

Build settings, and these matter:

| Field | Value |
|---|---|
| Framework preset | None |
| Build command | *leave empty* |
| Build output directory | `public` |

There is no build step. It is plain HTML on purpose, so nothing in the toolchain can rot
between now and the next time you touch it.

Deploy. You get a `russelllee-net.pages.dev` URL. Confirm it loads.

## 3. Attach the domain

In the Pages project → **Custom domains** → **Set up a custom domain** → `russelllee.net`.
Repeat for `www.russelllee.net`.

Because the domain is already registered at Cloudflare, the DNS records are created for
you. No nameserver changes, no waiting on propagation beyond a minute or two.

## 4. Confirm

Open `https://russelllee.net`. You should see the landing page, and `/gas` and `/hype`
should both load their placeholder pages.

**Phase 0 of the dashboard plan is now done.** The `/hype` page you see is the fallback,
and it stays as the thing visitors get if the dashboard is ever down.

---

## 5. Deploy Streamlit to Railway

From the `hype-buyback-dashboard` repo, not this one.

Railway → **New Project** → **Deploy from GitHub repo** → `hype-buyback-dashboard`.

It detects Python and installs `requirements.txt`. `railway.json` supplies the start
command, which binds Railway's injected `$PORT`:

```
streamlit run app.py --server.port $PORT --server.address 0.0.0.0
```

Then **Settings** → **Networking** → **Generate Domain**. Copy the URL it gives you, which
looks like `https://hype-buyback-dashboard-production.up.railway.app`.

Check it directly: `https://<that-url>/hype/` should render the dashboard. Note the
trailing slash. Step 7 explains why.

Cost: 30 day trial, then $5/month Hobby. That buys always-on. Free tiers elsewhere sleep
after 15 minutes and take about a minute to wake, and a hiring manager clicking your link
is by definition traffic after a quiet period.

## 6. Point the Worker at it

In `worker/wrangler.toml`, replace the placeholder:

```toml
[vars]
ORIGIN = "https://hype-buyback-dashboard-production.up.railway.app"
```

No trailing slash.

## 7. Deploy the Worker

```bash
cd worker
npx wrangler login      # once
npx wrangler deploy
```

This publishes the Worker and registers the four routes in `wrangler.toml`: `/hype` and
`/hype/*`, on both the apex and `www`.

### What the Worker is actually solving

Three things, each verified in `tests/test_proxy_path.py` in the dashboard repo:

1. **Streamlit runs at `/hype`, not `/`.** That is `server.baseUrlPath = "hype"` in
   `.streamlit/config.toml`. The Worker forwards the path unchanged. If it stripped the
   prefix, nothing would resolve.

2. **Streamlit's asset paths are relative** (`./static/js/...`), so they inherit whatever
   directory the URL is in. From `/hype/` they resolve to `/hype/static/...`, which the
   Worker route catches. From `/hype` with no trailing slash they would resolve to
   `/static/...`, which would fall through to Pages and 404. Streamlit handles this by
   307-redirecting `/hype` to `/hype/`.

3. **That redirect points at the Railway host.** Left alone it would put
   `hype-buyback-dashboard-production.up.railway.app` in the visitor's address bar. The
   Worker rewrites the `Location` header back onto `russelllee.net`. That is the block at
   the bottom of `worker/src/index.js` and it is load bearing, not decoration.

The websocket at `/hype/_stcore/stream` passes straight through. Cloudflare Workers proxy
websockets natively as long as you return the `fetch()` response without rebuilding it,
which is why that early return exists.

## 8. Confirm

- `https://russelllee.net/hype` redirects to `/hype/` and renders the dashboard
- The address bar says `russelllee.net`, never `railway.app`
- Numbers appear rather than a permanent "Please wait..." (that message means the
  websocket did not connect)
- The nav still works and takes you back to the static pages

---

## When it breaks

**Page loads, then hangs on "Please wait..." forever.**
The websocket did not connect. Check `enableXsrfProtection = false` and
`enableCORS = false` are still set in `.streamlit/config.toml`. That is the usual cause
behind a reverse proxy, and it is why both are off deliberately.

**Blank page, console shows 404s for `/static/js/...`.**
The trailing slash redirect is not happening. Confirm `baseUrlPath = "hype"` is set and
that the Worker returns redirects rather than following them (`redirect: "manual"`).

**Address bar shows the Railway URL.**
The `Location` rewrite is not firing. Check `ORIGIN` in `wrangler.toml` exactly matches
the Railway host, no trailing slash, no path.

**`/hype` shows the placeholder page instead of the dashboard.**
The Worker route is not live. `npx wrangler deployments list` from `worker/`, and confirm
the routes are attached to the `russelllee.net` zone.

**Cloudflare 502 or the holding page.**
Railway is down or redeploying. The Worker serves a self-refreshing holding page instead
of a Cloudflare error screen, so this degrades quietly rather than looking broken.

## Local development

Run the dashboard with the same base path it uses in production, so path bugs surface on
your machine:

```bash
cd hype-buyback-dashboard
streamlit run app.py
# http://localhost:8501/hype/
```

The config file supplies `baseUrlPath`, so local and production behave identically.

Verify routing after any change to the config or the Worker:

```bash
python tests/test_proxy_path.py
```
