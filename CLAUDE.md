# Context for russelllee.net

Read this before changing anything. Several settings here look arbitrary and are not.

Last updated: 31 Aug 2026, at the handoff from a Cowork session into Claude Code.

## What this repo is

The personal site for russelllee.net. Plain HTML and one CSS file, no build step, no
dependencies. Deployed by Cloudflare Pages from `public/`.

It also contains a Cloudflare Worker (`worker/`) that routes `/hype` on this domain to a
Streamlit app hosted on Railway. **The Worker is inert until deployed.** Until then,
`public/hype.html` serves at `/hype` as a placeholder.

The Streamlit app lives in a separate repo, `hype-buyback-dashboard`, which is not set up
yet. The two share no code. This site only links to it.

## Owner

Russell Lee. Senior Financial Engineer, owns billing infrastructure and revenue
recognition across four entities. Job searching for analytics engineering and revenue
systems roles, and this site is the portfolio.

Three things that matter when working with him:

- **Never use em dashes.** He dislikes them strongly.
- **Lead with the answer.** Long preambles lose him.
- **Do not build several things at once.** He asked for this explicitly. Talk through the
  specific item, agree it, build that one thing, then stop and check in.

Frontend and web hosting are his stated weak spot. Explain routing and deploy mechanics
rather than assuming them. Everything data-side, SQL, Python, finance modelling, he does
not need explained.

---

## Where things actually stand

### Machine setup: done

| Thing | State |
|---|---|
| Homebrew | Installed, on PATH via `~/.zprofile` |
| `gh` CLI | Installed and authenticated. `gh auth status` confirmed |
| Git credentials | Configured through `gh auth login` over HTTPS, so pushes just work |
| Python | `python@3.12` installed. `python3` resolves to 3.12 via `/opt/homebrew/opt/python@3.12/libexec/bin` in `~/.zprofile`. Apple's 3.9 is untouched at `/usr/bin/python3` |

Python 3.10+ is a hard requirement. The source probe script in the dashboard repo uses
`X | None` union syntax that 3.9 cannot parse.

### Deployment: fully live end to end

| Thing | State |
|---|---|
| Domain russelllee.net | Registered at Cloudflare, live, serving the real site |
| This repo on GitHub | https://github.com/rujole13/russelllee-net |
| Cloudflare Pages project | **Git-connected**, `main` branch, output dir `public`. Old direct-upload project deleted |
| Dashboard repo | https://github.com/rujole13/hype-buyback-dashboard, Phase 1 shell (live tiles only) |
| Railway Streamlit app | Deployed, auto-redeploys on push to the dashboard repo's `main` |
| Worker route `/hype*` | Deployed (`hype-proxy`), `ORIGIN` points at the Railway app. Verified in a browser |

Workflow in both repos: branch, push, PR, squash merge, pull. `main` is production.

---

## Deploy steps 1 to 5: all completed, kept for reference

### 1. Create the GitHub repo

```bash
cd ~/Projects/russelllee-net
git init -b main
git add -A
git commit -m "Static site for russelllee.net"
gh repo create russelllee-net --public --source=. --push
```

Public was chosen deliberately: the repo holds only HTML, CSS and the Worker, and the only
personal details are his LinkedIn and `me@russelllee.net`, both already on the live site.

Changes nothing about what is live.

### 2. Create a NEW Cloudflare Pages project, connected to Git

**A direct-upload Pages project cannot be converted to Git integration.** Cloudflare's docs
are explicit: you must create a new project. Do not spend time looking for a convert button.

Workers & Pages → Create → Pages → Connect to Git → `russelllee-net`.

| Field | Value |
|---|---|
| Framework preset | None |
| Build command | *empty* |
| Build output directory | `public` |

There is deliberately no build step. Nothing in the toolchain can rot between visits.

### 3. Verify on the `*.pages.dev` URL before touching the domain

This step exists so that step 4 is the only moment the site is unreachable.

