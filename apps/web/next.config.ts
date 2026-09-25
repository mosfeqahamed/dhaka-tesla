import type { NextConfig } from 'next';

// The browser only ever talks to this origin. /api/* is forwarded to the
// Express API, so the session cookie is first-party and no CORS is needed
// (docs/architecture.md). API_URL is read at build/start time.
const apiUrl = process.env.API_URL ?? 'http://localhost:4000';

const nextConfig: NextConfig = {
  output: 'standalone', // small self-contained server for the Docker image
  poweredByHeader: false,
  async rewrites() {
    return [{ source: '/api/:path*', destination: `${apiUrl}/:path*` }];
  },
};

export default nextConfig;
