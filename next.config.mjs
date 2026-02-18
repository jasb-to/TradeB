/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
  // CRITICAL v5.5.8: FORCE CLEAN BUILD - Remove stale bytecode with old JP225/US100/US500 symbols
  // This marker forces Vercel to invalidate entire .next build cache
  buildId: 'xau-usd-exclusive-v5.5.8-' + Date.now(),
  onDemandEntries: {
    maxInactiveAge: 60 * 1000,
    pagesBufferLength: 5,
  },
}

export default nextConfig
