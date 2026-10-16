"use client";
import * as React from "react";
import { AnimatePresence, motion } from "motion/react";
import { ArrowClockwise, ArrowSquareOut, CheckCircle, Eye, EyeSlash, Flask, LockKey, Plugs, ArrowsClockwise, WarningCircle, WhatsappLogo } from "@phosphor-icons/react";
import { toast } from "sonner";
import { Badge, Card, CardHeader, Inset, Skeleton } from "@/components/ui/display";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { useConfirm } from "@/components/confirm";
import { del, errorMessage, post, refresh, toastError } from "@/lib/client/api";
import { useConfig, useConnection } from "@/lib/client/hooks";
import { ago } from "@/lib/shared/utils";
import { CopyButton } from "./copy-button";
import { qualityView, tierLabel, tierNote } from "./settings-utils";

/* ───────── status ───────── */

function StatusCard() {
  const { data: cfg } = useConfig();
  const [busy, setBusy] = React.useState(false);
  const account = cfg?.account;
  if (!account) return null;

  const q = qualityView(account.quality_rating);
  const isError = account.status === "error";

  const doRefresh = async () => {
    setBusy(true);
    try {
      await post("/api/whatsapp/refresh");
      await refresh("/api/config", "/api/whatsapp");
      toast.success("Checked with Meta just now");
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 items-center gap-4">
          <span className="grid size-14 shrink-0 place-items-center rounded-2xl bg-accent-soft text-accent-ink">
            <WhatsappLogo size={28} weight="fill" />
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <h2 className="truncate text-xl font-medium tracking-tight">{account.verified_name ?? "Your WhatsApp number"}</h2>
              <Badge tone={isError ? "danger" : "accent"} dot>
                {isError ? "Needs attention" : "Connected"}
              </Badge>
            </div>
            <p className="mt-1 font-mono text-sm text-ink-3">{account.display_phone_number ?? "Number not available"}</p>
          </div>
        </div>
        <Button variant="secondary" leading={<ArrowsClockwise size={16} />} loading={busy} onClick={doRefresh}>
          Refresh
        </Button>
      </div>

      {isError && account.status_message && (
        <p role="alert" className="mt-5 flex items-start gap-2.5 rounded-2xl bg-danger-soft px-4 py-3 text-sm leading-relaxed text-danger">
          <WarningCircle size={18} weight="fill" className="mt-0.5 shrink-0" />
          {account.status_message}
        </p>
      )}

      <div className="mt-6 grid gap-3 md:grid-cols-3">
        <Inset>
          <p className="text-[13px] text-ink-3">Quality rating</p>
          <div className="mt-2.5">
            <Badge tone={q.tone} dot size="md">
              {q.label}
            </Badge>
          </div>
          <p className="mt-2.5 text-xs leading-relaxed text-ink-3">{q.note}</p>
        </Inset>
        <Inset>
          <p className="text-[13px] text-ink-3">Messaging limit</p>
          <p className="mt-2.5 text-[15px] font-medium tracking-tight">{tierLabel(account.messaging_limit_tier)}</p>
          <p className="mt-1.5 text-xs leading-relaxed text-ink-3">{tierNote(account.messaging_limit_tier)}</p>
        </Inset>
        <Inset>
          <p className="text-[13px] text-ink-3">Last checked</p>
          <p className="mt-2.5 text-[15px] font-medium tracking-tight">{account.last_checked_at ? ago(account.last_checked_at) : "Not yet"}</p>
          <p className="mt-1.5 text-xs leading-relaxed text-ink-3">Updates automatically when Meta sends a quality change.</p>
        </Inset>
      </div>

      {!isError && account.status_message && <p className="mt-4 text-xs text-ink-3">{account.status_message}</p>}
    </Card>
  );
}

/* ───────── connection form ───────── */

type Fields = { phone_number_id: string; waba_id: string; access_token: string; app_id: string; app_secret: string };

function SecretInput({
  id,
  value,
  onChange,
  placeholder,
  invalid,
  label,
}: {
  id: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  invalid?: boolean;
  label: string;
}) {
  const [show, setShow] = React.useState(false);
  return (
    <Input
      id={id}
      type={show ? "text" : "password"}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      invalid={invalid}
      autoComplete="new-password"
      autoCorrect="off"
      autoCapitalize="none"
      spellCheck={false}
      className="[&_input]:font-mono"
      trailing={
        <button
          type="button"
          onClick={() => setShow((s) => !s)}
          aria-label={show ? `Hide ${label}` : `Show ${label}`}
          aria-pressed={show}
          className="grid size-7 place-items-center rounded-full text-ink-3 transition-colors hover:bg-ink/[0.06] hover:text-ink"
        >
          {show ? <EyeSlash size={17} /> : <Eye size={17} />}
        </button>
      }
    />
  );
}

function ConnectionForm({ canEdit }: { canEdit: boolean }) {
  const { data: cfg } = useConfig();
  const account = cfg?.account && cfg.account.status !== "disconnected" ? cfg.account : null;
  const [edit, setEdit] = React.useState<Partial<Fields>>({});
  const [tried, setTried] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [okName, setOkName] = React.useState<string | null>(null);

  const val = (k: keyof Fields): string => {
    if (edit[k] !== undefined) return edit[k]!;
    if (k === "phone_number_id") return cfg?.account?.phone_number_id ?? "";
    if (k === "waba_id") return cfg?.account?.waba_id ?? "";
    if (k === "app_id") return cfg?.account?.app_id ?? "";
    return "";
  };
  const set = (k: keyof Fields) => (v: string) => {
    setEdit((e) => ({ ...e, [k]: v }));
    setError(null);
    setOkName(null);
  };

  const hasToken = !!cfg?.account?.has_token && cfg.account.status !== "disconnected";
  const hasSecret = !!cfg?.account?.has_app_secret && cfg.account.status !== "disconnected";
  const liveDeploy = cfg?.mode === "supabase";

  const errs = {
    phone_number_id: !/^\d{5,40}$/.test(val("phone_number_id").trim()) ? "The Phone number ID is a long number with digits only." : undefined,
    waba_id: !/^\d{5,40}$/.test(val("waba_id").trim()) ? "The WhatsApp Business Account ID is a long number with digits only." : undefined,
    access_token: !val("access_token").trim() && !hasToken ? "Paste your permanent access token." : undefined,
    app_id: val("app_id").trim() && !/^\d{5,40}$/.test(val("app_id").trim()) ? "The App ID is digits only." : undefined,
    // On a live deployment the app secret is how WAdesk proves a webhook call really came from Meta.
    app_secret: liveDeploy && !val("app_secret").trim() && !hasSecret ? "Paste your app secret — it's required to verify webhooks from Meta." : undefined,
  };
  const invalid = Object.values(errs).some(Boolean);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setTried(true);
    setError(null);
    if (invalid) return;
    setBusy(true);
    try {
      const body: Record<string, string> = { phone_number_id: val("phone_number_id").trim(), waba_id: val("waba_id").trim() };
      if (val("access_token").trim()) body.access_token = val("access_token").trim();
      if (val("app_id").trim()) body.app_id = val("app_id").trim();
      if (val("app_secret").trim()) body.app_secret = val("app_secret").trim();
      const res = await post<{ verified_name?: string | null }>("/api/whatsapp/connection", body);
      setEdit({});
      setTried(false);
      setOkName(res?.verified_name ?? "your number");
      toast.success(res?.verified_name ? `Connected to ${res.verified_name}` : "WhatsApp connected");
      await refresh("/api/config", "/api/whatsapp", "/api/dashboard");
    } catch (err) {
      const msg = errorMessage(err);
      setError(msg);
      toast.error(msg);
    } finally {
      setBusy(false);
    }
  };

  const show = tried ? errs : ({} as typeof errs);

  return (
    <Card id="connect" className="scroll-mt-6">
      <CardHeader
        title={account ? "Update connection" : "Connect WhatsApp Cloud API"}
        description={
          <>
            Paste the details from your Meta app. We check them with Meta before saving.{" "}
            <a href="https://developers.facebook.com/apps/" target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 whitespace-nowrap font-medium text-ink-2 underline decoration-ink/25 underline-offset-4 transition-colors hover:text-ink hover:decoration-ink">
              Open Meta for Developers <ArrowSquareOut size={12} />
            </a>
          </>
        }
      />
      <form onSubmit={submit} noValidate>
        <fieldset disabled={!canEdit || busy} className="min-w-0 space-y-5 border-0 p-0">
          <div className="grid gap-5 md:grid-cols-2">
            <Field
              label="Phone number ID"
              htmlFor="wa-pnid"
              error={show.phone_number_id}
              hint="In WhatsApp Manager, open API setup. It's listed under the phone number you picked, and it is not the number itself."
            >
              <Input id="wa-pnid" value={val("phone_number_id")} onChange={(e) => set("phone_number_id")(e.target.value)} inputMode="numeric" placeholder="108204567890123" invalid={!!show.phone_number_id} autoComplete="off" className="[&_input]:font-mono" />
            </Field>
            <Field
              label="WhatsApp Business Account ID"
              htmlFor="wa-waba"
              error={show.waba_id}
              hint="Same API setup page. Also in Business settings → Accounts → WhatsApp accounts."
            >
              <Input id="wa-waba" value={val("waba_id")} onChange={(e) => set("waba_id")(e.target.value)} inputMode="numeric" placeholder="204567890123456" invalid={!!show.waba_id} autoComplete="off" className="[&_input]:font-mono" />
            </Field>
          </div>

          <Field
            label="Permanent access token"
            htmlFor="wa-token"
            error={show.access_token}
            hint={
              <>
                Create it in Business settings → Users → System users → Generate token. Give it the whatsapp_business_management and whatsapp_business_messaging permissions. The temporary token on the API setup page expires in 24 hours.
              </>
            }
            right={hasToken ? <span className="inline-flex items-center gap-1 text-accent-ink"><LockKey size={12} weight="fill" /> Saved</span> : undefined}
          >
            <SecretInput id="wa-token" label="access token" value={val("access_token")} onChange={set("access_token")} placeholder={hasToken ? "••••••• saved — leave blank to keep" : "Paste your token"} invalid={!!show.access_token} />
          </Field>

          <div className="grid gap-5 md:grid-cols-2">
            <Field
              label="App ID (optional)"
              htmlFor="wa-appid"
              error={show.app_id}
              hint="Needed to upload sample images, videos and documents for templates. Meta for Developers → your app → App settings → Basic."
            >
              <Input id="wa-appid" value={val("app_id")} onChange={(e) => set("app_id")(e.target.value)} inputMode="numeric" placeholder="123456789012345" invalid={!!show.app_id} autoComplete="off" className="[&_input]:font-mono" />
            </Field>
            <Field
              label={liveDeploy ? "App secret" : "App secret (optional)"}
              htmlFor="wa-secret"
              error={show.app_secret}
              hint="Used to check that webhook calls really come from Meta. Same Basic settings page, click Show."
              right={hasSecret ? <span className="inline-flex items-center gap-1 text-accent-ink"><LockKey size={12} weight="fill" /> Saved</span> : undefined}
            >
              <SecretInput id="wa-secret" label="app secret" value={val("app_secret")} onChange={set("app_secret")} placeholder={hasSecret ? "••••••• saved" : "Paste your app secret"} />
            </Field>
          </div>
        </fieldset>

        <AnimatePresence mode="wait" initial={false}>
          {error && (
            <motion.div key="err" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.3, ease: [0.32, 0.72, 0, 1] }} role="alert" className="mt-5 flex items-start gap-2.5 rounded-2xl bg-danger-soft px-4 py-3 text-sm leading-relaxed text-danger">
              <WarningCircle size={18} weight="fill" className="mt-0.5 shrink-0" />
              <div className="min-w-0">
                <p className="font-medium">Meta didn&apos;t accept these details</p>
                <p className="mt-0.5 break-words">{error}</p>
              </div>
            </motion.div>
          )}
          {okName && !error && (
            <motion.div key="ok" initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.45, ease: [0.32, 0.72, 0, 1] }} role="status" className="mt-5 flex items-center gap-2.5 rounded-2xl bg-accent-soft px-4 py-3 text-sm text-accent-ink">
              <CheckCircle size={20} weight="fill" />
              Connected to {okName}. Your token is stored encrypted and won&apos;t be shown again.
            </motion.div>
          )}
        </AnimatePresence>

        <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
          <p className="flex items-center gap-2 text-xs text-ink-3">
            <LockKey size={14} /> The token is encrypted on our server and is never displayed.
          </p>
          <Button type="submit" loading={busy} disabled={!canEdit} leading={!busy ? <Plugs size={16} /> : undefined}>
            {account ? "Save connection" : "Connect"}
          </Button>
        </div>
      </form>
    </Card>
  );
}

