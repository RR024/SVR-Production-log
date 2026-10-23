# SVR Production Log

Installable PWA for **Sri Veera Raghava Sheet Metal Component**: daily production logging
with date-wise history, multi-machine/part entries, reports and CSV export.

**Plain HTML, CSS and JavaScript. No build step, no Node needed.** The Supabase client is
vendored in `js/vendor/`, fonts are self-hosted, so the app shell works offline.

## Instruction status

Checked against the repository on **2026-10-23**:

| Instruction | Status | Evidence / remaining action |
|---|---|---|
| Add the Supabase schema, security, functions and first-admin SQL | **SQL executed** | All four files, `supabase/migrations/001_schema.sql` through `004_bootstrap_admin.sql`, were run in the Supabase SQL Editor. The first-admin script must have been run after replacing its example email. |
| Configure the Supabase URL and browser-safe key | **Configured in the repo** | `js/config.js` contains a Supabase URL and publishable key. Confirm they belong to the intended project. |
| Disable public sign-up and create the first users | **Manual verification required** | This is a Supabase dashboard action and cannot be verified from the repository. |
| Run the app through HTTP(S), not `file://` | **Ready** | The app has no build step; run the command in [Run locally](#2-run-locally). |
| Deploy to a static HTTPS host | **Deployment verification required** | Static-host configuration is present (`_headers` and `vercel.json`), but the live deployment cannot be verified from these files. |
| Install the PWA on Android | **Implementation ready; installation unverified** | `manifest.webmanifest`, icons, service-worker registration, and the in-app install prompt are present. Install it from the deployed HTTPS site. |
| Ship updates by bumping the service-worker version | **Implemented** | `sw.js` uses a versioned shell cache and waits for the user to choose **Refresh** before reloading. |

```
index.html · manifest.webmanifest · sw.js · offline.html
css/styles.css
js/app.js  config.js  lib/*  views/*  vendor/supabase.js
supabase/migrations/001..004   ← database, security (RLS), RPC functions
```

## 1. Set up Supabase (one time)

1. In your Supabase project → **SQL Editor**, run in order:
   `001_schema.sql`, `002_security.sql`, `003_functions.sql`, and `005_supervisor_permissions.sql`.
   - `001` adds a **unique index on `log_date`** (one daily log per date, many machine/part
     entries inside it). It fails on purpose if two logs already share a date: merge them first.
2. **Authentication → Providers → Email → turn OFF "Allow new users to sign up".**
   *Important:* new accounts start as Viewer and viewers can read all production data.
   Create staff yourself under **Authentication → Users → Add user**.
3. Create your own user, then run `004_bootstrap_admin.sql` (edit the email) to make yourself admin.
   After that, manage roles in the app (**Users** page).
4. **Project Settings → API**: copy the Project URL and the **publishable / anon** key into
   `js/config.js`. Never use the `service_role` key anywhere in this project.

| Role | Can do |
|---|---|
| Admin | Everything: logs (create/edit/delete), machines, parts, users, reports |
| Supervisor | Add/edit machines and parts, create/edit logs, reports. **Cannot delete** logs or manage users |
| Viewer | Read-only: dashboard, history, details, reports |

All of this is enforced in the database (RLS + `SECURITY DEFINER` RPCs), not just by hiding buttons.

## 2. Run locally

PWAs need `http://localhost` or HTTPS (not `file://`):

```
python3 -m http.server 8080      # or: npx serve .
# open http://localhost:8080
```

## 3. Deploy (any static host, HTTPS)

- **GitHub Pages**: push this folder, Settings → Pages → deploy from branch. Works in a sub-path
  (routes use `#/…`, so deep links and refresh always work; paths in the app are relative).
- **Cloudflare Pages / Netlify / Vercel**: no build command, output directory = repo root.
  `_headers` / `vercel.json` set no-cache on `sw.js` + `manifest` so updates are picked up.

Then open the site on Android Chrome → menu → **Install app** (or use the in-app *Install app* button).

## 4. Shipping an update

1. Change files as needed.
2. In `sw.js` bump `const VERSION = 'v1.0.1'` (and add any new files to `SHELL`).
3. Deploy. Open apps show **"A new version is ready · Refresh"**. Nothing reloads until the user taps
   it, so a half-filled form is never lost.

## Behaviour notes

- **Offline:** the app shell loads offline and an "offline" banner shows. Saving needs a connection:
  an offline save is **refused with a clear message** and the form keeps your entries. Nothing is ever
  shown as saved until Supabase confirms. Supabase responses are never cached by the service worker.
  (Offline queued entry was deliberately not built; it is the riskiest part for duplicates.)
- **Dates:** `log_date` is handled as a plain `YYYY-MM-DD`; no timezone shifting.
- **Totals** are always summed from the entries, never stored.
- **Reports** can be filtered by a single date (`From` and `To` set to the same date),
  a date range, machine, and/or part. Date-wise, machine-wise, and part-wise tables each
  show a final Total row.
- **Production entry form:** active machines are shown as separate cards automatically. Choose
  the part and quantity inside the relevant machine card; use that card's **Add entry** button
  to record additional parts or batches for the same machine. Blank machine rows are ignored
  when saving.
- **Machines/parts** are deactivated, never deleted, so history stays intact. Inactive ones remain
  visible (badged) on old logs and can still be kept when editing those logs.
- **Print:** the log detail page has a print-friendly layout.
"# SVR-Production-log" 
