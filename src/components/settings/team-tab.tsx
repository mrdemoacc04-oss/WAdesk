"use client";
import * as React from "react";
import { AnimatePresence, motion } from "motion/react";
import { EnvelopeSimple, Plus, Trash, UsersThree } from "@phosphor-icons/react";
import { toast } from "sonner";
import { Avatar, Badge, Card, CardHeader, EmptyState, Skeleton } from "@/components/ui/display";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/dialog";
import { Field, Input } from "@/components/ui/input";
import { Segmented } from "@/components/ui/controls";
import { Select } from "@/components/ui/select";
import { useConfirm } from "@/components/confirm";
import { del, errorMessage, patch, post, refresh, toastError } from "@/lib/client/api";
import { useApi, useConfig } from "@/lib/client/hooks";
import { dateOnly } from "@/lib/shared/utils";
import type { Member } from "@/lib/shared/types";

const ROLE_NOTE: Record<"admin" | "agent", string> = {
  admin: "Manages settings, the WhatsApp connection and the team, and can do everything an agent can.",
  agent: "Replies to customers in the inbox and works with contacts. Can't change settings or the team.",
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function InviteModal({ open, onOpenChange, mode }: { open: boolean; onOpenChange: (o: boolean) => void; mode: "local" | "supabase" | undefined }) {
  const [email, setEmail] = React.useState("");
  const [name, setName] = React.useState("");
  const [role, setRole] = React.useState<"admin" | "agent">("agent");
  const [busy, setBusy] = React.useState(false);
  const [tried, setTried] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (open) {
      setEmail("");
      setName("");
      setRole("agent");
      setTried(false);
      setError(null);
    }
  }, [open]);

  const emailError = tried && !EMAIL_RE.test(email.trim()) ? "Enter a valid email address." : undefined;

  const submit = async () => {
    setTried(true);
    setError(null);
    if (!EMAIL_RE.test(email.trim())) return;
    setBusy(true);
    try {
      await post("/api/team", { email: email.trim(), name: name.trim() || undefined, role });
      await refresh("/api/team", "/api/config");
      toast.success(mode === "supabase" ? `Invite sent to ${email.trim()}` : `${name.trim() || email.trim()} added to the team`);
      onOpenChange(false);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title="Invite a teammate"
      description={mode === "supabase" ? "They'll get an email with a link to join your workspace." : "In demo mode the teammate is added straight away and no email is sent."}
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button loading={busy} onClick={() => submit()} leading={mode === "supabase" ? <EnvelopeSimple size={16} /> : undefined}>
            {mode === "supabase" ? "Send invite" : "Add teammate"}
          </Button>
        </>
      }
    >
      <div
        className="space-y-5 pt-1"
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.target as HTMLElement).tagName === "INPUT") {
            e.preventDefault();
            void submit();
          }
        }}
      >
        <Field label="Email" htmlFor="invite-email" error={emailError}>
          <Input id="invite-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@company.com" autoComplete="off" invalid={!!emailError} autoFocus />
        </Field>
        <Field label="Name (optional)" htmlFor="invite-name">
          <Input id="invite-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Priya Nair" autoComplete="off" maxLength={120} />
        </Field>
        <Field label="Role">
          <Segmented
            aria-label="Role"
            value={role}
            onValueChange={setRole}
            options={[
              { value: "agent", label: "Agent" },
              { value: "admin", label: "Admin" },
            ]}
          />
          <p className="mt-1 text-[13px] leading-relaxed text-ink-3" aria-live="polite">
            {ROLE_NOTE[role]}
          </p>
        </Field>
        {error && (
          <p role="alert" className="rounded-xl bg-danger-soft px-3.5 py-2.5 text-sm text-danger">
            {error}
          </p>
        )}
      </div>
    </Modal>
  );
}

