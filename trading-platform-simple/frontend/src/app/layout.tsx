import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Trading Platform - ML-Powered Trading Dashboard',
  description: 'Modern trading platform with real-time market data, ML predictions, and advanced analytics',
  keywords: ['trading', 'machine learning', 'stock market', 'portfolio', 'analytics'],
  authors: [{ name: 'Trading Platform Team' }],
  viewport: 'width=device-width, initial-scale=1',
  themeColor: '#0a0a0a',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen bg-trading-bg-primary text-trading-text-primary antialiased">
        <div id="root" className="min-h-screen">
          {children}
        </div>
      </body>
    </html>
  );
}