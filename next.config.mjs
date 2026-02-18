/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
  // CRITICAL v5.6.1: FORCE COMPLETE CLEAN BUILD - Remove all stale .next bytecode
  // Vercel was caching old symbol references (US500, JP225) in compiled output despite source files being correct
  buildId: 'xau-exclusive-v5.6.1-clean-' + Date.now() + '-' + Math.random().toString(36).substring(7),
  onDemandEntries: {
    maxInactiveAge: 60 * 1000,
    pagesBufferLength: 5,
  },
}

export default nextConfig
