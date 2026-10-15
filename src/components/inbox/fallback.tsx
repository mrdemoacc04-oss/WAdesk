import { Skeleton } from "@/components/ui/display";

/** Same footprint as the workspace, so nothing jumps while the search params resolve. */
export function InboxFallback() {
  return (
    <div className="-mx-5 -mb-24 -mt-6 flex h-[calc(100dvh-100px)] min-h-[480px] overflow-hidden rounded-b-[20px] border-t border-line bg-surface md:-mx-9 md:-mb-12" aria-hidden>
      <div className="w-full space-y-3 p-4 md:w-[320px] md:border-r md:border-line">
        <Skeleton className="h-8 w-24" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-9 w-full rounded-full" />
        {Array.from({ length: 7 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 pt-2">
            <Skeleton className="size-10 shrink-0 rounded-full" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-3.5 w-1/2" />
              <Skeleton className="h-3 w-4/5" />
            </div>
          </div>
        ))}
      </div>
      <div className="hidden flex-1 bg-surface-2/60 md:block" />
    </div>
  );
}
