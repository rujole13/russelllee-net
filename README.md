# russelllee.net

Personal site. Plain HTML and one CSS file, deployed on Cloudflare Pages, plus a Worker
that routes `/hype` to a Streamlit app running on Railway.

```
public/          the site itself, deployed by Cloudflare Pages
  index.html     landing
  gas.html       natural gas hedge tracker (placeholder)
  hype.html      fallback shown at /hype until the Worker route is live, and
                 whenever the dashboard origin is down
  style.css      the whole design system, such as it is
worker/          Cloudflare Worker proxying /hype/* to the Streamlit origin
DEPLOY.md        the runbook, in order
```

No build step and no dependencies for the site. The only toolchain is `wrangler`, and only
for the Worker.

## Projects it links to

- **HYPE Buyback Model** at `/hype` — [hype-buyback-dashboard](https://github.com/russelllee/hype-buyback-dashboard)
- **Natural Gas Hedge** at `/gas` — not started

## Deploying

See [DEPLOY.md](DEPLOY.md). Short version: Pages builds `public/` with no build command,
then `cd worker && npx wrangler deploy`.
