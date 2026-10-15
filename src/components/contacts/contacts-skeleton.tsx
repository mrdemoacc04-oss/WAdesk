import { Card, Skeleton } from "@/components/ui/display";

/** Shown while the URL is being read, so the page never flashes empty. */
export function ContactsSkeleton() {
  return (
    <div aria-busy="true">
      <div className="mb-7 flex items-end justify-between gap-6">
        <div>
          <Skeleton className="h-9 w-44" />
          <Skeleton className="mt-3 h-4 w-72" />
        </div>
        <Skeleton className="hidden h-10 w-56 rounded-full sm:block" />
      </div>
      <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-5">
        {[0, 1, 2, 3, 4].map((i) => (
          <Skeleton key={i} className={i === 0 ? "col-span-2 h-[88px] rounded-[20px] md:col-span-1" : "h-[88px] rounded-[20px]"} />
        ))}
      </div>
      <Skeleton className="mb-4 h-10 w-full max-w-sm" />
      <Card padded={false}>
        <div className="divide-y divide-line">
          {Array.from({ length: 8 }, (_, i) => (
            <div key={i} className="flex h-14 items-center gap-3 px-5">
              <Skeleton className="size-[18px]" />
              <Skeleton className="size-9 rounded-full" />
              <Skeleton className="h-3.5 w-40" />
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
