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

Demo contacts are flagged `source: demo` and are **never sent through a live connection**, so connecting real credentials locally can't message a sample number.

## Connect your WhatsApp number

Open **Settings → WhatsApp** and enter:

| Field | Where to find it (Meta) |
|---|---|
| Phone number ID | WhatsApp Manager → API setup (under the sending number) |
| WhatsApp Business Account ID | same page, "WhatsApp Business Account ID" |
| Access token | Business settings → System users → generate a **permanent** token with `whatsapp_business_management` and `whatsapp_business_messaging` |
| App ID *(optional)* | needed to upload sample media for image / video / document / carousel templates |
| App secret *(optional)* | lets WAdesk verify the signature of incoming webhooks |

WAdesk checks the credentials against Meta before saving, then stores the token **AES-256-GCM encrypted**; it is never sent back to the browser.

**Webhook** (Meta for Developers → your app → WhatsApp → Configuration): paste the *Callback URL* and *Verify token* shown in Settings, then subscribe to `messages`, `message_template_status_update` and `phone_number_quality_update`. Delivery receipts, customer replies and template approvals arrive through it. On `localhost` you need a tunnel (`ngrok http 4600` / `cloudflared`) — or just deploy.

## Deploy: Supabase + Vercel

1. **Supabase** — create a project. In the SQL editor run [`supabase/migrations/0001_init.sql`](supabase/migrations/0001_init.sql). It creates the tables, row-level security, the signup trigger (a new user gets their own workspace; invited users join via a server-written invite), the atomic `claim_campaign_messages` function used by the sender, and the public `media` storage bucket.
   - Authentication → URL configuration: set *Site URL* to your Vercel URL and add `https://YOUR-APP.vercel.app/**` to redirect URLs.
   - Authentication → Providers → Email: keep "Confirm email" on for production.
2. **Vercel** — import the repo (framework: Next.js). Add the environment variables from [`.env.example`](.env.example):

   | Variable | Value |
   |---|---|
   | `NEXT_PUBLIC_SUPABASE_URL` | Project settings → API → Project URL |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | the `anon` public key |
   | `SUPABASE_SERVICE_ROLE_KEY` | the `service_role` key — **server only, never expose it** |
   | `APP_ENCRYPTION_KEY` | `openssl rand -base64 32` (encrypts your Meta token at rest) |
   | `CRON_SECRET` | any long random string |
   | `NEXT_PUBLIC_APP_URL` | `https://YOUR-APP.vercel.app` |
   | `META_GRAPH_VERSION` | optional, default `v23.0` |

3. **Sign up** at your deployed URL (the first account becomes the owner of a new workspace), then connect WhatsApp in Settings and add the webhook in Meta as above.
4. **Scheduler** — campaigns launched with *Send now* start immediately and keep running while the campaign page is open. For **scheduled** campaigns, and to keep very large sends moving unattended, something must call `GET /api/cron/dispatch` every minute with `Authorization: Bearer $CRON_SECRET`:
   - **Free:** Supabase `pg_cron` + `pg_net` — the snippet is at the bottom of the migration file.
   - **Vercel Pro:** add to `vercel.json`: `{"crons":[{"path":"/api/cron/dispatch","schedule":"* * * * *"}]}` (Vercel attaches the `CRON_SECRET` bearer automatically). Hobby plans allow daily crons only.

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
- **Security** — RLS on every table, secrets table reachable only with the service role, signature verification for webhooks (when an app secret is stored), uploads via signed URLs, CSV export neutralises spreadsheet-formula injection.

## Good to know

- Meta decides template approval, per-message pricing and your daily messaging tier; the spend figures in WAdesk are **estimates** from the rates you set in Settings → Workspace.
- Marketing messages to a person are only delivered if they've opted in and Meta's own per-user limits allow it; failures are explained in plain language on the campaign page.
- Scripts: `npm run dev` · `npm run build` · `npm run lint` · `npm run typecheck` · `npm test`.
- If the dev server misbehaves after a production build (both write to `.next`), stop it, delete `.next` and start it again.
