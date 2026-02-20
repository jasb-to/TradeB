import { NextResponse } from "next/server"
import { RedisTrades } from "@/lib/redis-trades"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export interface SystemHealth {
  status: "HEALTHY" | "DEGRADED" | "CRITICAL"
  version: string
  environment: string
  timestamp: string
  checks: {
    redisConnected: boolean
    telegramConfigured: boolean
    activeTradeCount: number
    cronHeartbeatAge?: number // seconds since last cron run
    lockTestPass?: boolean
  }
  details: string[]
}

/**
 * System Health Check Endpoint
 * Returns integrity status of all critical systems
 * Can be used by monitoring tools or UI status displays
 */
export async function GET(): Promise<NextResponse<SystemHealth>> {
  const checks = {
    redisConnected: false,
    telegramConfigured: false,
    activeTradeCount: 0,
  }
  const details: string[] = []

  try {
    // Check Redis connectivity
    try {
      const trades = await RedisTrades.getAllActiveTrades()
      checks.redisConnected = true
      checks.activeTradeCount = trades?.length || 0
      details.push(`Redis: CONNECTED (${checks.activeTradeCount} active trades)`)
    } catch (error) {
      checks.redisConnected = false
      details.push(`Redis: DISCONNECTED - ${(error as Error).message}`)
    }

    // Check Telegram configuration
    const telegramToken = process.env.TELEGRAM_BOT_TOKEN
    const telegramChatId = process.env.TELEGRAM_CHAT_ID
    checks.telegramConfigured = !!(telegramToken && telegramChatId)
    details.push(`Telegram: ${checks.telegramConfigured ? "CONFIGURED" : "NOT CONFIGURED"}`)

    // Determine overall status
    let status: "HEALTHY" | "DEGRADED" | "CRITICAL" = "HEALTHY"
    if (process.env.NODE_ENV === "production") {
      // Production: Redis REQUIRED
      if (!checks.redisConnected) {
        status = "CRITICAL"
        details.push("CRITICAL: Redis required in production but disconnected")
      }
      // Production: Telegram STRONGLY RECOMMENDED
      if (!checks.telegramConfigured) {
        status = "DEGRADED"
        details.push("WARNING: Telegram not configured - alerts will not be sent")
      }
    } else {
      // Development: More lenient
      if (!checks.redisConnected) {
        status = "DEGRADED"
        details.push("WARNING: Redis not connected - trades will not persist")
      }
    }

    return NextResponse.json({
      status,
      version: "10.3.0-PRODUCTION-SAFETY",
      environment: process.env.NODE_ENV || "unknown",
      timestamp: new Date().toISOString(),
      checks,
      details,
    })
  } catch (error) {
    console.error("[SYSTEM-HEALTH] Error:", error)
    return NextResponse.json(
      {
        status: "CRITICAL",
        version: "10.3.0-PRODUCTION-SAFETY",
        environment: process.env.NODE_ENV || "unknown",
        timestamp: new Date().toISOString(),
        checks,
        details: [`CRITICAL: ${(error as Error).message}`],
      },
      { status: 500 }
    )
  }
}
