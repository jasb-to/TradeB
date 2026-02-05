import { NextResponse } from "next/server"

export const maxDuration = 60
export const dynamic = "force-dynamic"

/**
 * DEPRECATED: Symbol-specific cron endpoints have been consolidated into /api/external-cron
 * 
 * This endpoint is no longer used. All cron-jobs.org requests should hit:
 * /api/external-cron?secret=YOUR_SECRET
 */
export async function GET() {
  return NextResponse.json(
    {
      error: "DEPRECATED_ENDPOINT",
      message: "This endpoint is no longer in use. Use /api/external-cron instead.",
      correctEndpoint: "/api/external-cron",
      status: "CONSOLIDATED_INTO_EXTERNAL_CRON",
    },
    { status: 410 }
  )
}
