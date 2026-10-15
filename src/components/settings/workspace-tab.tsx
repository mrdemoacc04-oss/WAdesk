"use client";
import * as React from "react";
import { AnimatePresence, motion } from "motion/react";
import { ArrowArcLeft } from "@phosphor-icons/react";
import { toast } from "sonner";
import { Card, CardHeader, Skeleton } from "@/components/ui/display";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Switch } from "@/components/ui/controls";
import { patch, refresh, toastError } from "@/lib/client/api";
import { useConfig } from "@/lib/client/hooks";
import { defaultSettings } from "@/lib/shared/constants";
import { countryList, flagEmoji } from "@/lib/shared/phone";
import { fmtMoney } from "@/lib/shared/utils";
import { currencySymbol } from "./settings-utils";

const CURRENCIES = ["INR", "USD", "EUR", "GBP", "AED"];

interface Draft {
  name: string;
  country: string;
  currency: string;
  marketing: string;
  utility: string;
  authentication: string;
  sim: boolean;
}

const RATE_KEYS = [
  { key: "marketing", label: "Marketing", hint: "Promotions, offers and announcements." },
  { key: "utility", label: "Utility", hint: "Order updates, receipts and reminders." },
  { key: "authentication", label: "Authentication", hint: "One-time passwords and login codes." },
] as const;

