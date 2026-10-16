# WAdesk

A WhatsApp marketing suite for the official **WhatsApp Business Cloud API** (Meta): broadcasts with every message format, a template studio, a shared team inbox, automations, analytics — on your own number.

- **Broadcasts** — text, image, video, document, **carousel** and button templates (quick reply, link, call, copy-code). Audience by segment, tags or hand-picked contacts. Per-contact variables with fallbacks, scheduling, throttling, pause/resume, follow-ups to people who didn't read or didn't get it.
- **Templates** — visual builder with a live WhatsApp preview, Meta-rule validation, submit for review, status sync.
- **Contacts** — import **CSV · TSV · XLSX · XLS · ODS · vCard · JSON** or paste numbers; column mapping, phone normalisation (E.164), de-duplication, consent capture, tags, custom fields, saved segments, bulk actions, export.
- **Inbox** — team chat with 24-hour window awareness, media, reply buttons / lists / link buttons, template sends, quick replies (`/`), internal notes, assignment, resolve.
- **Automations** — keyword auto-replies, welcome and away messages, business hours, STOP / START opt-out handling.
- **Analytics** — delivery funnel, best time to send, template and campaign performance, failure reasons, estimated spend.
- **Links & QR** — click-to-chat links, QR codes (PNG/SVG), website chat-button snippet.
- Light and dark theme, ⌘K command palette, fully responsive.

## Run it locally (demo mode)

```bash
npm install
npm run dev          # http://localhost:4600
```

With no Supabase variables set, WAdesk runs in **demo mode**: data lives in `.data/db.json` (created and seeded on first start) and WhatsApp is **simulated** — messages you send get delivered, read and answered by a background worker within seconds, going through the very same webhook code that production uses. Nothing leaves your machine. Settings → Data lets you reset or clear the sample data.

Demo mode has **no login**, so it only runs under `npm run dev`. It is refused on Vercel, and in any production build (`npm run build && npm start`) unless you set `WADESK_DEMO=1` on purpose. A deployment that is missing its Supabase variables does not fall back to demo mode: it serves a 503 setup page and refuses every API call.

Demo contacts are flagged `source: demo` and are **never sent through a live connection**, so connecting real credentials locally can't message a sample number.

## Connect your WhatsApp number

Open **Settings → WhatsApp** and enter:

| Field | Where to find it (Meta) |
|---|---|
| Phone number ID | WhatsApp Manager → API setup (under the sending number) |
| WhatsApp Business Account ID | same page, "WhatsApp Business Account ID" |
| Access token | Business settings → System users → generate a **permanent** token with `whatsapp_business_management` and `whatsapp_business_messaging` |
| App ID *(optional)* | needed to upload sample media for image / video / document / carousel templates |
| App secret | lets WAdesk verify the signature of incoming webhooks — **required on a live deployment** (optional in demo mode) |

WAdesk checks the credentials against Meta before saving, then stores the token **AES-256-GCM encrypted**; it is never sent back to the browser.

**Webhook** (Meta for Developers → your app → WhatsApp → Configuration): paste the *Callback URL* and *Verify token* shown in Settings, then subscribe to `messages`, `message_template_status_update` and `phone_number_quality_update`. Delivery receipts, customer replies and template approvals arrive through it. On `localhost` you need a tunnel (`ngrok http 4600` / `cloudflared`) — or just deploy.

## Deploy: Supabase + Vercel

> The complete go-live checklist (Auth settings, Resend email, DNS, smoke test) is in **[docs/production-setup.md](docs/production-setup.md)**. The short version:

1. **Supabase** — create a project. In the SQL editor run these three files, in order: [`0001_init.sql`](supabase/migrations/0001_init.sql) (tables, row-level security, the signup trigger — a new user gets their own workspace, invited users join via a server-written invite — the atomic `claim_campaign_messages` function used by the sender, and the public `media` bucket), [`0002_production_hardening.sql`](supabase/migrations/0002_production_hardening.sql) (role-based RLS: only admins launch campaigns, approve or delete templates and manage the team; anonymous access revoked; upload types limited) and [`0003_scheduler.sql`](supabase/migrations/0003_scheduler.sql) (lets the app set up its own once-a-minute scheduler).
   - Authentication → URL configuration: set *Site URL* to your domain and add `https://YOUR-DOMAIN/**` to redirect URLs.
   - Authentication → Providers → Email: keep "Confirm email" **on** — required for production.
   - Authentication → Emails: set up custom SMTP (e.g. Resend) and paste the templates from [`supabase/email-templates/`](supabase/email-templates). Supabase's built-in mailer is too limited for real users.
