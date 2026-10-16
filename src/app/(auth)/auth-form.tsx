"use client";
import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { EnvelopeSimple, LockKey, Buildings } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { supabaseBrowser } from "@/lib/supabase/browser";
import { safeNext } from "@/lib/shared/safe-next";
import { Wordmark } from "@/components/logo";

type Kind = "login" | "signup" | "forgot" | "reset";

const COPY: Record<Kind, { title: string; sub: string; cta: string }> = {
  login: { title: "Welcome back", sub: "Sign in to manage your WhatsApp campaigns.", cta: "Sign in" },
  signup: { title: "Create your workspace", sub: "Start sending on your own WhatsApp Business number.", cta: "Create workspace" },
  forgot: { title: "Reset your password", sub: "Enter your email and we'll send you a link to choose a new one.", cta: "Send reset link" },
  reset: { title: "Choose a password", sub: "Use at least 8 characters. You'll use it to sign in from now on.", cta: "Save password" },
};

export function AuthForm({ kind }: { kind: Kind }) {
  const router = useRouter();
  const next = safeNext(useSearchParams().get("next"));
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [confirm, setConfirm] = React.useState("");
  const [workspace, setWorkspace] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [sent, setSent] = React.useState(false);
  const [code, setCode] = React.useState("");
  const [cooldown, setCooldown] = React.useState(0);

  React.useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  /** The same email carries a link and a 6-digit code; the code works from any device or browser. */
  const verifyCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error } = await supabaseBrowser().auth.verifyOtp({ email, token: code, type: kind === "signup" ? "signup" : "recovery" });
    if (error) {
      setError(error.message.toLowerCase().includes("expired") || error.message.toLowerCase().includes("invalid") ? "That code is wrong or has expired. Check the latest email, or send a new one." : error.message);
      setBusy(false);
      return;
    }
    router.replace(kind === "signup" ? "/" : "/reset-password");
    router.refresh();
  };

  const resend = async () => {
    setError(null);
    setCooldown(30);
    const sb = supabaseBrowser();
    const { error } =
      kind === "signup"
        ? await sb.auth.resend({ type: "signup", email, options: { emailRedirectTo: `${location.origin}/auth/callback` } })
        : await sb.auth.resetPasswordForEmail(email, { redirectTo: `${location.origin}/auth/callback?next=/reset-password` });
    if (error && kind === "signup") setError(error.message);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const sb = supabaseBrowser();
    if (kind === "login") {
      const { error } = await sb.auth.signInWithPassword({ email, password });
      if (error) setError(error.message);
      else {
        router.push(next);
        router.refresh();
      }
    } else if (kind === "signup") {
      const { data, error } = await sb.auth.signUp({
        email,
        password,
        options: { data: { workspace_name: workspace.trim() || undefined }, emailRedirectTo: `${location.origin}/auth/callback` },
      });
      if (error) setError(error.message);
      else if (data.session) {
        router.push("/");
        router.refresh();
      } else {
        setSent(true);
        setCooldown(30);
      }
    } else if (kind === "forgot") {
      // Always show the same message, so this form can't be used to find out which emails have accounts.
      await sb.auth.resetPasswordForEmail(email, { redirectTo: `${location.origin}/auth/callback?next=/reset-password` });
      setSent(true);
      setCooldown(30);
    } else {
      if (password !== confirm) setError("The two passwords don't match.");
      else {
        const { error } = await sb.auth.updateUser({ password });
        if (error) setError(error.message);
        else {
          router.replace("/");
          router.refresh();
        }
      }
    }
    setBusy(false);
  };

  const c = COPY[kind];
  const needsEmail = kind !== "reset";
  const needsPassword = kind !== "forgot";

  return (
    <div className="bezel shadow-pop">
      <div className="bezel-core p-7 sm:p-9">
        <div className="mb-8 lg:hidden">
          <Wordmark />
        </div>
        {sent ? (
          <div className="py-4 text-center">
            <div className="mx-auto mb-5 grid size-14 place-items-center rounded-full bg-accent-soft text-accent-ink">
              <EnvelopeSimple size={26} />
            </div>
            <h1 className="text-2xl font-medium tracking-tight">Check your inbox</h1>
            {kind === "forgot" ? (
              <p className="mt-2 text-sm leading-relaxed text-ink-3">
                If an account exists for <span className="font-medium text-ink">{email}</span>, a link to reset the password is on its way.
              </p>
            ) : (
              <p className="mt-2 text-sm leading-relaxed text-ink-3">
                We sent a confirmation link to <span className="font-medium text-ink">{email}</span>. Open it to finish creating your workspace.
              </p>
            )}
            <form onSubmit={verifyCode} className="mt-7 space-y-3 text-left">
              <Field label="Or enter the 6-digit code from the email" htmlFor="otp">
                <Input
                  id="otp"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                  leading={<LockKey size={17} />}
                  placeholder="123456"
                  className="[&_input]:font-mono [&_input]:tracking-[0.3em]"
                />
              </Field>
              {error && (
                <p role="alert" className="rounded-xl bg-danger-soft px-3.5 py-2.5 text-sm text-danger">
                  {error}
                </p>
              )}
              <Button type="submit" size="lg" className="w-full" loading={busy} disabled={code.length !== 6}>
                Verify code
              </Button>
            </form>
            <p className="mt-5 text-sm text-ink-3">
              Nothing arrived?{" "}
              <button type="button" onClick={resend} disabled={cooldown > 0} className="font-medium text-ink underline underline-offset-4 disabled:cursor-not-allowed disabled:text-ink-4 disabled:no-underline">
                {cooldown > 0 ? `Send again in ${cooldown}s` : "Send it again"}
              </button>
            </p>
            <Link href="/login" className="mt-4 inline-block text-sm font-medium text-ink underline underline-offset-4">
              Back to sign in
            </Link>
          </div>
        ) : (
          <>
            <h1 className="text-[28px] font-medium tracking-[-0.03em]">{c.title}</h1>
            <p className="mt-1.5 text-sm text-ink-3">{c.sub}</p>
            <form onSubmit={submit} className="mt-7 space-y-4">
              {kind === "signup" && (
                <Field label="Workspace name" htmlFor="ws">
                  <Input id="ws" value={workspace} onChange={(e) => setWorkspace(e.target.value)} leading={<Buildings size={17} />} placeholder="Acme Studio" autoComplete="organization" />
                </Field>
              )}
              {needsEmail && (
                <Field label="Email" htmlFor="email">
                  <Input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} leading={<EnvelopeSimple size={17} />} placeholder="you@company.com" autoComplete="email" />
                </Field>
              )}
              {needsPassword && (
                <Field
                  label={kind === "reset" ? "New password" : "Password"}
                  htmlFor="pw"
                  hint={kind === "signup" || kind === "reset" ? "At least 8 characters." : undefined}
                  right={
                    kind === "login" ? (
                      <Link href="/forgot-password" className="text-xs font-medium text-ink-3 underline underline-offset-4 hover:text-ink">
                        Forgot password?
                      </Link>
                    ) : undefined
                  }
                >
                  <Input id="pw" type="password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} leading={<LockKey size={17} />} placeholder="••••••••" autoComplete={kind === "login" ? "current-password" : "new-password"} />
                </Field>
              )}
              {kind === "reset" && (
                <Field label="Confirm password" htmlFor="pw2">
                  <Input id="pw2" type="password" required minLength={8} value={confirm} onChange={(e) => setConfirm(e.target.value)} leading={<LockKey size={17} />} placeholder="••••••••" autoComplete="new-password" />
                </Field>
              )}
              {error && (
                <p role="alert" className="rounded-xl bg-danger-soft px-3.5 py-2.5 text-sm text-danger">
                  {error}
                </p>
              )}
              <Button type="submit" size="lg" className="w-full" loading={busy}>
                {c.cta}
              </Button>
            </form>
            <p className="mt-6 text-center text-sm text-ink-3">
              {kind === "login" && (
                <>
                  New here?{" "}
                  <Link href="/signup" className="font-medium text-ink underline underline-offset-4">
                    Create a workspace
                  </Link>
                </>
              )}
              {kind === "signup" && (
                <>
                  Already have an account?{" "}
                  <Link href="/login" className="font-medium text-ink underline underline-offset-4">
                    Sign in
                  </Link>
                </>
              )}
              {kind === "forgot" && (
                <Link href="/login" className="font-medium text-ink underline underline-offset-4">
                  Back to sign in
                </Link>
              )}
            </p>
          </>
        )}
      </div>
    </div>
  );
}
