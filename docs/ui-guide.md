# WAdesk — UI & data guide

Read this fully before writing any page. It's the contract between the design system, the data layer and the pages.

Dev server: **http://localhost:4600** (already running with HMR — do not start another; if it died: `npm run dev > /tmp/wadesk-dev.log 2>&1 &`).
Stack: Next.js 16 (App Router, Turbopack) · React 19 · Tailwind v4 · TypeScript strict · SWR · `motion` · Phosphor icons · Radix primitives.
The app runs in **local demo mode** (no Supabase): a file-backed store (`.data/db.json`) is seeded with a DigiBind Media workspace — 140 contacts, 9 templates (incl. carousel), 5 finished campaigns, 1 scheduled, 1 draft, 14 conversations, automations, segments. WhatsApp is simulated: sent messages get delivered/read/replied by a worker within seconds, via the same webhook code path production uses.

## Design language (non-negotiable)

Soft Structuralism. Warm stone canvas, white "core" surfaces nested in a translucent "shell" tray (**double-bezel**), emerald-ink accent, hairline rings, huge calm whitespace, light-weight line icons.

- **Cards**: `<Card>` (from `@/components/ui/display`) = outer bezel + inner core. Use it for every primary container. `<Inset>` for flat sub-areas inside a card. Don't stack card-in-card-in-card. Plain `hairline` rows inside a card are fine for tables/lists.
- **Never** add small uppercase / letter-spaced "eyebrow" labels, tag pills above headings, or section kickers. The user explicitly rejected these as AI slop. Labels are sentence case. Table headers: sentence case, `text-xs text-ink-3`, not uppercase.
- **Page header**: `<PageHeader title="Campaigns" accent="overview" description="…" actions={…} />` — `accent` is an optional trailing word in the serif italic (use sparingly, max 1 word, only where it reads naturally).
- **Primary CTA**: `<Button trailing={<ArrowUpRight size={14} />}>New campaign</Button>` — the "button-in-button" nested arrow island. Use `variant="primary"` (ink pill) for the one main action per view, `secondary` for others, `ghost` for tertiary, `soft` for accent tint, `danger`/`danger-soft` for destructive.
- **Icons**: `import { Plus } from "@phosphor-icons/react"`. Never Lucide / FontAwesome / emoji-as-icon. Weight comes from context (light) — don't pass `weight` except `"fill"` for tiny status glyphs / `"bold"` for check marks. Icon-only buttons need `aria-label`.
- **Type**: Geist Sans + Geist Mono (`font-mono` for phone numbers, ids, template names). Body 14px. Page title 28–34px, tracking tight. Numbers: `tabular` class in columns; proportional (default) for big stat values.
- **Colour tokens** (Tailwind utilities): `bg-bg bg-surface bg-surface-2 bg-surface-3`, `text-ink text-ink-2 text-ink-3 text-ink-4`, `bg-accent text-accent-ink bg-accent-soft`, `text-warn bg-warn-soft`, `text-danger bg-danger-soft`, `text-info bg-info-soft`, `text-violet bg-violet-soft`, `border-line`, `ring-line`. Helper classes: `hairline`, `hairline-strong`, `bezel`, `bezel-core`, `bezel-sm`, `tabular`, `skeleton`, `wa-wallpaper`. Both light and dark themes must look right — only use tokens, never raw hex/gray utilities (except inside WhatsApp-mimicking elements).
- **Charts**: only the components in `@/components/charts/*`, colours `var(--viz-1|2|3)` (series), `var(--ord-1..4)` (ordinal funnel), `var(--st-good|warning|serious|critical)` (status, always with an icon+label). One hue for a single series; never rainbow.
- **Motion**: custom easing only — `ease-fluid` (= cubic-bezier(0.32,0.72,0,1)). Transitions on `transform`/`opacity`/colour only. Page content already fades up via `(app)/template.tsx`. Use `motion/react` for layout/list animations (`AnimatePresence`, `layout`), stagger lists subtly. Respect reduced motion (globals handle CSS; for `motion` use `MotionConfig reducedMotion="user"` if you add big animations).
- **Radii**: cards 26/20 (bezel), controls `rounded-xl`, buttons/chips `rounded-full`.
- **Shadows**: only `shadow-card`, `shadow-pop`, `shadow-btn`. No default Tailwind `shadow-md`.
- **Responsive**: mobile-first. Everything works at 390px: single column, `px-5` gutters (already provided by the page wrapper), tables become stacked rows or horizontally scrollable containers (`overflow-x-auto`), sticky action bars respect the floating mobile nav (`pb-24` is already on the wrapper). Use `min-h-dvh`, never `h-screen`. Touch targets ≥ 40px. Inputs use 16px font on mobile (the `Input` component does this).
- **States**: every list/page has a skeleton loading state (`Skeleton`), a friendly `EmptyState`, and error handling (toast via `toastError`). Buttons that call the API use `loading`. Destructive actions use `useConfirm()`.
- **Copy**: plain, concise product English for Indian SMBs/agencies. Sentence case. No hype, no aphorisms, no exclamation marks.
- **Accessibility**: labels on all inputs (`Field`), focus rings are global, keyboard operable, `aria-live` where results change, colour never the only signal.

