# PhysioManager

A mobile-first app for one physiotherapist: **Calendar, Patients, Sessions**. No billing, registration, staff accounts, or extra clinic modules.

- **Frontend:** React + Vite, locally bundled Outfit throughout, Lucide icons, and responsive bottom navigation. Scrollbars are hidden; touch, wheel, and keyboard scrolling still work.
- **Backend:** a conventional **Express 5** REST API in `server/`. Express handles authorization, validation, patient/session operations, and Google Calendar OAuth and requests. No Supabase Edge Functions.
- **Supabase:** database and the single manually provisioned doctor login only. The browser uses Supabase Auth, then sends its bearer token to Express for every data request. Express validates that token with Supabase and checks the designated doctor before allowing access.

## Run locally

Requires Node.js 22.12+ (tested with Node 24).

```sh
npm install
npm run dev
```

This starts Express on port **3001** and Vite on **5173**. Vite proxies `/api` to Express, including when you access Vite's printed Network URL from a phone on the same Wi-Fi. Start either separately with `npm run dev:server` or `npm run dev:client`.

Without frontend Supabase variables, the app shows a setup screen. No demo mode, seeded patients, sample sessions, or fake appointments are included in the app. Signed-in workspaces show actual database records and connected Google events, with empty states when none exist. Synthetic fixtures are used only in isolated automated tests. The Express health endpoint is available at `/api/health`; it reports whether Supabase has been configured.

## Configure Supabase and the single doctor

1. Create a Supabase project. In Authentication settings, **disable new user signups** and unused providers.
2. Run the SQL files in `supabase/migrations/` in filename order. For an existing installation, apply only unapplied migrations; `202611010002_patient_details.sql` adds referral, underlying conditions, and medication. Existing patient email values are retained in the database but are no longer collected or returned by the patient API.
3. In Authentication → Users, manually create the doctor's email/password account with email confirmed. Copy its UUID.
4. Run this in SQL Editor, substituting that UUID:

```sql
insert into public.app_access (singleton, doctor_user_id)
values (true, 'YOUR_DOCTOR_USER_UUID')
on conflict (singleton) do update set doctor_user_id = excluded.doctor_user_id;
```

5. Copy `.env.example` to `.env.local` and enter the frontend URL and publishable key:

```dotenv
VITE_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=YOUR_PUBLISHABLE_KEY
```

6. Copy `.env.server.example` to `.env.server`. Enter the same URL/publishable key plus the **server-only service-role key**. Keep this file private. Never put the service-role key in a `VITE_` variable.
7. Restart `npm run dev`, then sign in with the doctor account.

Only the configured UUID can access Express record/calendar endpoints, even if another Supabase user exists. The allowlist cannot be edited through the app. Manage password recovery directly in Supabase. Keep this UUID stable: changing it does not transfer ownership of existing records.

Express passes the doctor's token to database queries, so PostgreSQL row-level policies and owner-matched foreign keys enforce access too. Its service-role client is used only for encrypted Google integration storage. Archiving preserves patient history; permanent deletion is not exposed. The browser persists only its Supabase login session and chosen time zone. Clinical records and Google tokens are never saved in browser storage or a service-worker cache.

## Connect existing Google Calendar appointments

1. Enable Google Calendar API in Google Cloud. Configure the OAuth consent screen for the doctor's Google account and create a **Web application** OAuth client.
2. Add this authorized redirect URI for local development:

```text
http://localhost:3001/api/calendar/callback
```

3. Generate a 32-byte key locally and save it securely:

```sh
node -e "console.log(require('node:crypto').randomBytes(32).toString('base64'))"
```

4. Fill the remaining values in `.env.server`:

```dotenv
PORT=3001
APP_URL=http://localhost:5173
API_PUBLIC_URL=http://localhost:3001
SUPABASE_URL=https://YOUR_PROJECT.supabase.co
SUPABASE_PUBLISHABLE_KEY=YOUR_PUBLISHABLE_KEY
SUPABASE_SERVICE_ROLE_KEY=YOUR_SERVER_ONLY_SERVICE_ROLE_KEY
GOOGLE_CLIENT_ID=YOUR_GOOGLE_CLIENT_ID
GOOGLE_CLIENT_SECRET=YOUR_GOOGLE_CLIENT_SECRET
GOOGLE_TOKEN_ENCRYPTION_KEY=YOUR_GENERATED_BASE64_KEY
```