export function WorkspaceTab({ canEdit }: { canEdit: boolean }) {
  const { data: cfg } = useConfig();
  const [edit, setEdit] = React.useState<Partial<Draft> | null>(null);
  const [saving, setSaving] = React.useState(false);
  const countries = React.useMemo(() => countryList().map((c) => ({ value: c.code, label: `${flagEmoji(c.code)}  ${c.name}`, description: c.dial })), []);

  if (!cfg) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-52 w-full rounded-[26px]" />
        <Skeleton className="h-80 w-full rounded-[26px]" />
      </div>
    );
  }

  const s = cfg.workspace.settings;
  const base: Draft = {
    name: cfg.workspace.name,
    country: s.default_country,
    currency: s.rates.currency,
    marketing: String(s.rates.marketing),
    utility: String(s.rates.utility),
    authentication: String(s.rates.authentication),
    sim: !!s.sim_ambient,
  };
  const d: Draft = { ...base, ...edit };
  const set = (p: Partial<Draft>) => setEdit((e) => ({ ...e, ...p }));
  const dirty = edit !== null && (Object.keys(edit) as (keyof Draft)[]).some((k) => edit[k] !== base[k]);

  const num = (v: string) => (v.trim() === "" ? NaN : Number(v));
  const rateErr = (v: string) => (Number.isFinite(num(v)) && num(v) >= 0 ? undefined : "Enter a number, 0 or more.");
  const errors = { name: !d.name.trim() ? "Give your workspace a name." : undefined, marketing: rateErr(d.marketing), utility: rateErr(d.utility), authentication: rateErr(d.authentication) };
  const invalid = Object.values(errors).some(Boolean);
  const symbol = currencySymbol(d.currency);
  const demo = cfg.providerMode === "mock";

  const save = async () => {
    if (invalid) return;
    setSaving(true);
    try {
      await patch("/api/workspace", {
        name: d.name.trim(),
        settings: {
          default_country: d.country,
          rates: { currency: d.currency, marketing: num(d.marketing), utility: num(d.utility), authentication: num(d.authentication) },
          ...(demo ? { sim_ambient: d.sim } : {}),
        },
      });
      await refresh("/api/config", "/api/analytics", "/api/dashboard");
      setEdit(null);
      toast.success("Workspace saved");
    } catch (e) {
      toastError(e);
    } finally {
      setSaving(false);
    }
  };

  const resetRates = () => {
    const r = defaultSettings().rates;
    set({ currency: r.currency, marketing: String(r.marketing), utility: String(r.utility), authentication: String(r.authentication) });
  };

  return (
    <fieldset disabled={!canEdit} className="min-w-0 border-0 p-0">
      <div className="space-y-6">
        {!canEdit && <p className="rounded-2xl bg-warn-soft px-4 py-3 text-[13px] text-warn">Only owners and admins can change workspace settings.</p>}

        <Card>
          <CardHeader title="Workspace" description="The name your team sees, and the country used when a phone number has no country code." />
          <div className="grid gap-5 md:grid-cols-2">
            <Field label="Workspace name" htmlFor="ws-name" error={errors.name}>
              <Input id="ws-name" value={d.name} onChange={(e) => set({ name: e.target.value })} maxLength={80} invalid={!!errors.name} />
            </Field>
            <Field label="Default country" htmlFor="ws-country" hint="Used when you import numbers like 98765 43210 without a country code.">
              <Select id="ws-country" value={d.country} onValueChange={(country) => set({ country })} options={countries} />
            </Field>
          </div>
        </Card>

        <Card>
          <CardHeader
            title="Message pricing estimates"
            description="Used for the spend estimate on campaigns and in Analytics."
            action={
              <Button variant="ghost" size="sm" leading={<ArrowArcLeft size={14} />} onClick={resetRates}>
                Reset to defaults
              </Button>
            }
          />
          <div className="grid gap-5 md:grid-cols-4">
            <Field label="Currency" htmlFor="ws-currency">
              <Select id="ws-currency" value={d.currency} onValueChange={(currency) => set({ currency })} options={CURRENCIES.map((c) => ({ value: c, label: c, description: currencySymbol(c) }))} />
            </Field>
            {RATE_KEYS.map((r) => (
              <Field key={r.key} label={`${r.label} (per message)`} htmlFor={`rate-${r.key}`} error={errors[r.key]} hint={r.hint}>
                <Input
                  id={`rate-${r.key}`}
                  type="number"
                  inputMode="decimal"
                  min={0}
                  step="0.01"
                  value={d[r.key]}
                  onChange={(e) => set({ [r.key]: e.target.value } as Partial<Draft>)}
                  invalid={!!errors[r.key]}
                  leading={<span className="text-sm">{symbol}</span>}
                  className="[&_input]:tabular [&_input]:[appearance:textfield] [&_input::-webkit-inner-spin-button]:appearance-none [&_input::-webkit-outer-spin-button]:appearance-none"
                />
              </Field>
            ))}
          </div>
          {!invalid && (
            <p className="tabular mt-5 text-[13px] text-ink-3">
              For example, 1,000 marketing messages is about {fmtMoney(num(d.marketing) * 1000, d.currency)}.
            </p>
          )}
          <p className="mt-3 rounded-2xl bg-surface-2 px-4 py-3 text-[13px] leading-relaxed text-ink-3 hairline">
            These are estimates only. Meta charges per delivered message, and the price depends on the category and the customer&apos;s country. Check{" "}
            <a href="https://developers.facebook.com/docs/whatsapp/pricing" target="_blank" rel="noreferrer" className="font-medium text-ink underline underline-offset-2">
              Meta&apos;s current rate card
            </a>{" "}
            and set your own rates here.
          </p>
        </Card>

        {demo && (
          <Card>
            <div className="flex items-start justify-between gap-5">
              <div>
                <h3 className="text-[15px] font-medium tracking-tight">Simulate occasional customer messages</h3>
                <p className="mt-1 max-w-xl text-[13px] leading-relaxed text-ink-3">Demo mode only. Now and then a sample contact writes in, so you can see the inbox and your auto-replies working.</p>
              </div>
              <Switch checked={d.sim} onCheckedChange={(sim) => set({ sim })} aria-label="Simulate occasional customer messages" />
            </div>
          </Card>
        )}
      </div>

      <AnimatePresence>
        {dirty && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            transition={{ duration: 0.4, ease: [0.32, 0.72, 0, 1] }}
            className="sticky bottom-24 z-20 mt-6 md:bottom-5"
          >
            <div className="mx-auto max-w-xl rounded-[26px] bg-bg shadow-pop">
              <div className="bezel">
                <div className="bezel-core flex items-center justify-between gap-3 py-2.5 pl-5 pr-2.5">
                  <p className="text-sm text-ink-2">You have unsaved changes</p>
                  <div className="flex items-center gap-1.5">
                    <Button variant="ghost" size="sm" onClick={() => setEdit(null)}>
                      Discard
                    </Button>
                    <Button size="sm" loading={saving} disabled={invalid} onClick={save}>
                      Save changes
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </fieldset>
  );
}
