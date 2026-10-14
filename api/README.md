# IWVPL API

The backend for the league site. Serves the JSON API, the public SPA and (once
built) the admin app from a single origin.

The API provides public read endpoints and basic-auth-protected admin writes,
along with the schema, migrations, seed and connection handling.

## Why single origin

GitHub Pages cannot run Node or MySQL, so the API and database live elsewhere.
Serving the SPA and `/api/*` from the same host means no CORS configuration and
no cross-site cookie setup: `SameSite=Lax` sessions work as normal and neither
half needs to know where the other is.

## Layout

```
api/
  migrations/001_init.sql   schema
  src/
    config.ts               env parsing and validation
    db.ts                   mysql2 pool + query helpers
    migrate.ts              migration runner
    server.ts               express app, static hosting, error handling
    domain/
      slug.ts               slug rules — must match src/lib/format.ts
      seed.ts               seeds from the crawl output
    routes/league.ts        read-only endpoints
    routes/admin.ts         basic-auth-protected admin writes
    middleware/basicAuth.ts HTTP basic auth for /admin
```

## Running locally

```bash
cd api
cp .env.example .env      # then fill in the TiDB values
npm install
npm run migrate           # create the schema
npm run seed              # load it from src/data/site_data.json
npm run dev               # http://127.0.0.1:8080
```

`npm run dev` does not build the SPA. Run `npm run build` at the repo root
first if you want the server to serve it, otherwise `/` returns a 503 telling
you so.

## Database

TiDB Cloud Starter (free tier). Connect over the **MySQL** tab and use port
4000 — a long-lived Node process reaches it with ordinary `mysql2` TCP. The
HTTP `@tidbcloud/serverless` driver is only needed for edge runtimes where TCP
does not exist, which is not this case.

Schema choices that differ from plain MySQL, and why:

| Choice | Reason |
| --- | --- |
| `INT UNSIGNED`, never `BIGINT` | `mysql2` returns BIGINT as strings, which would make every id a `string` in TypeScript |
| `VARCHAR`, never `ENUM` | ENUM support is inconsistent across TiDB serverless versions |
| No `ON UPDATE CURRENT_TIMESTAMP` | TiDB handles auto-updating timestamps inconsistently; `updated_at` is written by the app |
| `utf8mb4` throughout | Club flags are regional-indicator emoji and truncate to `?` under `utf8mb3` |
| lowercase `snake_case` | TiDB is case-sensitive for table names where MySQL on Windows is not |
| foreign keys declared but not trusted | TiDB disables FK enforcement by default — integrity is enforced in the API layer |

## Standings are a snapshot, not a view

`standings_snapshot` is a materialised table, and this is load-bearing rather
than incidental.

The crawl holds **50** results. The published table says **18 teams have played
17 rounds each**, which is **153** matches. About two thirds of the season is
simply not in our data.

So the crawl's table is the authoritative base state, and each newly entered
result is applied to it incrementally. A view recomputing from `matches` would
show every club on roughly 6 played with badly wrong points — replacing numbers
the site currently gets right. A full recompute only becomes correct once
`matches` actually holds every fixture of the season.

This is the first thing to revisit if you backfill the full fixture list.

## Migrations

Files in `migrations/` run in lexicographic order, so the numeric prefix is the
ordering contract. Each applied file's SHA-256 is recorded in `_migrations`.

Editing a migration that has already run is detected and reported as drift
rather than ignored — that is the usual way a schema ends up not matching the
repository.

Migrations run automatically at boot while `MIGRATE_ON_BOOT=true`, which is
correct for one instance. Set it to `false` before scaling past a single
replica, or the replicas will race to apply the same file.

## Admin access

`/admin` sits behind HTTP basic auth. Its purpose is not identity — it is
making the admin JavaScript unfetchable. Anything served under `/admin` is
public the moment the bytes leave the server, so the bundle should never leave
at all.

Per-user permissions are separate and not built yet: the `users` and `sessions`
tables exist in the schema, but no code reads them.

If the admin build is missing, `/admin` returns 404 rather than falling through
to the public site — a 200 there would read as "admin is up" when it is absent.

## Deployment

One Render web service serves all three things from one origin. Deploy via the
blueprint at the repo root:

```
Render dashboard -> New -> Blueprint -> select this repo -> Apply
```

`render.yaml` creates the service and sets everything except the values marked
`sync: false`, which you supply on first apply: the five `DB_*` values and
`ADMIN_PASSWORD`. Region is Singapore, to match the TiDB cluster.

### What the image does

`Dockerfile` is a single stage on purpose. The API reads its neighbours off the
filesystem at runtime — `config.ts` resolves `repoRoot` from its own location and
looks for `../dist`, `../admin/dist` and `./migrations`. Building each piece in a
separate image would mean hand-reproducing that layout and keeping it in sync.

It installs all three dependency trees, builds the SPA, the admin app and the
API, then deletes the build-time dependencies and reinstalls just the API's.
The layout is asserted at the end of the build, so a mistake fails the image
rather than the deployment.

### The base path

The public SPA has two targets and they are not the same:

| Target | Base | How |
| --- | --- | --- |
| GitHub Pages | `/iwvpl/` | default, when `BASE_PATH` is unset |
| Render | `/` | `BASE_PATH=/`, set in the Dockerfile |

Verified both: the default build emits `/iwvpl/assets/…`, the Render build
emits `/assets/…`.