/* ───────── webhook ───────── */

function CopyRow({ label, value, loading }: { label: string; value: string | null | undefined; loading?: boolean }) {
  return (
    <div>
      <p className="mb-1.5 text-[13px] font-medium text-ink-2">{label}</p>
      <div className="flex items-center gap-2 rounded-xl bg-surface-2 py-1.5 pl-3.5 pr-1.5 hairline">
        {loading ? <Skeleton className="h-5 flex-1" /> : value ? <code className="min-w-0 flex-1 break-all font-mono text-[13px] leading-snug">{value}</code> : <span className="flex-1 text-sm text-ink-3">Available after you connect a number</span>}
        {value && <CopyButton text={value} label={`Copy ${label.toLowerCase()}`} iconOnly variant="ghost" toastMessage={`${label} copied`} />}
      </div>
    </div>
  );
}

function WebhookCard() {
  const { data: conn, isLoading } = useConnection();
  const localhost = !!conn && /\/\/(localhost|127\.0\.0\.1|\[::1\])/.test(conn.webhook_url);

  const steps = [
    <>Open your app in Meta for Developers, then go to <b className="font-medium text-ink">WhatsApp → Configuration</b>.</>,
    <>Under Webhook, click Edit. Paste the callback URL and verify token above, then <b className="font-medium text-ink">Verify and save</b>.</>,
    <>Click Manage and subscribe to <code className="font-mono text-[12.5px] text-ink">messages</code>, <code className="font-mono text-[12.5px] text-ink">message_template_status_update</code> and <code className="font-mono text-[12.5px] text-ink">phone_number_quality_update</code>.</>,
  ];

  return (
    <Card>
      <CardHeader title="Webhook" description="Lets Meta tell WAdesk about replies, delivery receipts and template approvals." />
      <div className="space-y-4">
        <CopyRow label="Callback URL" value={conn?.webhook_url} loading={isLoading} />
        <CopyRow label="Verify token" value={conn?.verify_token} loading={isLoading} />
      </div>

      <ol className="mt-6 space-y-4">
        {steps.map((s, i) => (
          <li key={i} className="flex gap-3.5 text-[13.5px] leading-relaxed text-ink-2">
            <span className="tabular grid size-6 shrink-0 place-items-center rounded-full bg-ink/[0.07] text-xs font-medium text-ink-2">{i + 1}</span>
            <span className="pt-px">{s}</span>
          </li>
        ))}
      </ol>

      <p className={`mt-6 rounded-2xl px-4 py-3 text-[13px] leading-relaxed ${localhost ? "bg-warn-soft text-warn" : "bg-surface-2 text-ink-3 hairline"}`}>
        Meta can only reach public https addresses. On localhost, run a tunnel such as ngrok or cloudflared and use its https address followed by <code className="font-mono text-[12px]">/api/webhooks/whatsapp</code>. In production, use your Vercel URL.
      </p>
    </Card>
  );
}

