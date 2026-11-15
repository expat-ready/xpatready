// FO-4 part 1 (EXPERIENCE §4, concept §4 States): loading skeletons in the shape of what comes, named for screen readers.
import { Skeleton } from "@/components/ui/skeleton";
export function Loading({ label, rows = 3 }: { label: string; rows?: number }) {
  return (
    <div role="status" aria-label={label} className="flex flex-col gap-3" data-loading>
      <Skeleton className="h-7 w-48" />
      {Array.from({ length: rows }, (_, i) => <Skeleton key={i} className="h-12 w-full" />)}
    </div>
  );
}
