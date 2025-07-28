import type { Metadata } from 'next';
import { Inter, JetBrains_Mono } from 'next/font/google';
import { cn } from '@/lib/utils';
import { Providers } from '@/components/providers';
import { ThemeProvider } from '@/components/theme-provider';
import { Toaster } from '@/components/ui/toaster';
import './globals.css';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-sans',
  display: 'swap',
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-mono',
  display: 'swap',
});

export const metadata: Metadata = {
  title: {
    default: 'ML Trading Platform',
    template: '%s | ML Trading Platform',
  },
  description: 'Enterprise-grade ML trading platform with real-time market data, advanced analytics, and institutional-quality execution.',
  keywords: [
    'trading',
    'machine learning',
    'financial markets',
    'algorithmic trading',
    'market data',
    'portfolio management',
    'risk management',
    'quantitative finance',
  ],
  authors: [
    {
      name: 'ML Trading Platform Team',
    },
  ],
  creator: 'ML Trading Platform',
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'),
  openGraph: {
    type: 'website',
    locale: 'en_US',
    url: process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000',
    title: 'ML Trading Platform',
    description: 'Enterprise-grade ML trading platform with real-time market data and advanced analytics.',
    siteName: 'ML Trading Platform',
    images: [
      {
        url: '/og-image.png',
        width: 1200,
        height: 630,
        alt: 'ML Trading Platform',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'ML Trading Platform',
    description: 'Enterprise-grade ML trading platform with real-time market data and advanced analytics.',
    images: ['/og-image.png'],
  },
  icons: {
    icon: '/favicon.ico',
    shortcut: '/favicon-16x16.png',
    apple: '/apple-touch-icon.png',
  },
  manifest: '/site.webmanifest',
  robots: {
    index: process.env.NODE_ENV === 'production',
    follow: process.env.NODE_ENV === 'production',
    googleBot: {
      index: process.env.NODE_ENV === 'production',
      follow: process.env.NODE_ENV === 'production',
    },
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Preload critical fonts */}
        <link
          rel="preload"
          href="/fonts/inter-var.woff2"
          as="font"
          type="font/woff2"
          crossOrigin="anonymous"
        />
        <link
          rel="preload"
          href="/fonts/jetbrains-mono-var.woff2"
          as="font"
          type="font/woff2"
          crossOrigin="anonymous"
        />
        
        {/* TradingView Charting Library */}
        <link
          rel="preload"
          href="/charting_library/charting_library.min.js"
          as="script"
        />
        
        {/* Security headers via meta tags */}
        <meta httpEquiv="X-Content-Type-Options" content="nosniff" />
        <meta httpEquiv="X-Frame-Options" content="DENY" />
        <meta httpEquiv="X-XSS-Protection" content="1; mode=block" />
        <meta name="referrer" content="strict-origin-when-cross-origin" />
        
        {/* Performance hints */}
        <link rel="dns-prefetch" href="//api.tradingview.com" />
        <link rel="dns-prefetch" href="//scanner.tradingview.com" />
        <link rel="preconnect" href="//fonts.googleapis.com" />
        <link rel="preconnect" href="//fonts.gstatic.com" crossOrigin="anonymous" />
      </head>
      <body
        className={cn(
          'min-h-screen bg-trading-bg-primary font-sans antialiased selection:bg-trading-accent-blue/20',
          inter.variable,
          jetbrainsMono.variable
        )}
      >
        <ThemeProvider
          attribute="class"
          defaultTheme="dark"
          enableSystem={false}
          disableTransitionOnChange
        >
          <Providers>
            <div className="relative flex min-h-screen flex-col">
              <div className="flex-1">
                {children}
              </div>
            </div>
            <Toaster />
          </Providers>
        </ThemeProvider>

        {/* Global scripts */}
        <script
          defer
          src="/charting_library/charting_library.min.js"
          onLoad={() => {
            // TradingView library loaded
            console.log('TradingView Charting Library loaded');
          }}
        />
        
        {/* Error boundary for global errors */}
        <script
          dangerouslySetInnerHTML={{
            __html: `
              window.addEventListener('error', function(e) {
                console.error('Global error:', e.error);
                // Send to error reporting service
              });
              
              window.addEventListener('unhandledrejection', function(e) {
                console.error('Unhandled promise rejection:', e.reason);
                // Send to error reporting service
              });
            `,
          }}
        />
      </body>
    </html>
  );
}