/* ───────── maintenance ───────── */

function ActionsCard({ canEdit }: { canEdit: boolean }) {
  const { data: cfg } = useConfig();
  const confirm = useConfirm();
  const [syncing, setSyncing] = React.useState(false);
  const [leaving, setLeaving] = React.useState(false);
  const connected = !!cfg?.account && cfg.account.status !== "disconnected";

  const sync = async () => {
    setSyncing(true);
    try {
      const r = await post<{ imported: number; updated: number; mode: "mock" | "live" }>("/api/templates/sync");
      await refresh("/api/templates");
      if (r.mode === "mock") toast.info("Demo mode: nothing to sync. Templates here are simulated.");
      else toast.success(`Synced from Meta: ${r.imported} new, ${r.updated} updated`);
    } catch (e) {
      toastError(e);
    } finally {
      setSyncing(false);
    }
  };

  const disconnect = async () => {
    const ok = await confirm({
      title: "Disconnect WhatsApp?",
      description: "Sending stops straight away and your saved token is deleted. Contacts, templates, campaigns and chats stay as they are. You can connect again at any time.",
      confirmLabel: "Disconnect",
      tone: "danger",
    });
    if (!ok) return;
    setLeaving(true);
    try {
      await del("/api/whatsapp/connection");
      await refresh("/api/config", "/api/whatsapp", "/api/dashboard");
      toast.success("WhatsApp disconnected");
    } catch (e) {
      toastError(e);
    } finally {
      setLeaving(false);
    }
  };

  return (
    <Card>
      <fieldset disabled={!canEdit} className="min-w-0 border-0 p-0">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="min-w-0 max-w-sm">
            <h3 className="text-[15px] font-medium tracking-tight">Sync templates from Meta</h3>
            <p className="mt-1 text-[13px] leading-relaxed text-ink-3">Pull in templates you created in WhatsApp Manager and refresh their approval status.</p>
          </div>
          <Button variant="secondary" leading={<ArrowClockwise size={16} />} loading={syncing} onClick={sync} disabled={!connected}>
            Sync templates
          </Button>
        </div>
        <div className="my-5 h-px bg-line" />
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="min-w-0 max-w-sm">
            <h3 className="text-[15px] font-medium tracking-tight">Disconnect</h3>
            <p className="mt-1 text-[13px] leading-relaxed text-ink-3">Stop sending and delete the saved token. Your data stays.</p>
          </div>
          <Button variant="danger-soft" loading={leaving} onClick={disconnect} disabled={!connected}>
            Disconnect
          </Button>
        </div>
      </fieldset>
    </Card>
  );
}

