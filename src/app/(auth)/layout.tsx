import { redirect } from "next/navigation";
import { mode } from "@/lib/server/env";
import { Wordmark } from "@/components/logo";
import { appName } from "@/lib/server/env";
import { TemplateBubble } from "@/components/wa/template-bubble";

const sample = {
  header: { format: "IMAGE" as const, media_url: "/demo/diwali.svg" },
  body: "Hi {{1}}, our Diwali Mega Sale is live! Enjoy flat {{2}} off on all packages till 31st October.",
  body_examples: ["Aarav", "25%"],
  footer: "Reply STOP to opt out",
  buttons: [{ type: "URL" as const, text: "Claim offer", url: "https://example.com" }, { type: "QUICK_REPLY" as const, text: "Not interested" }],
};

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  if (mode() === "local") redirect("/");
  return (
    <div className="grain relative grid min-h-dvh lg:grid-cols-[1.05fr_1fr]">
      <div className="relative z-[2] hidden flex-col justify-between overflow-hidden p-12 lg:flex">
        <Wordmark name={appName} />
        <div>
          <h2 className="max-w-md text-[44px] font-medium leading-[1.05] tracking-[-0.035em]">
            Every message, <span className="font-serif font-normal italic text-ink-2">delivered with intent.</span>
          </h2>
          <p className="mt-5 max-w-sm text-[15px] leading-relaxed text-ink-3">Broadcasts, a shared inbox and automations on your own WhatsApp Business number — nothing between you and your customers.</p>
        </div>
        <div className="pointer-events-none absolute -right-8 bottom-10 w-[300px] rotate-[3deg] opacity-95">
          <div className="bezel-sm">
            <div className="wa-wallpaper rounded-[14px] p-3 pt-6">
              <TemplateBubble content={sample} time="10:42" status="read" />
            </div>
          </div>
        </div>
        <p className="text-xs text-ink-4">Uses the official WhatsApp Business Cloud API.</p>
      </div>
      <div className="relative z-[2] flex items-center justify-center p-5">
        <div className="w-full max-w-[420px]">{children}</div>
      </div>
    </div>
  );
}
