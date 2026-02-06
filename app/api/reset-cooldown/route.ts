import { NextResponse } from "next/server"
import { SignalCache } from "@/lib/signal-cache"

export async function POST(request: Request) {
  try {
    const { symbol } = await request.json()
    
    if (!symbol) {
      return NextResponse.json(
        { success: false, error: "Symbol parameter is required" },
        { status: 400 }
      )
    }

    console.log(`[v0] COOLDOWN RESET REQUEST: ${symbol}`)
    
    // Reset the cooldown for the specified symbol
    SignalCache.resetCooldown(symbol)
    
    // Get the detailed state after reset
    const state = SignalCache.getDetailedState(symbol)
    
    return NextResponse.json({
      success: true,
      message: `Cooldown reset for ${symbol}`,
      state,
      timestamp: new Date().toISOString(),
    })
  } catch (error) {
    console.error("[v0] Cooldown reset failed:", error)
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    )
  }
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url)
    const symbol = url.searchParams.get("symbol")
    
    if (!symbol) {
      return NextResponse.json(
        { success: false, error: "Symbol parameter is required" },
        { status: 400 }
      )
    }

    console.log(`[v0] COOLDOWN RESET REQUEST: ${symbol}`)
    
    // Reset the cooldown for the specified symbol
    SignalCache.resetCooldown(symbol)
    
    // Get the detailed state after reset
    const state = SignalCache.getDetailedState(symbol)
    
    return NextResponse.json({
      success: true,
      message: `Cooldown reset for ${symbol}`,
      state,
      timestamp: new Date().toISOString(),
    })
  } catch (error) {
    console.error("[v0] Cooldown reset failed:", error)
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    )
  }
}