2. **Vercel** — import the repo (framework: Next.js). Add the environment variables from [`.env.example`](.env.example):

   | Variable | Value |
   |---|---|
   | `NEXT_PUBLIC_SUPABASE_URL` | Project settings → API → Project URL |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | the publishable key (`sb_publishable_…`) or the legacy `anon` key |
   | `SUPABASE_SERVICE_ROLE_KEY` | the secret key (`sb_secret_…`) or legacy `service_role` key — **server only, never expose it** |
   | `APP_ENCRYPTION_KEY` | `openssl rand -base64 32` (encrypts your Meta token at rest) |
   | `CRON_SECRET` | any long random string |
   | `NEXT_PUBLIC_APP_URL` | `https://YOUR-APP.vercel.app` |
   | `NEXT_PUBLIC_COMPANY_NAME` | optional — the name shown on the public privacy page (`/privacy`) |
   | `NEXT_PUBLIC_PRIVACY_EMAIL` | optional — the contact email shown on the privacy page |
   | `META_GRAPH_VERSION` | optional, default `v23.0` |

   The `NEXT_PUBLIC_…` values are baked in at build time — **redeploy after changing them**, then open `/api/health` (it should report `"ok": true`). If any required variable is missing the app deliberately shows a 503 setup page instead of opening.
3. **Sign up** at your deployed URL (the first account becomes the owner of a new workspace), then connect WhatsApp in Settings and add the webhook in Meta as above.
4. **Scheduler** — nothing to do. Scheduled campaigns (and unattended large sends) need a timer that calls `/api/cron/dispatch` every minute, and WAdesk **sets that timer up by itself** the first time the production server starts (Supabase `pg_cron` + `pg_net`, via migration `0003_scheduler.sql`, authenticated with `CRON_SECRET` and addressed to `NEXT_PUBLIC_APP_URL`). It re-registers if the address ever changes, and previews never touch it. `/api/health` reports whether it's running, and the app refuses to schedule a campaign when no timer exists rather than letting it wait forever. Prefer your own scheduler (for example a Vercel Pro cron)? Set `WADESK_SCHEDULER=external` and call `GET /api/cron/dispatch` yourself every minute with `Authorization: Bearer $CRON_SECRET`.

## How it works

```
src/
  app/(app)/…            pages (dashboard, inbox, campaigns, templates, contacts, automations, analytics, growth, settings)
  app/api/…              JSON API, webhook, cron, media
  components/ui/…        design system (double-bezel cards, controls)
  components/wa/…        WhatsApp-accurate previews (template, carousel, chat bubbles)
  components/charts/…    SVG charts on a colour-blind-validated palette
  lib/shared/…           types, template rules + validation, phone normalisation, error dictionary
  lib/server/db/…        one query vocabulary, two backends: LocalAdapter (JSON) and SupabaseAdapter (PostgREST)
  lib/server/services/…  all business logic, written once for both backends
  lib/server/wa/…        CloudProvider (Meta Graph API) and MockProvider (demo simulator)
supabase/migrations/     schema, RLS, functions
docs/ui-guide.md         UI kit + API reference
```

- **Sending** — `processCampaign` claims batches with `FOR UPDATE SKIP LOCKED`, sends at the chosen rate, retries nothing blindly (rate-limit errors back off, fatal auth errors pause the campaign), and persists results in bulk. Opted-out contacts are re-checked at send time.
- **Compliance built in** — imports require a consent confirmation, unconfirmed contacts are excluded by default, STOP / START are handled automatically, a recipient who blocks marketing is suppressed, and free-form replies are blocked outside the 24-hour window (templates only).
- **Security** — RLS on every table, secrets table reachable only with the service role, signature verification for webhooks (required for every live workspace), uploads via signed URLs, CSV export neutralises spreadsheet-formula injection.

## Good to know

- Meta decides template approval, per-message pricing and your daily messaging tier; the spend figures in WAdesk are **estimates** from the rates you set in Settings → Workspace.
- Marketing messages to a person are only delivered if they've opted in and Meta's own per-user limits allow it; failures are explained in plain language on the campaign page.
- Scripts: `npm run dev` · `npm run build` · `npm run lint` · `npm run typecheck` · `npm test`.
- If the dev server misbehaves after a production build (both write to `.next`), stop it, delete `.next` and start it again.
