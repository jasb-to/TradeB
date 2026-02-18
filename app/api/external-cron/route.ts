import { type NextRequest, NextResponse } from "next/server"

export const maxDuration = 60
export const dynamic = "force-dynamic"

/**
 * EXTERNAL CRON ENDPOINT - v5.5.13
 * 
 * Minimal implementation: Fetches XAU_USD signal and returns 200
 * Does NOT attempt Telegram alerts (use webhook instead)
 */
export async function GET(request: NextRequest) {
  const requestId = Math.random().toString(36).substring(7)
  
  try {
    // Verify secret
    const { searchParams } = new URL(request.url)
    const secret = searchParams.get("secret")
    const cronSecret = process.env.CRON_SECRET

    if (secret !== cronSecret) {
      console.warn(`[v0-CRON] Auth failed for requestId=${requestId}`)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    console.log(`[v0-CRON] ${requestId}: Starting`)

    const baseUrl = request.nextUrl.origin
    const signalUrl = new URL(`/api/signal/current`, baseUrl)
    signalUrl.searchParams.set("symbol", "XAU_USD")
    
    // Fetch with 30-second timeout
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 30000)
    
    const response = await fetch(signalUrl.toString(), {
      method: "GET",
      signal: controller.signal,
    })
    
    clearTimeout(timeout)

    if (!response.ok) {
      console.warn(`[v0-CRON] ${requestId}: Signal API returned ${response.status}`)
      return NextResponse.json({ 
        success: true,
        status: response.status,
        requestId 
      }, { status: 200 })
    }

    const signal = await response.json()
    
    console.log(`[v0-CRON] ${requestId}: Success - signal type=${signal.signal?.type}`)

    return NextResponse.json({
      success: true,
      signal: signal.signal,
      timestamp: new Date().toISOString(),
      requestId,
    }, { status: 200 })
    
  } catch (error) {
    console.error(`[v0-CRON] Error:`, error)
    return NextResponse.json({
      success: false,
      error: String(error),
      timestamp: new Date().toISOString(),
    }, { status: 200 })
  }
}
