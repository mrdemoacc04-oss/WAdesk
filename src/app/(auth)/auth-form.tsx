"use client";
import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { EnvelopeSimple, LockKey, Buildings } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { supabaseBrowser } from "@/lib/supabase/browser";
import { Wordmark } from "@/components/logo";

export function AuthForm({ kind }: { kind: "login" | "signup" }) {
  const router = useRouter();
  const next = useSearchParams().get("next") || "/";
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [workspace, setWorkspace] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [sent, setSent] = React.useState(false);

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
    } else {
      const { data, error } = await sb.auth.signUp({
        email,
        password,
        options: { data: { workspace_name: workspace.trim() || undefined }, emailRedirectTo: `${location.origin}/` },
      });
      if (error) setError(error.message);
      else if (data.session) {
        router.push("/");
        router.refresh();
      } else setSent(true);
    }
    setBusy(false);
  };

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
            <p className="mt-2 text-sm leading-relaxed text-ink-3">
              We sent a confirmation link to <span className="font-medium text-ink">{email}</span>. Open it to finish creating your workspace.
            </p>
          </div>
        ) : (
          <>
            <h1 className="text-[28px] font-medium tracking-[-0.03em]">{kind === "login" ? "Welcome back" : "Create your workspace"}</h1>
            <p className="mt-1.5 text-sm text-ink-3">{kind === "login" ? "Sign in to manage your WhatsApp campaigns." : "Start sending on your own WhatsApp Business number."}</p>
            <form onSubmit={submit} className="mt-7 space-y-4">
              {kind === "signup" && (
                <Field label="Workspace name" htmlFor="ws">
                  <Input id="ws" value={workspace} onChange={(e) => setWorkspace(e.target.value)} leading={<Buildings size={17} />} placeholder="Acme Studio" autoComplete="organization" />
                </Field>
              )}
              <Field label="Email" htmlFor="email">
                <Input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} leading={<EnvelopeSimple size={17} />} placeholder="you@company.com" autoComplete="email" />
              </Field>
              <Field label="Password" htmlFor="pw" hint={kind === "signup" ? "At least 8 characters." : undefined}>
                <Input id="pw" type="password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} leading={<LockKey size={17} />} placeholder="••••••••" autoComplete={kind === "login" ? "current-password" : "new-password"} />
              </Field>
              {error && (
                <p role="alert" className="rounded-xl bg-danger-soft px-3.5 py-2.5 text-sm text-danger">
                  {error}
                </p>
              )}
              <Button type="submit" size="lg" className="w-full" loading={busy}>
                {kind === "login" ? "Sign in" : "Create workspace"}
              </Button>
            </form>
            <p className="mt-6 text-center text-sm text-ink-3">
              {kind === "login" ? (
                <>
                  New here?{" "}
                  <Link href="/signup" className="font-medium text-ink underline underline-offset-4">
                    Create a workspace
                  </Link>
                </>
              ) : (
                <>
                  Already have an account?{" "}
                  <Link href="/login" className="font-medium text-ink underline underline-offset-4">
                    Sign in
                  </Link>
                </>
              )}
            </p>
          </>
        )}
      </div>
    </div>
  );
}
