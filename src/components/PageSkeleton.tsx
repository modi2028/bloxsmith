/** Building blocks for route loading states. */

export function SkeletonLine({ className = "" }: { className?: string }) {
  return <div className={`skeleton h-4 ${className}`} />;
}

/** Full-page centered branded loader (for lighter routes). */
export function CenteredLoader() {
  return (
    <div className="flex min-h-dvh flex-1 items-center justify-center">
      <span className="relative flex size-10 items-center justify-center">
        <span className="absolute inset-0 animate-spin rounded-full border-2 border-line border-t-ember" />
      </span>
    </div>
  );
}

/** Store / list page skeleton. */
export function StoreSkeleton() {
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-3xl flex-col px-6 py-10">
      <SkeletonLine className="mb-8 w-28" />
      <div className="mb-8 flex items-end justify-between">
        <div className="flex flex-col gap-2">
          <SkeletonLine className="h-6 w-24" />
          <SkeletonLine className="w-64" />
        </div>
        <SkeletonLine className="h-6 w-24 rounded-full" />
      </div>
      <div className="skeleton mb-8 h-44 w-full rounded-2xl" />
      <SkeletonLine className="mb-3 w-24" />
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="skeleton h-44 rounded-2xl" />
        <div className="skeleton h-44 rounded-2xl" />
        <div className="skeleton h-44 rounded-2xl" />
      </div>
    </div>
  );
}

/** Settings page skeleton. */
export function SettingsSkeleton() {
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-xl flex-col px-6 py-10">
      <SkeletonLine className="mb-8 w-28" />
      <div className="mb-8 flex items-center gap-4">
        <div className="skeleton size-14 rounded-full" />
        <div className="flex flex-col gap-2">
          <SkeletonLine className="h-5 w-40" />
          <SkeletonLine className="w-52" />
        </div>
      </div>
      <div className="flex flex-col gap-4">
        <div className="skeleton h-28 rounded-2xl" />
        <div className="skeleton h-24 rounded-2xl" />
        <div className="skeleton h-24 rounded-2xl" />
      </div>
    </div>
  );
}