The page wrapper `(app)/template.tsx` gives `px-5 pb-24 pt-6 md:px-9 md:pb-12` and a fade-up animation. Pages are **client components** (`"use client"`) that fetch with SWR hooks. Set page `<title>` by exporting `metadata` from a tiny server `page.tsx` that renders a client component, or just skip titles.

## UI kit (all in `src/components/`)

| import | exports |
|---|---|
| `ui/button` | `Button` (variant: primary·accent·secondary·soft·ghost·danger·danger-soft; size: xs·sm·md·lg·icon·icon-sm·icon-xs; props `loading`, `leading`, `trailing`), `buttonVariants` (use on `<Link className={buttonVariants({variant:"secondary",size:"sm"})}>`) |
| `ui/input` | `Input` (`leading`, `trailing`, `invalid`), `Textarea`, `Label`, `Field` (`label`, `hint`, `error`, `right`) |
| `ui/select` | `Select` (`value`, `onValueChange`, `options: {value,label,description?,icon?}[]`, `size`, `placeholder`) — values must be non-empty strings |
| `ui/dialog` | `Modal` (`open,onOpenChange,title,description,children,footer,size: sm·md·lg·xl`), `Sheet` (right drawer; `width`) |
| `ui/menu` | `Menu, MenuTrigger(asChild), MenuContent, MenuItem(icon, danger, shortcut), MenuCheckItem, MenuSeparator, MenuLabel`, `Popover, PopoverTrigger, PopoverContent`, `Tooltip({content, children})` |
| `ui/controls` | `Switch`, `Checkbox` (`checked: boolean|"indeterminate"`, `onCheckedChange`), `Segmented` (pill tabs/filters, `options:{value,label,count?,icon?}[]`), `TabBar` (underline tabs) |
| `ui/display` | `Badge` (tone: neutral·accent·warn·danger·info·violet, `dot`), `Avatar`, `Skeleton`, `Kbd`, `Card`, `CardHeader`, `Inset`, `Progress`, `EmptyState`, `PageHeader`, `KV` |
| `ui/tag-input` | `TagInput` (`value,onChange,suggestions`), `TagChip` |
| `status` | `CampaignStatusBadge`, `TemplateStatusBadge`, `CategoryBadge`, `OptInBadge` |
| `media-uploader` | `MediaUploader` (`format: IMAGE·VIDEO·DOCUMENT`, `url`, `filename`, `onChange(uploaded)`, `onClear`) — uploads via `uploadFile()` from `@/lib/client/upload` |
| `confirm` | `useConfirm()` → `await confirm({title, description, confirmLabel, tone:"danger"})` |
| `wa/phone-frame` | `PhoneFrame({name, subtitle, height, children})` — handset with WhatsApp chrome; children are bubbles |
| `wa/template-bubble` | `TemplateBubble({content, values, time, status, highlight})` — renders any template (text/image/video/document header, buttons, **carousel**). `values` uses slot keys (`body.1`, `header.media`, `card.0.media`…); missing values fall back to the template's samples |
| `wa/message-bubble` | `MessageBubble({m, templates: Map<id,Template>, showAuthor, fresh, onRetry})` — renders any inbox `Message` |
| `wa/wa-text` | `WaText({text, resolve, highlight})` — WhatsApp *bold* _italic_ ~strike~ ```mono``` + `{{n}}` variables |
| `charts/*` | `AreaChart`, `Sparkline`, `Delta`, `HBarList`, `StackedBar`, `Funnel`, `Heatmap`, `StatTile` (see source; props are documented inline) |
| `logo` | `LogoMark`, `Wordmark` |

Toasts: `import { toast } from "sonner"`. Theme: `useTheme()`.

## Client data layer