5. Restart Express. Sign in and choose **Connect Google Calendar**. Use workspace settings (the doctor avatar on phones, account at the bottom of the desktop sidebar) to select an existing calendar.

The callback URL is `${API_PUBLIC_URL}/api/calendar/callback`. `APP_URL` must match the frontend origin actually opened. For Google connection from a phone, both URLs must be reachable from that phone; use a production HTTPS origin or a development HTTPS tunnel rather than the phone's localhost.

Express requests only `calendar.calendarlist.readonly` and `calendar.events.readonly`. Google resource requests are exclusively GET; no event creation, editing, or deletion exists. Patient links are manual and stay in the app. Recurring occurrences, pagination, multi-day events, and time zones are supported. Refresh happens on foregrounding or through the refresh button, rather than background push synchronization. Default time zone: Asia/Beirut.

OAuth uses expiring, atomically consumed state and PKCE. Refresh tokens and PKCE verifiers are encrypted with AES-256-GCM in server-only tables. Rotating the encryption key requires reconnecting Google. Google consent in Testing mode may require periodic reconnection; configure publishing/verification for your deployment. See [Google's server OAuth documentation](https://developers.google.com/identity/protocols/oauth2/web-server).

## Express API

### Optional clinical assistant

Set `GEMINI_API_KEY` in the ignored `.env.server` file and in Render's Environment settings. Never set a `VITE_` variable for this secret. `GEMINI_MODEL` defaults to `gemini-3.8-flash` and can be changed to an available model supporting structured JSON output. Restart/redeploy after changes. The Calendar OAuth client secret is not a Gemini API key. Create the Gemini key in Google AI Studio; do not commit it.

In the session form, choose a patient and expand Assessment ideas. Review/edit the clinical preview and search topic, remove identifiers in free text, and confirm before generating. Only this reviewed text is sent. Up to three prior sessions are included in the preview, newest first; contact information and calendar details are excluded. PubMed receives only the search topic. Free-tier Gemini prompts may be used by Google for product improvement. Paid access alone does not establish healthcare privacy compliance.

The Express endpoint requires doctor authentication, validates input, limits requests to three per minute, retrieves up to six relevant PubMed records and abstracts, requests structured JSON, validates the output, and rejects invented PMID links. Retrieved papers are search results, not a quality ranking; cited support still needs clinician review. If literature retrieval fails, the response clearly indicates missing evidence. No assistant output is stored by the app unless an idea or full guide is explicitly added to a session plan and saved. Full guides include the overview, questions, safety, assessments and limitations, evidence gaps, references, model and generation time. The 10,000-character plan limit is enforced without truncation; an oversized guide is not added. Every saved session field is displayed in its detail view, including the complete plan. Model responses are never accepted as evidence of care delivered. Bookshelf is linked for further reading; the assistant does not invent textbook passages or upload licensed books.

Except health and Google's state-protected callback, every endpoint requires a valid doctor bearer token. Inputs are validated on the server, client-supplied ownership is rejected, API responses use `Cache-Control: no-store`, and security headers and request limits are enabled.

| Method | Endpoint | Purpose |
| --- | --- | --- |
| GET | `/api/health` | Server/configuration health |
| GET | `/api/access` | Check designated doctor access |
| GET | `/api/records` | Load patients, sessions, and patient links, including database pagination |
| POST / PATCH | `/api/patients`, `/api/patients/:id` | Create/edit/archive patients |
| POST / PATCH | `/api/sessions`, `/api/sessions/:id` | Create/edit session notes |
| PUT / DELETE | `/api/appointment-links` | Link/unlink a Google event and patient |
| GET | `/api/calendar/status` | Connection status |
| POST | `/api/calendar/connect` | Start Google consent |
| GET | `/api/calendar/callback` | Complete state-protected Google consent |
| GET | `/api/calendar/calendars` | List existing calendars |
| GET | `/api/calendar/events` | Read a date range of up to 14 days |
| DELETE | `/api/calendar/connection` | Disconnect and remove credentials |

## Checks

```sh
npm test
npm run lint
npm run build
npx playwright install chromium webkit
npm run test:e2e
```

Unit/API tests cover Express authorization, validation, request limits, safe errors, token encryption, Google GET-only pagination, date boundaries, all-day events, and time zones. Database tests apply the actual migration to an isolated PostgreSQL-compatible PGlite instance and verify doctor/other-user/anonymous access, server-only credential storage, validation, and preservation of archived patients' sessions.

Browser tests cover desktop, 390px and 360px phones, and iPhone WebKit emulation: navigation, search, patient create/edit/archive/restore, session save/edit, pain validation, appointment linking, unsaved-change protection, accessibility, horizontal overflow, and Outfit font consistency. Authenticated browser scenarios mock Supabase Auth and Express responses without storing real data.

After configuration, use synthetic records to verify live sign-in, persistence after sign-out, denial for an undesignated account, Google consent/loading/reconnect, and unchanged Google events. Automated tests do not establish live third-party integration or replace checking your physical phone.

## Production

### Render deployment

`render.yaml` defines one free Node web service that serves both Express and the built React app. Connect this repository using Render's **New → Blueprint** flow. Enter the four requested environment values by copying the matching keys from your private `.env.server`: `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, and `GOOGLE_TOKEN_ENCRYPTION_KEY`. Never commit that file. At build time Vite uses only the URL and publishable key; server secrets are not exposed to the frontend.

For manual **New → Web Service** setup, choose Node, build command `npm ci --include=dev && npm run build`, start command `npm start`, Free instance, and health check `/api/health`. Set `NODE_VERSION=24.14.0` and `TRUST_PROXY_HOPS=1`, plus the four variables above.

Render supplies `PORT` and `RENDER_EXTERNAL_URL`; the server automatically uses its assigned HTTPS address for the frontend origin and Google callback. Do not copy localhost `APP_URL` or `API_PUBLIC_URL` values into Render. If using a custom domain, explicitly set both to its HTTPS origin.

After Render assigns the **actual** URL, use `<actual Render URL>/api/calendar/callback` as Google's authorized redirect URI. JavaScript origins are not required by this server OAuth flow; remove any empty origin rows in Google's form. Add `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` to Render's Environment settings, then redeploy. Keep the encryption key stable when redeploying; changing it requires reconnecting Google Calendar.

Render free web services sleep after idle periods and may take about a minute to wake. Render describes free instances as suitable for testing rather than production; use this deployment to evaluate the app, not as a guaranteed-availability clinical service. See [Render's free-plan limits](https://render.com/docs/free).

### Other Node hosting

```sh
npm run build
npm start
```

Express serves the built frontend and `/api` from one origin. Set both `APP_URL` and `API_PUBLIC_URL` to that public HTTPS origin, register its Google callback, and configure the same frontend variables when building. Run behind an HTTPS reverse proxy. Set `TRUST_PROXY_HOPS` only to the known number of trusted proxy hops so rate limiting uses the correct address. Supply secrets through the host's environment or a private `.env.server`; do not ship local secret files. The CSP permits authentication to hosted `*.supabase.co`; update the Express CSP if using a custom Supabase domain.

Configure database backups and verify a restore into a separate project using synthetic data. Retain the encryption key separately. Before using real patient records, confirm that hosting, access policies, and retention meet your clinic's requirements; the app makes no regulatory certification claim. All records require connectivity; failed saves preserve the open form.

Home-screen launch icons and a web manifest are included. Outfit is bundled locally, with its license in `public/outfit-license.txt`.

Model fallback order: `gemini-3.8-flash`, `gemini-3.6-flash`, `gemini-3.5-flash-lite`, `gemini-3.1-flash-lite`, `gemini-2.5-flash`, `gemini-2.5-flash-lite`. Override the comma-separated `GEMINI_FALLBACK_MODELS` variable to change it. Fallback uses bounded exponential delays for model-not-found, timeouts, quota and service availability errors. It does not retry safety refusals, invalid credentials or malformed responses. Model-specific or shared quotas may still prevent all attempts. Update `GEMINI_MODEL` in Render if it was previously pinned to 2.5 Flash.
