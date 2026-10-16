"use client";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { LogoMark } from "@/components/logo";
import { supabaseBrowser } from "@/lib/supabase/browser";

/** A signed-in account that isn't a member of any workspace (e.g. it was removed from its team). */
export function NoWorkspace() {
  const router = useRouter();
  const signOut = async () => {
    await supabaseBrowser().auth.signOut();
    router.replace("/login");
    router.refresh();
  };
  return (
    <div className="grain relative grid min-h-dvh place-items-center px-5">
      <div className="relative z-[2] flex max-w-md flex-col items-center text-center">
        <LogoMark size={44} />
        <h1 className="mt-8 text-2xl font-medium tracking-tight">You&apos;re not part of a workspace</h1>
        <p className="mt-2 text-[15px] leading-relaxed text-ink-3">
          This account was removed from its workspace. Ask the owner to invite you again, or sign in with a different account.
        </p>
        <Button size="lg" className="mt-8" onClick={signOut}>
          Sign out
        </Button>
      </div>
    </div>
  );
}