export function TeamTab({ canEdit }: { canEdit: boolean }) {
  const { data: cfg } = useConfig();
  const { data: members, isLoading } = useApi<Member[]>("/api/team");
  const confirm = useConfirm();
  const [invite, setInvite] = React.useState(false);
  const [busyId, setBusyId] = React.useState<string | null>(null);

  const changeRole = async (m: Member, role: "admin" | "agent") => {
    if (role === m.role) return;
    setBusyId(m.id);
    try {
      await patch(`/api/team/${m.id}`, { role });
      await refresh("/api/team", "/api/config");
      toast.success(`${m.name} is now ${role === "admin" ? "an admin" : "an agent"}`);
    } catch (e) {
      toastError(e);
    } finally {
      setBusyId(null);
    }
  };

  const remove = async (m: Member) => {
    const ok = await confirm({
      title: `Remove ${m.name}?`,
      description: "They lose access to this workspace straight away. Chats they handled stay in the inbox.",
      confirmLabel: "Remove",
      tone: "danger",
    });
    if (!ok) return;
    setBusyId(m.id);
    try {
      await del(`/api/team/${m.id}`);
      await refresh("/api/team", "/api/config");
      toast.success(`${m.name} removed`);
    } catch (e) {
      toastError(e);
    } finally {
      setBusyId(null);
    }
  };

  const meId = cfg?.user.id;

  return (
    <div className="space-y-6">
      {!canEdit && <p className="rounded-2xl bg-warn-soft px-4 py-3 text-[13px] text-warn">Only owners and admins can invite or remove teammates.</p>}
      <Card>
        <CardHeader
          title="Team"
          description={members ? `${members.length} ${members.length === 1 ? "person" : "people"} in this workspace.` : undefined}
          action={
            <Button trailing={<Plus size={14} />} onClick={() => setInvite(true)} disabled={!canEdit}>
              Invite teammate
            </Button>
          }
        />

        {isLoading || !members ? (
          <div className="space-y-3">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </div>
        ) : members.length === 0 ? (
          <EmptyState icon={<UsersThree />} title="Just you so far" description="Invite teammates so they can answer customers from the shared inbox." />
        ) : (
          <ul className="divide-y divide-line">
            <AnimatePresence initial={false}>
              {members.map((m) => {
                const isOwner = m.role === "owner";
                const me = m.user_id === meId;
                return (
                  <motion.li key={m.id} layout initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, transition: { duration: 0.15 } }} className="flex flex-wrap items-center gap-x-4 gap-y-3 py-4 first:pt-0 last:pb-0">
                    <Avatar name={m.name} seed={m.email} size={42} />
                    <div className="min-w-0 flex-1 basis-48">
                      <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
                        <span className="truncate">{m.name}</span>
                        {me && (
                          <Badge size="sm" tone="neutral">
                            You
                          </Badge>
                        )}
                      </p>
                      <p className="truncate text-[13px] text-ink-3">{m.email}</p>
                      <p className="text-xs text-ink-4">Joined {dateOnly(m.created_at)}</p>
                    </div>
                    <div className="ml-[58px] flex items-center gap-2 sm:ml-0">
                      {isOwner ? (
                        <Badge tone="violet">Owner</Badge>
                      ) : (
                        <Select
                          size="sm"
                          className="w-[112px]"
                          aria-label={`Role for ${m.name}`}
                          value={m.role}
                          disabled={!canEdit || busyId === m.id}
                          onValueChange={(r) => changeRole(m, r as "admin" | "agent")}
                          options={[
                            { value: "admin", label: "Admin" },
                            { value: "agent", label: "Agent" },
                          ]}
                        />
                      )}
                      <Button variant="ghost" size="icon-sm" aria-label={`Remove ${m.name}`} onClick={() => remove(m)} disabled={isOwner || me || !canEdit || busyId === m.id} className={isOwner || me ? "invisible" : ""}>
                        <Trash size={16} />
                      </Button>
                    </div>
                  </motion.li>
                );
              })}
            </AnimatePresence>
          </ul>
        )}
      </Card>

      <div className="grid gap-4 md:grid-cols-3">
        {[
          { title: "Owner", body: "Created the workspace. Can do everything, and can't be removed." },
          { title: "Admin", body: ROLE_NOTE.admin },
          { title: "Agent", body: ROLE_NOTE.agent },
        ].map((r) => (
          <div key={r.title} className="rounded-2xl bg-surface-2 p-4 hairline">
            <p className="text-sm font-medium">{r.title}</p>
            <p className="mt-1 text-[13px] leading-relaxed text-ink-3">{r.body}</p>
          </div>
        ))}
      </div>

      <InviteModal open={invite} onOpenChange={setInvite} mode={cfg?.mode} />
    </div>
  );
}
