import { type NextRequest, NextResponse } from "next/server"

export const maxDuration = 60
export const dynamic = "force-dynamic"

/**
 * LEGACY COMPATIBILITY ENDPOINT
 * 
 * This endpoint maintains backward compatibility with cron-job.org configurations
 * that are still pointing to /api/cron/signal-xau/
 * 
 * It proxies all requests to the canonical /api/external-cron endpoint
 * to ensure uninterrupted service for existing cron job schedules.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const secret = searchParams.get("secret")

  console.log(`[v0] LEGACY CRON ENDPOINT: /api/cron/signal-xau/ called - proxying to canonical /api/external-cron`)

  // Proxy to the canonical external-cron endpoint
  const externalCronUrl = new URL("/api/external-cron", request.nextUrl.origin)
  if (secret) {
    externalCronUrl.searchParams.set("secret", secret)
  }

  try {
    const response = await fetch(externalCronUrl.toString(), {
      method: "GET",
      headers: {
        "User-Agent": "legacy-cron-compat",
      },
    })

    const data = await response.json()
    console.log(`[v0] LEGACY CRON PROXY SUCCESS: Forwarded to /api/external-cron with status ${response.status}`)
    
    return NextResponse.json(data, { status: response.status })
  } catch (error) {
    console.error(`[v0] LEGACY CRON PROXY ERROR: ${String(error)}`)
    return NextResponse.json(
      { 
        error: "CRON_EXECUTION_FAILED",
        message: `Canonical cron endpoint failed: ${String(error)}`,
        endpoint: "/api/cron/signal-xau/",
        proxy_target: "/api/external-cron",
        timestamp: new Date().toISOString()
      },
      { status: 500 }
    )
  }
}

