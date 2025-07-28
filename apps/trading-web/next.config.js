/** @type {import('next').NextConfig} */
const nextConfig = {
  // Enable React 19 features
  experimental: {
    // reactCompiler: true, // Disabled until stable
    // after: true, // No longer needed in Next.js 15
  },

  // TypeScript configuration
  typescript: {
    ignoreBuildErrors: false,
  },

  // ESLint configuration
  eslint: {
    ignoreDuringBuilds: false,
  },

  // Image optimization
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'assets.tradingview.com',
      },
      {
        protocol: 'https',
        hostname: 'cdn.jsdelivr.net',
      },
    ],
  },

  // Headers for security
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
          {
            key: 'X-Frame-Options',
            value: 'DENY',
          },
          {
            key: 'X-XSS-Protection',
            value: '1; mode=block',
          },
          {
            key: 'Referrer-Policy',
            value: 'strict-origin-when-cross-origin',
          },
          {
            key: 'Content-Security-Policy',
            value: "default-src 'self'; script-src 'self' 'unsafe-eval' 'unsafe-inline' https://s3.tradingview.com https://charting-library.tradingview-widget.com; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self' data:; connect-src 'self' ws: wss: https://api.tradingview.com https://scanner.tradingview.com;",
          },
        ],
      },
    ];
  },

  // API rewrites for development
  async rewrites() {
    return [
      {
        source: '/api/trading/:path*',
        destination: `${process.env.TRADING_SERVICE_URL || 'http://localhost:3001'}/api/:path*`,
      },
      {
        source: '/api/market-data/:path*',
        destination: `${process.env.MARKET_DATA_SERVICE_URL || 'http://localhost:3002'}/api/:path*`,
      },
      {
        source: '/api/user/:path*',
        destination: `${process.env.USER_SERVICE_URL || 'http://localhost:3003'}/api/:path*`,
      },
      {
        source: '/api/risk/:path*',
        destination: `${process.env.RISK_SERVICE_URL || 'http://localhost:3004'}/api/:path*`,
      },
      {
        source: '/api/ml/:path*',
        destination: `${process.env.ML_SERVICE_URL || 'http://localhost:8000'}/api/:path*`,
      },
    ];
  },

  // Environment variables
  env: {
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080',
    NEXT_PUBLIC_WS_URL: process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:8080',
    NEXT_PUBLIC_TRADINGVIEW_LIBRARY_PATH: '/charting_library/',
  },

  // Output configuration for production
  output: 'standalone',

  // Webpack configuration for TradingView
  webpack: (config, { isServer }) => {
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        net: false,
        tls: false,
      };
    }

    // Handle TradingView charting library
    config.module.rules.push({
      test: /\.js$/,
      include: /charting_library/,
      use: {
        loader: 'babel-loader',
        options: {
          presets: ['@babel/preset-env'],
        },
      },
    });

    return config;
  },

  // Transpile packages
  transpilePackages: ['@ml-trading/domain', '@ml-trading/ui', '@ml-trading/auth', '@ml-trading/events'],
};

module.exports = nextConfig;