### 4. Move the custom domain

A custom domain attaches to one Pages project at a time. Remove `russelllee.net` from the
**old** project first, then add it to the **new** one. Same for `www` if configured.
Brief downtime, seconds to a minute.

### 5. Delete the old direct-upload project

So nobody, including future Russell, wonders which one is real.

### What is next

Deployment is finished. Remaining work is building the dashboard itself in
`hype-buyback-dashboard`: the Historical zone (dbt marts export committed by CI) and the
Scenario engine. After that, design the real landing page. One item at a time.

---

## Open questions

None currently.

Resolved: the current placeholder page is throwaway. The real landing page gets designed
after the Hyperliquid dashboard (`hype-buyback-dashboard`) is actually built, so the
portfolio page can speak to a finished project rather than a promise.

---

## The /hype routing, and why it is fragile

Not needed until the Railway deploy, but do not "tidy" any of it before then.

This was verified by running the real Streamlit app behind a real proxy
(`tests/test_proxy_path.py` in the dashboard repo, 14 checks, all passing). Do not change
any of the following without re-running it.

1. **Streamlit runs with `server.baseUrlPath = "hype"`.** It then serves at `/hype` and
   opens its websocket at `/hype/_stcore/stream`. Confirmed it does *not* answer at the
   root once set. The Worker forwards the path unchanged. Stripping the prefix breaks
   everything.

2. **Streamlit's asset paths are relative** (`./static/js/...`), not root-absolute. They
   inherit the directory from the URL. From `/hype/` they resolve correctly. From `/hype`
   with no trailing slash they resolve to `/static/...`, which falls through to Pages and
   404s. Streamlit handles this by 307-redirecting `/hype` to `/hype/`.

3. **That 307's `Location` header is absolute and names the Railway host.** Unhandled, the
   Railway URL appears in the visitor's address bar. The Worker rewrites `Location` back
   onto the public domain. That block at the bottom of `worker/src/index.js` is load
   bearing, not defensive.

Websockets pass through untouched. Cloudflare Workers proxy them natively as long as the
`fetch()` response is returned rather than rebuilt. Do not read or reconstruct that
response.

A Worker route takes precedence over Pages for matching paths. That is the entire
mechanism by which one path on a static site points at a Python server.

## Design

Dark base, one teal accent (`--accent: #4ee0c1`), tokens at the top of `public/style.css`.
The Streamlit app's theme in `.streamlit/config.toml` mirrors these values so the proxied
page does not look bolted on. Change one, change the other.

## Decisions already made, do not re-litigate

- **Streamlit, not a static dashboard.** He chose it deliberately for the work experience,
  knowing a static build would be cheaper and easier to style.
- **Path, not subdomain.** `russelllee.net/hype`, not `hype.russelllee.net`.
- **Railway at $5/month.** Render's free tier sleeps after 15 minutes with a ~1 minute
  cold start, which is exactly the state a hiring manager would find it in. Streamlit
  Community Cloud does not support custom domains at all.
- **Two repos**, because they deploy to different targets.
- **BigQuery is never queried at request time.** CI runs dbt and exports marts to a small
  committed file the app reads. Live tiles hit the Hyperliquid API directly, which is
  keyless. No service-account key ever goes on Railway.

## Background on the dashboard itself

Not needed to work on this repo, but useful if he starts talking about it.

Hyperliquid routes trading fees into an automated, price insensitive bid that buys HYPE
and burns it. The fee docs state the mechanism directly: the Assistance Fund system
address is `0xfefefefefefefefefefefefefefefefefefefefe`, it converts fees to HYPE as part
of L1 execution, and that HYPE is burned out of circulating and total supply. A validator
vote in December 2025 formalised the burn.

The dashboard models how much supply that removes and what it implies for market cap. It
is positioned as a revenue recognition and cash flow model applied to a protocol, not a
crypto price chart. That framing is the point, since the audience is hiring managers for
analytics engineering roles.