`BASE_PATH` only fixes `index.html`. Vite does not rewrite string literals in
JS/TS, which is why `asset()` in `src/lib/assets.ts` routes public files through
`import.meta.env.BASE_URL`. Changing one without the other is how you get
working HTML and 404ing images.

### Two deployments, if you keep Pages

`.github/workflows/deploy.yml` builds and pushes `gh-pages` on every push to
`main`. It builds with `VITE_API_BASE_URL` pointing at this Render service, so
the Pages copy reads current results and standings from the same API. Render
allows those read-only requests from the configured `PUBLIC_SITE_ORIGIN`;
same-origin requests from the Render-hosted SPA need no CORS.

### Free tier behaviour

The service spins down after 15 minutes without traffic and takes roughly a
minute to wake. `/api/health` is the health check path so it is polled
periodically and will mostly stay awake, but expect the occasional cold start and
TiDB request units ticking up while it idles.

### What is verified, and what is not

The compiled server has been booted from a replica of the container layout
(`/dist`, `/admin/dist`, `/api/dist`, `/api/migrations`) and confirmed to
resolve all four paths and serve the SPA, the history fallback and the
authenticated admin.

The Docker image itself has **not** been built — there is no Docker on this
machine. Path resolution and both build modes are verified; the image is not.

## Admin app

`admin/` is a separate Vite app served at `/admin`, behind HTTP basic auth.
It is not part of the public bundle, so the two ship independently and a
breaking admin change can never take the public site down.

```bash
cd admin
npm install
npm run build     # -> admin/dist, picked up by the API on next boot
npm run dev       # http://localhost:3001, proxies /api to :8080
```

The server checks for `admin/dist/index.html` **at startup**, so restart it
after a build. If the build is missing, `/admin` returns 404 rather than
falling through to the public site — a 200 there would read as "admin is up"
when it is absent.

Write endpoints live at `/api/admin/*` and share the same basic-auth gate.
That gate is one shared credential, not a permission model.

### Editing a result

Submitting a scoreline touches the match row and both clubs' standings rows, so
it runs in one transaction with `SELECT ... FOR UPDATE`. Two admins saving
results for the same division concurrently would otherwise each read the same
base row and one write would vanish.

The previous scoreline is read from the stored match, never from the request. A
client-supplied "previous" value would let a caller desynchronise the table
permanently with no way to detect it.

### Scheduling a fixture

Admins can create a fixture between active clubs in the same current division,
then set, change or clear its kickoff through the Matches workspace. A fixture
may remain unscheduled until its date is confirmed. Kickoff values are stored
as `DATETIME` wall-clock values and the admin UI treats them as
`Asia/Kuala_Lumpur` (UTC+8); unscheduled, overdue and today's unplayed fixtures
are surfaced in separate priority groups.

The admin results list requests `/api/matches` in pages using `limit`, `offset`,
`result` and `search` query parameters. The response includes the filtered
`total` and overall pending/completed counts. `/api/matches/priorities` provides
the unplayed fixtures that need scheduling attention independently of the
current results page.

### Division movement settings

The Clubs > Divisions admin workspace manages divisions for the current season
and stores how many clubs are promoted from the top and relegated from the
bottom. The standings positions are calculated from each division's current
team count, so the same settings work when season sizes change. Either setting
may be left unset. The public standings endpoint includes the movement counts
and resolves them to positions for the table highlights and zone labels.

## Testing

```bash
# Round-trip and integrity checks against a running server.
node scripts/standings-roundtrip.mjs [matchId]
```

Takes `ADMIN_PASSWORD` from the environment. It asserts the properties that
actually matter for an incrementally maintained table:

- `apply(R)` twice equals `apply(R)` once
- withdrawing removes exactly one played match from each club
- re-entering the pre-run scoreline restores the snapshot exactly, including
  form order and positions
- `played = won + drawn + lost`, `goal_difference = goals_for - goals_against`,
  `points = won*3 + drawn` on every row

The script mutates real data. Re-run `npm run seed` afterwards if you need a
clean slate.

## Known gaps

- No write endpoints, no auth, no admin UI yet.
- The `users` and `sessions` tables are defined but unused.
- Crawl kickoff times are stored as published. The date/time pairing is
  ambiguous around midnight (see the note in `domain/seed.ts`) and no timezone
  is invented.
- `season id` starts at 2 rather than 1. The seed ran more than once during
  development and `AUTO_INCREMENT` does not reset on `DELETE`; harmless, but
  cosmetically odd.

## Verified against TiDB

Migration and seed have both run against a live TiDB Cloud Starter (v8.5.3,
Singapore). Every read endpoint returns seeded data.

Two gotchas found by running it, both invisible to a typechecker:

- **The TiDB console strips dots from the host and username.** It displays
  `gateway01ap-southeast-1prod.aws.tidbcloud.com` and `kxn6sBqTJxrrZBwroot`;
  the real values are `gateway01.ap-southeast-1.prod.aws.tidbcloud.com` and
  `kxn6sBqTJxrrZBw.root`. The host fails DNS and the username is rejected with
  *"Missing user name prefix"*. Use the dialog's copy buttons.
- **`import.meta.url` never equals `` `file://${process.argv[1]}` `` on
  Windows**, so a main-module guard written that way silently never fires and
  the CLI scripts appear to do nothing. Route it through `pathToFileURL`.