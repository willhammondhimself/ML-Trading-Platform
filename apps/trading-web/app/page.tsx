import { Suspense } from 'react';
import { Metadata } from 'next';
import { TradingDashboard } from '@/components/trading/dashboard';
import { DashboardSkeleton } from '@/components/ui/skeletons';
import { ErrorBoundary } from '@/components/ui/error-boundary';

export const metadata: Metadata = {
  title: 'Trading Dashboard',
  description: 'Real-time trading dashboard with market data, portfolio overview, and ML predictions.',
};

export default function HomePage() {
  return (
    <div className="min-h-screen bg-trading-bg-primary">
      <ErrorBoundary
        fallback={
          <div className="flex items-center justify-center min-h-screen">
            <div className="text-center">
              <h2 className="text-xl font-semibold text-trading-text-primary mb-2">
                Something went wrong
              </h2>
              <p className="text-trading-text-secondary mb-4">
                Please refresh the page to try again.
              </p>
              <button
                onClick={() => window.location.reload()}
                className="trading-button-primary"
              >
                Refresh Page
              </button>
            </div>
          </div>
        }
      >
        <Suspense fallback={<DashboardSkeleton />}>
          <TradingDashboard />
        </Suspense>
      </ErrorBoundary>
    </div>
  );
}

// Enable static generation for this page in production
export const dynamic = 'auto';
export const revalidate = false;