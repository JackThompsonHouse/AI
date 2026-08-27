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
api/            Backend for the quote builder - Node/Express + SQLite,
                 served internally (not exposed to the host), reached via
                 nginx's /quote/api/ proxy
auth/htpasswd   Basic-auth credentials protecting /quote/ and /quote/api/
                 (not in web root)
Dockerfile      nginx:alpine image serving the static files (the "web" service)
nginx.conf      nginx server config (gzip, cache headers, IPv4 + IPv6 listeners,
                 basic auth + API reverse proxy on /quote/)
docker-compose.yaml   Two services - web (nginx) and api (Node/SQLite) - plus
                 a named volume so saved quotes survive redeploys
```

## PS Quote Builder (`/quote/`)

A multi-line professional-services quote calculator for internal use, ported
from the FY27 PS Quote Excel workbook. Pick a service grade, coverage type
(standard/evening-Saturday/Sunday-holiday) and day count per line item; cost,
sell price and margin are computed automatically per line and totalled by
service grade.

- **Save** stores the quote server-side (via `api/`) and switches to a
  compact read-only summary view of the line items — useful once a quote is
  more or less final and you don't want to scroll a wall of edit cards.
  **Edit** switches back to the full editable view; saving again updates the
  same record rather than creating a duplicate.
- **My quotes** lists everything saved server-side (customer, updated time,
  total sell) so a quote started on one device can be picked up on another.
- The browser's `localStorage` still autosaves the in-progress draft on top
  of this, purely as a same-device safety net against an accidental tab
  close before you hit Save.
- **Export CSV** / **Print / Save PDF** work on whatever's currently loaded,
  same as before.

It's plain HTML/CSS/JS on the frontend — no build step, no framework,
consistent with the rest of this repo. The backend (`api/`) is a small
Express app; quotes are stored as JSON blobs in SQLite (`better-sqlite3`)
rather than a normalized schema, since the frontend already owns the shape
of a quote and there's no need to duplicate that server-side.

**Access control**: `/quote/` and `/quote/api/` are both protected by HTTP
basic auth (`auth_basic` in `nginx.conf`, credentials in `auth/htpasswd`)
because they deal with Roc Technologies' real day rates, cost, and margin
data. The `^~` prefix modifier on those nginx locations is deliberate — it
makes sure `quote.js`/`quote.css` (which contain the rate table) and the API
both stay behind auth, rather than being served unauthenticated by the
static-asset caching rule further down the file. `/quote/api/` is listed
before `/quote/` so nginx's longest-prefix match routes API calls to the
backend instead of falling into the static file handler.

Current login: username `psquote`. The password was generated randomly at
build time — ask whoever set this up, or regenerate it:

```bash
NEWPASS=$(openssl rand -base64 18 | tr -d '=+/' | cut -c1-20)
echo "psquote:$(openssl passwd -apr1 "$NEWPASS")" > auth/htpasswd
echo "New password: $NEWPASS"
```

**Data persistence**: saved quotes live in a SQLite file at `/data/quotes.db`
inside the `api` container, backed by the `quotes-data` named volume in
`docker-compose.yaml`. If that volume isn't preserved across deploys (e.g. a
Coolify configuration that recreates volumes from scratch), saved quotes
will be lost on redeploy — worth confirming the volume persists after your
first deploy by saving a test quote, redeploying, and checking it's still
in **My quotes**.

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

This app now has two services (`web` + `api`) and a named volume, so it
**must** be deployed via the **Docker Compose** build pack pointing at
`docker-compose.yaml` — the plain Dockerfile build pack only builds `web` and
won't start the API backend at all, breaking Save/My quotes.

1. Push this repository to your git remote (already configured as `origin`).
2. In Coolify, create a new **Resource → Application** and point it at this
   repository/branch.
3. Choose the **Docker Compose** build pack, pointing at `docker-compose.yaml`
   at the repo root. If this resource was previously set up on the plain
   **Dockerfile** build pack, switch it to Docker Compose — otherwise the
   `api` service and `quotes-data` volume are silently ignored.
4. Confirm Coolify is persisting the `quotes-data` volume across deploys
   (most Coolify setups do this automatically for named volumes declared in
   compose, but it's worth checking after the first deploy - see "Data
   persistence" above).
5. Only `web`'s port 80 needs to be exposed externally — `api` is reached
   internally by `web` via the compose network (service name `api`, port
   `3001`) and shouldn't need a public port at all.
6. Attach your domain and deploy.

Every push to the tracked branch can trigger an automatic redeploy if you
enable Coolify's webhook/auto-deploy for this app.
