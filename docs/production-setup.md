# Going live: checklist

Everything in the code is enforced for you (login gate, role rules in the database, signed webhooks). The steps below are the ones that can only be done in dashboards. Do them in this order.

> **Why a deployment with no login was possible before:** with no Supabase variables, the app used to fall back to a local demo mode that has no sign-in. Demo mode is now development-only. A deployment that is missing its variables returns a **503 setup page** and refuses every API call, so it can never open as an unauthenticated app. `/api/health` tells you exactly what is missing.

## 1. Database (Supabase → SQL editor)

Run both files, in order, once each:

1. `supabase/migrations/0001_init.sql` — tables, RLS, signup trigger, sender function, `media` bucket
2. `supabase/migrations/0002_production_hardening.sql` — role-based RLS, locked-down grants, invite hardening, upload type limits, indexes

`0002` is safe to re-run. Both are covered by `npm test` (`tests/rls.test.ts` runs them on a real Postgres and attacks every boundary).

## 2. Supabase Auth settings

Authentication → …

| Setting | Value |
|---|---|
| URL Configuration → **Site URL** | `https://YOUR-DOMAIN` |
| URL Configuration → **Redirect URLs** | `https://YOUR-DOMAIN/**` (add `http://localhost:4600/**` for local work) |
| Sign In / Providers → Email → **Confirm email** | **ON — required.** The invite protection and "this email is really theirs" guarantees depend on it. |
| Email → **Secure email change** / **Secure password change** | ON |
| Password → **Minimum length** | 8 or more, with lower/upper/digits required |
| Attack protection → **Leaked password protection** | ON (Pro plan and above) |
| Sign In / Providers → **Allow anonymous sign-ins** | OFF |
| Sign In / Providers → **Allow new users to sign up** | ON for a self-serve product. Turn OFF for invite-only: the sign-up page stops working, team invites still do. |

## 3. Email delivery with Resend (confirmation, reset, invite, codes)

Supabase's built-in mailer only reaches your own team and is capped at a few emails an hour, so real users need custom SMTP.

**a) Verify your sending domain in Resend.** resend.com/domains → Add domain (`YOUR-DOMAIN`, or a subdomain such as `mail.YOUR-DOMAIN` to keep it separate) → copy the DNS records it shows (a DKIM `TXT` at `resend._domainkey`, plus an `MX` and an SPF `TXT` on the `send` subdomain) into your DNS provider → click **Verify**. Resend will only deliver to other people from a verified domain.

**b) Point Supabase at Resend.** Authentication → Emails → SMTP Settings → enable custom SMTP:

| Field | Value |
|---|---|
| Sender email | `no-reply@YOUR-DOMAIN` (must be on the verified domain) |
| Sender name | `WAdesk` |
| Host | `smtp.resend.com` |
| Port | `465` |
| Username | `resend` |
| Password | your Resend API key (a *sending-only* key is enough and safest) |

Then Authentication → Rate Limits: raise "emails sent per hour" to something sensible for your traffic.

**c) Paste the email templates.** Authentication → Emails → Templates. The files in `supabase/email-templates/` include both the link and the 6-digit code that the sign-up and reset pages accept:

| Supabase template | File | Subject |
|---|---|---|
| Confirm sign up | `confirm-signup.html` | Confirm your WAdesk account |
| Reset password | `reset-password.html` | Reset your WAdesk password |
| Invite user | `invite.html` | You're invited to WAdesk |

The API key lives only in Supabase's SMTP settings — never in this repo, `.env` files or Vercel.

## 4. Hosting environment variables (Vercel → Settings → Environment Variables → Production)

| Variable | Value |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Project URL (Project Settings → API) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | the **publishable** key (`sb_publishable_…`) or the legacy `anon` key |
| `SUPABASE_SERVICE_ROLE_KEY` | the **secret** key (`sb_secret_…`) or legacy `service_role` key. Server only. |
| `APP_ENCRYPTION_KEY` | `openssl rand -base64 32` — encrypts the Meta token and app secret at rest. Don't lose it. |
| `CRON_SECRET` | `openssl rand -hex 32` |
| `NEXT_PUBLIC_APP_URL` | `https://YOUR-DOMAIN` |

The `NEXT_PUBLIC_…` values are baked in at **build** time, so after adding or changing variables you must **redeploy** (Deployments → ⋯ → Redeploy). Then open `https://YOUR-DOMAIN/api/health` — it should say `"ok": true`.

## 5. WhatsApp + scheduler

- Settings → WhatsApp: enter the phone number ID, business account ID, access token **and the app secret** (required on a live deployment — webhooks are only accepted when their signature can be verified).
- In Meta, paste the callback URL and verify token shown in Settings and subscribe to `messages`, `message_template_status_update`, `phone_number_quality_update`.
- Scheduler: Supabase `pg_cron` snippet at the bottom of `0001_init.sql`, or a Vercel cron on the Pro plan (see README).

## 6. Smoke test (five minutes)

1. Signed out, open the site → you land on **/login**. `/inbox`, `/settings` etc. also bounce to /login.
2. **Sign up** with a fresh email → email arrives (link + code) → confirm → you're in your own empty workspace.
3. **Forgot password** → email arrives → set a new password → sign in.
4. Settings → Team → **invite** a second email as *agent* → they accept, choose a password, and can use contacts and the inbox but **cannot** launch a campaign or delete templates.
5. `/api/health` → `ok: true`.

## What is enforced where

| Rule | Enforced by |
|---|---|
| Nothing renders without a session | proxy **and** a server check in the app layout |
| Nothing is served if the deployment is misconfigured | proxy (503), `rootAdapter()` backstop |
| One workspace can't see another's data | RLS on every table |
| Only admins launch campaigns, approve/delete templates, manage the team | API role check **and** RLS (database refuses direct writes) |
| Nobody can become or remove an owner from the client | RLS + column grants on `workspace_members` |
| Anonymous key can't touch any table | revoked at the privilege level |
| Meta token / app secret are unreachable from the browser | RLS with no policies + revoked grants; AES-256-GCM at rest |
| Webhooks can't be forged | HMAC signature verification, required for every live workspace |
| Cron endpoint | constant-time bearer check; refuses everything if `CRON_SECRET` is unset |
| Uploads | signed URLs, size and type validated, bucket limited to WhatsApp's file types |

## Not covered (worth doing next)

- A CAPTCHA on sign-up (Supabase supports Turnstile / hCaptcha) to stop bot sign-ups from burning your email quota.
- A strict Content-Security-Policy (needs a nonce setup alongside Next's inline scripts).
- Rate limiting on the JSON API beyond what Supabase Auth applies to sign-in.
