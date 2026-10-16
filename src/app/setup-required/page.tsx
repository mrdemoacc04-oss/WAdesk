import { redirect } from "next/navigation";
import { LogoMark } from "@/components/logo";
import { setupProblem } from "@/lib/server/env";

export const dynamic = "force-dynamic";
export const metadata = { title: "Setup required", robots: { index: false, follow: false } };

/** Shown (with a 503) instead of the app whenever the deployment is missing its Supabase configuration. */
export default function Page() {
  const problem = setupProblem();
  if (!problem) redirect("/");
  return (
    <div className="grain relative grid min-h-dvh place-items-center px-5 py-10">
      <div className="relative z-[2] w-full max-w-[520px]">
        <div className="bezel shadow-pop">
          <div className="bezel-core p-7 sm:p-9">
            <LogoMark size={40} />
            <h1 className="mt-6 text-[26px] font-medium tracking-[-0.03em]">This deployment isn&apos;t connected yet</h1>
            <p className="mt-2 text-[15px] leading-relaxed text-ink-3">
              WAdesk needs its Supabase project before anyone can sign in. Until that&apos;s set up, the app stays closed on purpose — nothing is exposed.
            </p>

            <p className="mt-6 text-sm font-medium">Missing environment variables</p>
            <ul className="mt-2 space-y-1.5">
              {problem.missing.map((name) => (
                <li key={name} className="rounded-lg bg-surface-2 px-3 py-2 font-mono text-[13px] text-ink-2 hairline">
                  {name}
                </li>
              ))}
            </ul>

            <ol className="mt-6 list-decimal space-y-1.5 pl-5 text-sm leading-relaxed text-ink-3">
              <li>Open your hosting project → Settings → Environment Variables and add the variables above (for Production).</li>
              <li>Redeploy — the public variables are baked in at build time, so a new deployment is required.</li>
              <li>
                Open <span className="font-mono text-ink-2">/api/health</span> to check everything is picked up.
              </li>
            </ol>
          </div>
        </div>
      </div>
    </div>
  );
}
