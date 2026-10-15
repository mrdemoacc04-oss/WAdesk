"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { Command } from "cmdk";
import { Dialog } from "radix-ui";
import { ArrowRight, ChatCircleDots, MagnifyingGlass, Megaphone, Moon, Plus, SquaresFour, UploadSimple, UserPlus } from "@phosphor-icons/react";
import { NAV_GROUPS, SETTINGS_ITEM } from "./nav";
import { useApi } from "@/lib/client/hooks";
import { useTheme } from "@/components/theme";
import { Avatar } from "@/components/ui/display";
import type { Contact, Page } from "@/lib/shared/types";
import { formatPhone } from "@/lib/shared/phone";

export function CommandPalette({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const router = useRouter();
  const { resolved, setTheme } = useTheme();
  const [q, setQ] = React.useState("");
  const [debounced, setDebounced] = React.useState("");
  React.useEffect(() => {
    const t = setTimeout(() => setDebounced(q.trim()), 200);
    return () => clearTimeout(t);
  }, [q]);
  React.useEffect(() => {
    if (!open) setQ("");
  }, [open]);

  const { data: people } = useApi<Page<Contact>>(open && debounced.length >= 2 ? `/api/contacts?q=${encodeURIComponent(debounced)}&limit=6` : null);

  const go = (href: string) => {
    onOpenChange(false);
    router.push(href);
  };

  const item =
    "flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-ink outline-none data-[selected=true]:bg-ink/[0.06] [&_svg]:text-ink-3";

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="overlay fixed inset-0 z-40 bg-ink/35 backdrop-blur-[3px]" />
        <Dialog.Content className="modal fixed left-1/2 top-[14vh] z-50 w-[calc(100vw-24px)] max-w-[560px] -translate-x-1/2 outline-none" aria-describedby={undefined}>
          <Dialog.Title className="sr-only">Command palette</Dialog.Title>
          <div className="bezel shadow-pop">
            <Command className="bezel-core overflow-hidden" label="Command palette" shouldFilter={!debounced || debounced.length < 2 ? true : true}>
              <div className="flex items-center gap-3 border-b border-line px-4">
                <MagnifyingGlass size={18} className="text-ink-3" />
                <Command.Input value={q} onValueChange={setQ} placeholder="Search contacts, jump to a page, or run an action…" className="h-14 flex-1 bg-transparent text-[16px] outline-none placeholder:text-ink-4 md:text-[15px]" />
              </div>
              <Command.List className="max-h-[min(420px,60dvh)] overflow-y-auto p-2">
                <Command.Empty className="px-4 py-10 text-center text-sm text-ink-3">Nothing found.</Command.Empty>

                <Command.Group heading="Quick actions" className="[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:text-ink-4">
                  <Command.Item className={item} onSelect={() => go("/campaigns/new")} keywords={["broadcast", "send", "create"]}>
                    <Plus size={18} /> New campaign
                  </Command.Item>
                  <Command.Item className={item} onSelect={() => go("/templates/new")} keywords={["message", "create", "carousel"]}>
                    <SquaresFour size={18} /> New template
                  </Command.Item>
                  <Command.Item className={item} onSelect={() => go("/contacts/import")} keywords={["csv", "excel", "upload"]}>
                    <UploadSimple size={18} /> Import contacts
                  </Command.Item>
                  <Command.Item className={item} onSelect={() => go("/contacts?add=1")} keywords={["new", "person"]}>
                    <UserPlus size={18} /> Add a contact
                  </Command.Item>
                  <Command.Item className={item} onSelect={() => { setTheme(resolved === "dark" ? "light" : "dark"); onOpenChange(false); }} keywords={["theme", "dark", "light"]}>
                    <Moon size={18} /> Toggle theme
                  </Command.Item>
                </Command.Group>

                <Command.Group heading="Go to" className="[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:text-ink-4">
                  {[...NAV_GROUPS.flatMap((g) => g.items), SETTINGS_ITEM].map((n) => (
                    <Command.Item key={n.href} className={item} onSelect={() => go(n.href)}>
                      <n.icon size={18} /> {n.label}
                      <ArrowRight size={14} className="ml-auto opacity-0 data-[selected=true]:opacity-100" />
                    </Command.Item>
                  ))}
                </Command.Group>

                {people && people.rows.length > 0 && (
                  <Command.Group heading="Contacts" className="[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:text-ink-4">
                    {people.rows.map((c) => (
                      <Command.Item key={c.id} value={`contact ${c.name} ${c.phone} ${c.id}`} className={item} onSelect={() => go(`/contacts?open=${c.id}`)}>
                        <Avatar name={c.name} size={26} />
                        <span className="font-medium">{c.name ?? "Unnamed"}</span>
                        <span className="ml-1 text-ink-3">{formatPhone(c.phone)}</span>
                        <ChatCircleDots size={16} className="ml-auto" />
                      </Command.Item>
                    ))}
                  </Command.Group>
                )}
              </Command.List>
              <div className="flex items-center justify-between border-t border-line bg-surface-2/60 px-4 py-2.5 text-xs text-ink-3">
                <span>↑↓ to move · ↵ to open</span>
                <span className="flex items-center gap-1.5"><Megaphone size={13} /> WAdesk</span>
              </div>
            </Command>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
