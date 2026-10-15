import Link from "next/link";
import { LogoMark } from "@/components/logo";
import { buttonVariants } from "@/components/ui/button-variants";

export default function NotFound() {
  return (
    <div className="grain relative grid min-h-dvh place-items-center px-5">
      <div className="relative z-[2] flex max-w-md flex-col items-center text-center">
        <LogoMark size={44} />
        <p className="mt-8 font-serif text-[88px] italic leading-none text-ink-3">404</p>
        <h1 className="mt-3 text-2xl font-medium tracking-tight">That page doesn&apos;t exist</h1>
        <p className="mt-2 text-[15px] leading-relaxed text-ink-3">The link may be old, or the item was deleted.</p>
        <Link href="/" className={buttonVariants({ size: "lg", className: "mt-8" })}>
          Back to dashboard
        </Link>
      </div>
    </div>
  );
}
