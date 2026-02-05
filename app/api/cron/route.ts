import { type NextRequest, NextResponse } from "next/server"

export const maxDuration = 60
export const dynamic = "force-dynamic"

/**
 * DEPRECATED: This endpoint has been consolidated into /api/external-cron
 * 
 * All cron-jobs.org requests should hit /api/external-cron instead.
 * This endpoint now proxies to the canonical execution path.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const secret = searchParams.get("secret")

  // Proxy to the canonical external-cron endpoint
  const externalCronUrl = new URL("/api/external-cron", request.nextUrl.origin)
  if (secret) {
    externalCronUrl.searchParams.set("secret", secret)
  }

  console.log(`[v0] CRON DEPRECATED: Proxying to canonical /api/external-cron`)

  try {
    const response = await fetch(externalCronUrl.toString(), {
      method: "GET",
      headers: {
        "User-Agent": "internal-proxy",
      },
    })

    const data = await response.json()
    return NextResponse.json(data, { status: response.status })
  } catch (error) {
    console.error(`[v0] CRON PROXY ERROR:`, error)
    return NextResponse.json(
      { error: "Canonical cron endpoint failed", message: String(error) },
      { status: 500 }
    )
  }
}