/* ───────── tab ───────── */

export function WhatsappTab({ canEdit }: { canEdit: boolean }) {
  const { data: cfg } = useConfig();

  if (!cfg) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-60 w-full rounded-[26px]" />
        <div className="grid gap-6 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
          <Skeleton className="h-[520px] w-full rounded-[26px]" />
          <Skeleton className="h-[520px] w-full rounded-[26px]" />
        </div>
      </div>
    );
  }

  const connected = !!cfg.account && cfg.account.status !== "disconnected";

  return (
    <div className="space-y-6">
      {cfg.providerMode === "mock" && (
        <div className="flex flex-wrap items-center gap-x-5 gap-y-3 rounded-3xl bg-info-soft px-5 py-4 text-info" role="status">
          <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-info/15">
            <Flask size={22} />
          </span>
          <div className="min-w-0 flex-1 basis-72">
            <p className="text-[15px] font-medium">You&apos;re in demo mode</p>
            <p className="mt-0.5 text-sm leading-relaxed opacity-90">Messages are simulated. Connect your Cloud API below to send for real.</p>
          </div>
          <Button variant="secondary" size="sm" onClick={() => document.getElementById("connect")?.scrollIntoView({ behavior: "smooth", block: "start" })}>
            Go to connection
          </Button>
        </div>
      )}

      {!canEdit && <p className="rounded-2xl bg-warn-soft px-4 py-3 text-[13px] text-warn">Only owners and admins can change the WhatsApp connection.</p>}

      {connected && <StatusCard />}

      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
        <div className="lg:col-start-1 lg:row-start-1">
          <ConnectionForm canEdit={canEdit} />
        </div>
        <div className="lg:sticky lg:top-6 lg:col-start-2 lg:row-span-2 lg:row-start-1">
          <WebhookCard />
        </div>
        <div className="lg:col-start-1 lg:row-start-2">
          <ActionsCard canEdit={canEdit} />
        </div>
      </div>
    </div>
  );
}
