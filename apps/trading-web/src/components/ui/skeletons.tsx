import { cn } from '@/lib/utils';

interface SkeletonProps {
  className?: string;
}

export function Skeleton({ className }: SkeletonProps) {
  return (
    <div
      className={cn('animate-pulse rounded-md bg-trading-neutral-700', className)}
    />
  );
}

export function DashboardSkeleton() {
  return (
    <div className="h-screen flex flex-col bg-trading-bg-primary">
      {/* Header Skeleton */}
      <div className="h-16 bg-trading-bg-secondary border-b border-trading-neutral-700 flex items-center justify-between px-6">
        <div className="flex items-center space-x-6">
          <Skeleton className="h-8 w-8" />
          <Skeleton className="h-6 w-48" />
        </div>
        <div className="flex items-center space-x-4">
          <Skeleton className="h-8 w-32" />
          <Skeleton className="h-8 w-32" />
          <Skeleton className="h-8 w-32" />
        </div>
      </div>

      {/* Main Content Skeleton */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Sidebar */}
        <div className="w-80 border-r border-trading-neutral-700 bg-trading-bg-secondary p-4">
          <Skeleton className="h-10 w-full mb-4" />
          <div className="space-y-2">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </div>
        </div>

        {/* Main Trading Area */}
        <div className="flex-1 flex flex-col">
          {/* Top Section */}
          <div className="h-48 flex border-b border-trading-neutral-700">
            <div className="flex-1 p-4">
              <div className="grid grid-cols-4 gap-4 h-32">
                {Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} className="h-full" />
                ))}
              </div>
            </div>
            <div className="w-80 border-l border-trading-neutral-700 p-4">
              <Skeleton className="h-6 w-32 mb-4" />
              <div className="space-y-2">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Skeleton key={i} className="h-8 w-full" />
                ))}
              </div>
            </div>
          </div>

          {/* Chart Area */}
          <div className="flex-1 flex">
            <div className="flex-1 p-4">
              <Skeleton className="w-full h-full" />
            </div>
            <div className="w-80 border-l border-trading-neutral-700 p-4">
              <Skeleton className="h-6 w-32 mb-4" />
              <div className="space-y-4">
                <Skeleton className="h-20 w-full" />
                <Skeleton className="h-20 w-full" />
              </div>
            </div>
          </div>
        </div>

        {/* Right Panel */}
        <div className="w-96 border-l border-trading-neutral-700 bg-trading-bg-secondary">
          <div className="h-96 border-b border-trading-neutral-700 p-4">
            <Skeleton className="h-6 w-32 mb-4" />
            <div className="space-y-4">
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-12 w-full" />
            </div>
          </div>
          <div className="flex-1 p-4">
            <Skeleton className="h-6 w-32 mb-4" />
            <div className="space-y-2">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-8 w-full" />
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}