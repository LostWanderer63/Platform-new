import { Skeleton } from "../ui/Skeleton";

/** Loading placeholder matching GameRail's layout. */
export function GameRailSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div className="-mx-4 flex gap-3 overflow-hidden px-4 pb-2 sm:mx-0 sm:px-0" aria-hidden>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="w-36 shrink-0 sm:w-44">
          <Skeleton className="aspect-[3/4] w-full rounded-lg" />
          <div className="mt-2 space-y-1.5 px-1">
            <Skeleton className="h-3 w-2/3" />
            <Skeleton className="h-2.5 w-1/3" />
          </div>
        </div>
      ))}
    </div>
  );
}
