import { cn } from '@/lib/utils';

interface LoadingSkeletonProps {
  className?: string;
  lines?: number;
}

export function LoadingSkeleton({ className, lines = 3 }: LoadingSkeletonProps) {
  return (
    <div className={cn('space-y-3', className)}>
      {Array.from({ length: lines }).map((_, i) => (
        <div
          key={i}
          className={cn(
            'h-4 bg-trading-bg-tertiary rounded skeleton',
            i === 0 && 'w-3/4',
            i === 1 && 'w-1/2',
            i === 2 && 'w-2/3'
          )}
        />
      ))}
    </div>
  );
}