`@/lib/client/api`: `api(url, {method, body})`, `post(url, body)`, `patch(url, body)`, `del(url)`, `qs({...})` (query string builder, skips empty), `refresh("/api/contacts", "/api/tags")` (revalidate SWR keys by prefix — call after every mutation), `run(fn, {success, error})` (try/catch → toast), `toastError(e)`, `errorMessage(e)`, `ApiError`.
`@/lib/client/hooks`: `useApi(key)`, `useConfig()` (AppConfig: mode, providerMode `mock|live`, user, workspace.settings, account, members, unread), `useDashboard(range)`, `useAnalytics(range)`, `useContacts(query)`, `useTags()`, `useSegments()`, `useTemplates(filters)`, `useTemplate(id)`, `useCampaigns(filters)`, `useCampaignDetail(id, live)`, `useRecipients(id, filters, live)`, `useConversations(filters)`, `useConversation(id)`, `useMessages(id)`, `useQuickReplies()`, `useAutomations()`, `useConnection()`.
Types: `@/lib/shared/types` (Contact, Template, TemplateContent, Campaign, CampaignMessage, Conversation, Message, AutomationRule, WorkspaceSettings, …), `@/lib/shared/analytics`.
Helpers: `@/lib/shared/utils` (`cn`, `fmtNum`, `fmtCompact`, `fmtPct`, `fmtMoney`, `ago`, `clock`, `shortDate`, `dateOnly`, `dayLabel`, `initials`, `pluralize`, `chunk`, `uniq`, `slugify`), `@/lib/shared/phone` (`normalizePhone(raw, defaultCountry)`, `formatPhone`, `countryList()`, `countryName`, `flagEmoji`), `@/lib/shared/template` (**the template brain**: `LIMITS`, `varIndexes`, `nextVarIndex`, `templateSlots(content)` → the list of values a campaign must supply, `validateTemplate({name,category,content})` → `{path,message,level}[]`, `newCard`, `emptyContent`, `previewText`, `resolveSource`), `@/lib/shared/wa-errors` (`waErrorInfo(code)` → `{title, hint}`), `@/lib/shared/constants` (`DAYS`, `TEMPLATE_LANGUAGES`, `TIMEZONES`, `EMOJIS`, `defaultSettings`).

## API (JSON; errors → `{error:{code,message,details}}` with 4xx/5xx; the `api()` helper throws `ApiError`)

- `GET /api/config` · `GET /api/dashboard?range` · `GET /api/analytics?range` · `GET|PATCH /api/workspace` (`{name?, settings?: {business_hours?, rates?, compliance?, default_country?, sim_ambient?}}`)
- **Contacts**: `GET /api/contacts?q&tags=a,b&tag_mode=any|all&opt_in&source&segment_id&sort&dir&limit&offset` → `Page<Contact>`; `POST` `{phone,name?,email?,tags?,attributes?,opt_in?,notes?}`; `GET|PATCH|DELETE /api/contacts/:id` (GET → `{contact, conversation, history[]}`); `POST /api/contacts/import` `{rows:[{phone,name?,email?,tags?,attributes?}], tags, consent, duplicates:"update"|"skip", default_country}` → `{total,created,updated,skipped,invalid[]}` (**max 5000 rows per call — chunk client-side**); `POST /api/contacts/bulk` `{filter:{ids?,q?,tags?,opt_in?,segment_id?…}, action:{type:"add_tags"|"remove_tags"|"opt_in"|"opt_out"|"delete", tags?}}` → `{affected}`; `GET /api/contacts/export?…` (CSV download); `GET /api/tags` → `(Tag&{count})[]`; `GET|POST /api/segments`, `PATCH|DELETE /api/segments/:id`, `POST /api/segments/preview` `{name,match,rules}` → `{total,opted_in}`.
- **Templates**: `GET /api/templates?status&category&q` (rows include `usage`), `POST` / `PATCH /api/templates/:id` `{name,language,category,content}` (PATCH only while DRAFT/REJECTED), `DELETE`, `POST /:id/submit` (validates, uploads sample media, sends to Meta; in demo mode it auto-approves after ~15–30s via webhook simulation), `POST /:id/duplicate`, `POST /api/templates/sync`.
- **Campaigns**: `GET /api/campaigns?status=all|running|scheduled|completed|draft&q` → `Page<Campaign>`; `POST` / `PATCH /:id` (`CampaignInput`: `{name, template_id, audience, variable_map, media_map, scheduled_at, throttle_per_min}`; PATCH only draft); `GET /:id` → `{campaign, errors[], timeline[], queued, skipped}`; `GET /:id/recipients?status=queued|sent|delivered|read|replied|failed|skipped&q&limit&offset`; `POST /:id/check` → `{ok, issues[{level:"ok"|"warning"|"error",message}], audience, cost, currency}`; `POST /:id/launch` `{when:"now"|"schedule"}`; `POST /:id/state` `{action:"pause"|"resume"|"cancel"|"unschedule"}`; `POST /:id/process` (nudge the sender — call every few seconds while a campaign page is open and status is `sending`); `POST /:id/retarget` `{retarget:"not_read"|"not_delivered"|"failed"|"read_no_reply"}` → new draft campaign; `POST /:id/duplicate`; `DELETE /:id`; `POST /api/campaigns/audience` `{audience}` → `{eligible, opted_out, pending, sample[]}`; `POST /api/campaigns/test` `{template_id, phone, variable_map, media_map}` → sends one real/simulated message.
  - `audience`: `{mode:"all"|"segment"|"tags"|"contacts"|"retarget", segment_id?, tags?, tag_match?, exclude_tags?, contact_ids?, include_pending?, skip_recent_days?}`
  - `variable_map[slotKey]`: `{source:"static", value}` | `{source:"name"|"first_name"|"phone"|"email"|"country", fallback?}` | `{source:"attribute", key, fallback?}`; `media_map[slotKey] = url`. Slot keys come from `templateSlots(template.content)`.
  - Throttle presets: 120 (gentle) · 600 · 1800 · 4800 messages/min.
