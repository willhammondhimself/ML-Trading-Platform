/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {},
  transpilePackages: [],
  images: {
    domains: ['images.unsplash.com', 'via.placeholder.com']
  },
  env: {
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8001',
    NEXT_PUBLIC_WS_URL: process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:8001'
  },
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8001'}/api/:path*`
      }
    ];
  }
};

module.exports = nextConfig;