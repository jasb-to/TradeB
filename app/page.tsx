"use client"
// v5.1.5: Fixed JSX syntax error at line 372 - orphaned text removed, build now passes
const BUILD_VERSION = "5.1.5"

import { useState, useEffect, useRef } from "react"
import type { Signal } from "@/types/trading"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { RefreshCw, AlertCircle, Clock, Send } from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import { MTFBiasViewer } from "@/components/mtf-bias-viewer"
import { GoldSignalPanel } from "@/components/gold-signal-panel"
import { IndicatorCards } from "@/components/indicator-cards"
import { EntryChecklist } from "@/components/entry-checklist"
import { GoldPriceDisplay } from "@/components/gold-price-display"

export default function GoldTradingDashboard() {
  const { toast } = useToast()
  const [signalXAU, setSignalXAU] = useState<Signal | null>(null)
  const [loading, setLoading] = useState(true)
  const [lastUpdate, setLastUpdate] = useState<number | null>(null)
  const [secondsAgo, setSecondsAgo] = useState(0)
  const [marketClosed, setMarketClosed] = useState(false)
  const [marketMessage, setMarketMessage] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const [testingTelegram, setTestingTelegram] = useState(false)
  const [isMounted, setIsMounted] = useState(false)
  const intervalRef = useRef<NodeJS.Timeout | null>(null)
  const timerRef = useRef<NodeJS.Timeout | null>(null)

  // Only run effects after mount to prevent hydration mismatch
  useEffect(() => {
    setIsMounted(true)
  }, [])

  // XAU is the main display
  const signal = signalXAU
  const handleManualRefresh = async () => {
    setRefreshing(true)
    try {
      const xauResponse = await fetch("/api/signal/current?symbol=XAU_USD")

      if (!xauResponse.ok) {
        throw new Error("Failed to fetch signals")
      }

      const xauData = await xauResponse.json()

      if (xauData.signal) {
        setSignalXAU(xauData.signal)
        setMarketClosed(xauData.marketClosed || false)
        setMarketMessage(xauData.marketStatus || null)
      }

      setLastUpdate(Date.now())
      setSecondsAgo(0)
      
      toast({
        title: "Data Refreshed",
        description: "Signals updated successfully",
        variant: "default",
      })
    } catch (error) {
      console.error("[v0] Manual refresh error:", error)
      toast({
        title: "Refresh Failed",
        description: "Could not update signals",
        variant: "destructive",
      })
    } finally {
      setRefreshing(false)
    }
  }

  const sendTestMessage = async () => {
    setTestingTelegram(true)
    console.log("[v0] Telegram test initiated")
    try {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 10000) // 10 second timeout
      
      const response = await fetch("/api/test-telegram-instant", {
        method: "GET",
        signal: controller.signal,
      })
      clearTimeout(timeoutId)
      
      console.log("[v0] Telegram response status:", response.status)
      const data = await response.json()
      console.log("[v0] Telegram response data:", data)

      if (data.success) {
        toast({
          title: "Telegram Connected",
          description: "Test message sent successfully to your chat",
          variant: "default",
        })
      } else {
        toast({
          title: "Telegram Failed",
          description: data.error || "Failed to send test message",
          variant: "destructive",
        })
      }
    } catch (error) {
      console.error("[v0] Telegram error:", error)
      const errorMsg = error instanceof Error ? error.message : String(error)
      toast({
        title: "Connection Error",
        description: errorMsg.includes("abort") ? "Request timeout (10s)" : "Failed to connect to Telegram endpoint",
        variant: "destructive",
      })
    } finally {
      setTestingTelegram(false)
    }
  }

  const fetchXAU = async () => {
    setRefreshing(true)
    try {
      const response = await fetch("/api/signal/current?symbol=XAU_USD")
      
      if (!response.ok) {
        throw new Error(`Signal API returned ${response.status}`)
      }

      const data = await response.json()

      // Handle market closed state - preserve Friday close data
      if (data.marketClosed) {
        setMarketClosed(true)
        setMarketMessage(data.marketStatus || "Market closed for weekend")
        if (data.signal) {
          setSignalXAU(data.signal)
        }
      } else {
        setMarketClosed(false)
        setMarketMessage(null)
        if (data.success && data.signal) {
          setSignalXAU(data.signal)
        }
      }
      
      setLastUpdate(Date.now())
      setSecondsAgo(0)
    } catch (error) {
      console.error("[v0] XAU polling error:", error)
    } finally {
      setRefreshing(false)
      setLoading(false)
    }
  }

  const fetchGBPJPY = async () => {
    // GBP_JPY removed - only XAU_USD is now supported
  }

  const fetchActiveTrades = async () => {
    try {
      const response = await fetch("/api/active-trades?symbol=XAU_USD")
      if (response.ok) {
        const data = await response.json()
        // Removed - no longer displaying active trades
      }
    } catch (error) {
      console.error("[v0] Error fetching active trades:", error)
    }
  }

  const fetchCurrentPrice = async () => {
    try {
      const response = await fetch("/api/signal/current?symbol=XAU_USD")
      if (response.ok) {
        const data = await response.json()
        // Removed - no longer displaying current price
      }
    } catch (error) {
      console.error("[v0] Error fetching current price:", error)
    }
  }

  useEffect(() => {
    // Initial fetch on mount only
    const initFetch = async () => {
      await fetchXAU()
      setLoading(false)
    }
    initFetch()
    
    intervalRef.current = setInterval(async () => {
      try {
        // Poll XAU (main display)
        const xauResponse = await fetch("/api/signal/current?symbol=XAU_USD").catch(err => {
          console.error("[v0] XAU fetch network error:", err.message)
          return null
        })
        
        if (!xauResponse) {
          console.warn("[v0] XAU fetch failed - retrying next cycle")
          return
        }

        if (!xauResponse.ok) {
          throw new Error(`XAU Signal API returned ${xauResponse.status}`)
        }

        const xauData = await xauResponse.json()
        console.log("[v0] Signal fetch result:", { type: xauData.signal?.type, direction: xauData.signal?.direction, indicators: !!xauData.signal?.indicators })

        // Check if market status changed
        if (xauData.marketClosed) {
          setMarketClosed(true)
          setMarketMessage(xauData.marketStatus || "Market closed")
          if (xauData.signal) {
            setSignalXAU(xauData.signal)
          }
          // CRITICAL FIX: Clear interval and restart with longer interval for market closed
          if (intervalRef.current) {
            clearInterval(intervalRef.current)
          }
          intervalRef.current = setInterval(async () => {
            const retryResponse = await fetch("/api/signal/current?symbol=XAU_USD")
            if (retryResponse.ok) {
              const retryData = await retryResponse.json()
              if (!retryData.marketClosed) {
                // Market reopened, restart normal polling
                setMarketClosed(false)
                setMarketMessage(null)
                if (retryData.signal) setSignalXAU(retryData.signal)
              }
            }
          }, 60 * 60 * 1000) // Check every 60 minutes when market closed
          return
        }
        
        // Market is open - update data normally
        setMarketClosed(false)
        setMarketMessage(null)
        
        if (xauData.success && xauData.signal) {
          console.log("[v0] Setting signal XAU from API response")
          setSignalXAU(xauData.signal)
        } else {
          console.log("[v0] API response missing signal:", xauData)
        }
        
        setLastUpdate(Date.now())
        setSecondsAgo(0)
      } catch (error) {
        console.error("[v0] Polling error:", error)
      }
    }, 30000) // Poll every 30 seconds during market hours

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [])

  // Timer for displaying "seconds ago"
  useEffect(() => {
    if (!lastUpdate) return

    timerRef.current = setInterval(() => {
      setSecondsAgo((prev) => prev + 1)
    }, 1000)

    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [lastUpdate])

  return (
    <div className="min-h-screen bg-slate-950 p-4 md:p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex justify-between items-start">
          <div>
            <h1 className="text-3xl font-bold text-white">TradeB - Gold Trading Dashboard</h1>
            <p className="text-slate-400 text-sm mt-1">Production-Ready XAU/USD Strategy Execution</p>
          </div>
          <div className="flex gap-2">
            <Button
              onClick={handleManualRefresh}
              disabled={refreshing}
              variant="outline"
              size="sm"
              className="gap-2 bg-transparent"
            >
              <RefreshCw className={`w-4 h-4 ${refreshing ? "animate-spin" : ""}`} />
              {refreshing ? "Refreshing..." : "Refresh"}
            </Button>
            <Button
              onClick={sendTestMessage}
              disabled={testingTelegram}
              variant="outline"
              size="sm"
              className="gap-2 bg-transparent"
            >
              <Send className={`w-4 h-4 ${testingTelegram ? "animate-spin" : ""}`} />
              {testingTelegram ? "Testing..." : "Test Telegram"}
            </Button>
            {isMounted && lastUpdate && (
              <Badge variant="outline" className="gap-1 text-xs">
                <Clock className="w-3 h-3" />
                {secondsAgo}s ago
              </Badge>
            )}
          </div>
        </div>

        {/* Market Closed Banner */}
        {marketClosed && (
          <Card className="bg-amber-950/30 border-amber-700/50 p-4">
            <div className="flex gap-3 items-center">
              <Clock className="w-5 h-5 text-amber-400" />
              <div>
                <h3 className="font-semibold text-amber-200">Market Closed</h3>
                <p className="text-sm text-amber-300/80">
                  {marketMessage}
                </p>
              </div>
            </div>
          </Card>
        )}

        {/* Main Content Grid */}
        <div className="space-y-6">
          {/* 0. Gold Price Display */}
          <GoldPriceDisplay signal={signal} marketClosed={marketClosed} />

          {/* 1. Signal Status Panel */}
          <GoldSignalPanel signal={signal} loading={loading} />

          {/* 2. Multi-Timeframe Bias Viewer */}
          <Card className="bg-slate-900/40 border-slate-700/50 p-6">
            <h2 className="text-sm font-mono font-bold mb-4 text-slate-200">MULTI-TIMEFRAME ALIGNMENT</h2>
            <MTFBiasViewer signal={signal} />
          </Card>

          {/* 3. Indicator Strength Cards */}
          <div>
            <h2 className="text-sm font-mono font-bold mb-4 text-slate-200">INDICATOR ANALYSIS</h2>
            <IndicatorCards signal={signal} />
          </div>

          {/* 4. Entry Checklist */}
          <EntryChecklist signal={signal} />

          {/* Error State */}
          {!loading && !signal && (
            <Card className="bg-red-950/20 border-red-700/30 p-6">
              <div className="flex gap-3 items-start">
                <AlertCircle className="w-5 h-5 text-red-400 mt-0.5" />
                <div>
                  <h3 className="font-semibold text-red-200">No Signal Available</h3>
                  <p className="text-sm text-red-300/80 mt-1">
                    The API returned no signal data. Check the console logs and verify the backend is running.
                  </p>
                </div>
              </div>
            </Card>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-slate-700/30 pt-6">
          <p className="text-xs text-slate-500 text-center">
            {marketClosed 
              ? "Market closed - polling paused. Will resume when market reopens."
              : "Data refreshes automatically every 30 seconds. Strategy: Multi-TF aligned entries with strict risk gates. DO NOT trade against the higher timeframe bias."}
          </p>
        </div>
      </div>
    </div>
  )
}
