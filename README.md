# What Claude Code Actually Built Here

A case-study single-pager documenting the real history of this repo:
an animated terminal replaying a real session, the actual `git log`,
a real diff from a real production bug, and the real deploy pipeline.
Static HTML/CSS/JS, containerized with nginx for deployment on
[Coolify](https://coolify.io).

## Structure

```
index.html      Single-page site (hero terminal, capabilities, history, fix.diff, deploy.sh)
css/styles.css  Styles
js/main.js      Mobile nav, scroll reveal, terminal typewriter, tab scroll-spy
assets/         SVG mark / favicon (plus leftover images from a previous
                 version of this site — no longer referenced)
quote/          Internal PS quote builder tool (see below), served at /quote/
auth/htpasswd   Basic-auth credentials protecting /quote/ (not in web root)
Dockerfile      nginx:alpine image serving the static files
nginx.conf      nginx server config (gzip, cache headers, IPv4 + IPv6 listeners,
                 basic auth on /quote/)
docker-compose.yml
```

## PS Quote Builder (`/quote/`)

A multi-line professional-services quote calculator for internal use, ported
from the FY27 PS Quote Excel workbook. Pick a service grade, coverage type
(standard/evening-Saturday/Sunday-holiday) and day count per line item; cost,
sell price and margin are computed automatically per line and totalled by
service grade. State autosaves to the browser's `localStorage`; use "Print /
Save PDF" to generate a clean quote document.

It's plain HTML/CSS/JS — no build step, no framework, consistent with the
rest of this repo.

**Access control**: `/quote/` is protected by HTTP basic auth (`auth_basic`
in `nginx.conf`, credentials in `auth/htpasswd`) because it embeds Roc
Technologies' real day rates, cost, and margin data. The `^~` prefix modifier
on that nginx location is deliberate — it makes sure `quote.js`/`quote.css`
(which contain the rate table) stay behind auth too, rather than being
served unauthenticated by the static-asset caching rule below it.

Current login: username `psquote`. The password was generated randomly at
build time — ask whoever set this up, or regenerate it:

```bash
NEWPASS=$(openssl rand -base64 18 | tr -d '=+/' | cut -c1-20)
echo "psquote:$(openssl passwd -apr1 "$NEWPASS")" > auth/htpasswd
echo "New password: $NEWPASS"
```

**Source data**: the original `.xlsx` workbook this was ported from contains
full internal cost/margin detail across many roles and is intentionally
gitignored (`*.xlsx`) — never commit it. Only the rates needed by the tool
are embedded in `quote/quote.js`.

## Local preview

No build step required. Either open `index.html` directly in a browser, or
serve it locally:

```bash
python3 -m http.server 8080
# or
npx serve .
```

Then visit `http://localhost:8080`.

To test the production container:

```bash
docker compose up --build
# visit http://localhost:3000
```

## Deploying on Coolify

1. Push this repository to your git remote (already configured as `origin`).
2. In Coolify, create a new **Resource → Application** and point it at this
   repository/branch.
3. Coolify will detect the `Dockerfile` at the repo root — choose the
   **Dockerfile** build pack (or **Docker Compose**, pointing at
   `docker-compose.yml`).
4. Set **Ports Exposes** to `80` (container listens on 80 via nginx) —
   this must be exactly `80`, not left as Coolify's default `3000`.
5. Attach your domain and deploy.

Every push to the tracked branch can trigger an automatic redeploy if you
enable Coolify's webhook/auto-deploy for this app.