- **Inbox**: `GET /api/conversations?tab=open|unread|mine|unassigned|resolved&q&limit` → `Page<ConversationListItem>`; `POST` `{contact_id}` → opens/creates the thread; `GET|PATCH /api/conversations/:id` (`{status?, assigned_to?}`; GET → `{conversation, contact, window_open, window_expires_at}`); `GET /:id/messages?before&limit` → `{messages (oldest→newest), has_more}`; `POST /:id/messages` body one of `{type:"text",body}` · `{type:"media",kind:"image|video|audio|document",url,mime?,caption?,filename?}` · `{type:"interactive",interactive:{kind:"buttons"|"list"|"cta_url",…}}` · `{type:"template",template_id,values}` · `{type:"note",body}` — non-template messages only work while `window_open` (24h) else 422 `WINDOW_CLOSED`; `POST /:id/read`. `GET|POST /api/quick-replies`, `PATCH|DELETE /:id` (`{shortcut, body}`).
- **Automations**: `GET|POST /api/automations`, `PATCH|DELETE /:id` — `{name, enabled, priority, trigger, actions[]}` (see `AutomationRule` type). Compliance keywords (STOP/START) live in workspace settings, not rules.
- **WhatsApp**: `GET /api/whatsapp/connection` → `{account, webhook_url, verify_token}`; `POST` `{phone_number_id, waba_id, access_token?, app_id?, app_secret?}` (validates against Meta, stores token encrypted); `DELETE` (disconnect); `POST /api/whatsapp/refresh`.
- **Team**: `GET|POST /api/team` (`{email,name?,role:"admin"|"agent"}`), `PATCH|DELETE /api/team/:id`.
- **Media**: use `uploadFile(file)` / `<MediaUploader>`; returns `{url, mime, filename, size, kind}`.
- **Demo tools** (local mode only): `POST /api/demo/simulate` `{contact_id, text}` injects an inbound message. **Do NOT call `/api/demo/reset` or `/api/demo/clear`** — other people are testing against the same data.

## Working rules

- Only edit the files you own (listed in your brief). Shared code (`src/components/ui`, `charts`, `wa`, `lib/**`, `app/api/**`) is read-only for you, with one exception: if you hit a clear bug that blocks you, make the smallest possible fix and **list it in your final report**. Need something new that's shared? Build it inside your own folder.
- The dev server runs with HMR. `tsc` while others are mid-edit may show errors in files you don't own — ignore those: run `npx tsc --noEmit 2>&1 | grep -E "<your path prefixes>"`. Lint your files: `npx eslint <your files>`.
- **Look at your work.** `node scripts/shot.mjs /campaigns .data/shots/campaigns.png 1440 900 light` (then open the PNG with the Read tool). Check desktop 1440, mobile 390×844, light and dark. Use the actions arg to click/type through flows (see header of `scripts/shot.mjs`). It prints console errors/failed requests — there must be none. Fix what you see: alignment, overflow, contrast, empty/loading states, long text.
- React 19 / Next 16 traps: `useSearchParams()` needs a `<Suspense>` boundary around the component that calls it; don't branch rendering on `window`/`localStorage` during render (hydration) — use effects; `<form action>` resets after submit — use `onSubmit` with state instead; never render `useReducedMotion()`-dependent markup. Don't put `overflow-x: hidden` on ancestors of sticky elements.
- Data written during testing is shared and persists; create your own test records with distinctive names and delete them when done. Don't delete seed data.
- Final report: what you built (files), anything not done/known issues, any shared-file fixes, any API gaps you noticed. Keep it under 300 words.
