"use client"

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
  const [signalXAG, setSignalXAG] = useState<Signal | null>(null)
  const [loading, setLoading] = useState(true)
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null)
  const [secondsAgo, setSecondsAgo] = useState(0)
  const [marketClosed, setMarketClosed] = useState(false)
  const [marketMessage, setMarketMessage] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const [testingTelegram, setTestingTelegram] = useState(false)
  const [dataSource, setDataSource] = useState<"oanda" | "synthetic" | null>(null)
  const [renderError, setRenderError] = useState<string | null>(null)
  const intervalRef = useRef<NodeJS.Timeout | null>(null)
  const timerRef = useRef<NodeJS.Timeout | null>(null)

  // XAU is always the main display, XAG runs in background
  const signal = signalXAU

  const fetchSignals = async () => {
    setLoading(true)
    try {
      const [xauResponse, xagResponse] = await Promise.all([
        fetch("/api/signal/current?symbol=XAU_USD"),
        fetch("/api/signal/current?symbol=XAG_USD"),
      ])

      if (!xauResponse.ok || !xagResponse.ok) {
        throw new Error(`Signal API returned error: ${xauResponse.status} ${xagResponse.status}`)
      }

      const xauData = await xauResponse.json()
      const xagData = await xagResponse.json()

      // Track data source
      if (xauData.dataSource === "synthetic") {
        setDataSource("synthetic")
      } else {
        setDataSource("oanda")
      }

      // Handle XAU signal - check both success flag and signal existence
      if (xauData.signal) {
        setSignalXAU(xauData.signal)
        // Always cache successful signals for weekend display
        localStorage.setItem("lastValidSignalXAU", JSON.stringify({
          signal: xauData.signal,
          timestamp: Date.now(),
        }))
      }

      // Update market status if provided
      if (xauData.marketClosed !== undefined) {
        setMarketClosed(xauData.marketClosed)
        if (xauData.marketClosed) {
          setMarketMessage(xauData.marketStatus || "Market closed")
        } else {
          setMarketMessage(null)
        }
      }

      // Handle XAG signal
      if (xagData.signal) {
        setSignalXAG(xagData.signal)
      }

      setLastUpdate(new Date())
      setSecondsAgo(0)
    } catch (error) {
      console.error("[v0] Signal fetch error:", error)
      // Load cached data if fetch fails
      const cached = localStorage.getItem("lastValidSignalXAU")
      if (cached) {
        try {
          const cachedSignal = JSON.parse(cached)
          setSignalXAU(cachedSignal.signal)
          setLastUpdate(new Date(cachedSignal.timestamp))
          setMarketClosed(true)
          setMarketMessage("Using cached Friday close data")
        } catch (e) {
          console.log("[v0] Cache error:", e)
        }
      }
    } finally {
      setLoading(false)
    }
  }

  // Load cached data immediately on component mount
  useEffect(() => {
    const cached = localStorage.getItem("lastValidSignalXAU")
    if (cached) {
      try {
        const cachedSignal = JSON.parse(cached)
        setSignalXAU(cachedSignal.signal)
        setLastUpdate(new Date(cachedSignal.timestamp))
        setMarketClosed(true)
        setMarketMessage("Using cached Friday close data")
      } catch (e) {
        console.log("[v0] Initial cache load error:", e)
      }
    }
    // Then fetch fresh data
    fetchSignals()
  }, [])

  const sendTestMessage = async () => {
    setTestingTelegram(true)
    try {
      const response = await fetch("/api/test-telegram", {
        method: "GET",
      })
      const data = await response.json()

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
      console.error("[v0] Error sending test message:", error)
      toast({
        title: "Connection Error",
        description: "Failed to connect to Telegram API",
        variant: "destructive",
      })
    } finally {
      setTestingTelegram(false)
    }
  }

  // Polling interval - 60s weekdays, 1h weekends
  useEffect(() => {
    // Polling strategy:
    // Weekday (Mon-Fri): Poll every 60 seconds
    // Weekend (Sat-Sun): Poll every hour to keep cached data fresh
    const now = new Date()
    const dayOfWeek = now.getDay()
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6
    const pollInterval = isWeekend ? 60 * 60 * 1000 : 60 * 1000 // 1 hour vs 60 seconds

    intervalRef.current = setInterval(() => {
      fetchSignals()
    }, pollInterval)

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [])
    
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
    <main className="min-h-screen bg-slate-950 p-4 md:p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex flex-col md:flex-row justify-between items-start gap-3 md:gap-2">
          <div>
            <h1 className="text-3xl font-bold text-white">TradeB - Gold Trading Dashboard</h1>
            <p className="text-slate-400 text-sm mt-1">Production-Ready XAU/USD Strategy Execution</p>
          </div>
          <div className="flex gap-2 flex-wrap md:flex-nowrap">
            <Button
              onClick={fetchSignals}
              disabled={loading || refreshing}
              variant="outline"
              size="sm"
              className="gap-2 bg-transparent"
              title="Fetch latest XAU signal data"
            >
              <RefreshCw className={`w-4 h-4 ${loading || refreshing ? "animate-spin" : ""}`} />
              {refreshing ? "Refreshing..." : "Refresh"}
            </Button>
            <Button
              onClick={sendTestMessage}
              disabled={loading || testingTelegram}
              variant="outline"
              size="sm"
              className="gap-2 bg-transparent whitespace-nowrap"
              title="Send test message to Telegram chat"
            >
              <Send className={`w-4 h-4 ${testingTelegram ? "animate-spin" : ""}`} />
              <span className="hidden sm:inline">{testingTelegram ? "Testing..." : "Test Telegram"}</span>
              <span className="sm:hidden">{testingTelegram ? "Test..." : "TG"}</span>
            </Button>
            {lastUpdate && (
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

        {/* Synthetic Data Warning - Subtle, not blocking */}
        {dataSource === "synthetic" && (
          <Card className="bg-amber-950/20 border-amber-700/30 p-3">
            <div className="flex gap-2 items-center">
              <AlertCircle className="w-4 h-4 text-amber-500" />
              <p className="text-xs text-amber-200">
                Using generated data - OANDA API temporarily unavailable. Do not trade real money on these signals.
              </p>
            </div>
          </Card>
        )}

        {/* Loading State */}
        {loading && !signal && (
          <Card className="bg-slate-900/40 border-slate-700/50 p-6">
            <div className="flex gap-3 items-center justify-center min-h-[200px]">
              <RefreshCw className="w-5 h-5 text-slate-400 animate-spin" />
              <span className="text-slate-300">Loading signal data...</span>
            </div>
          </Card>
        )}

        {/* Main Content Grid */}
        <div className="space-y-6">
          {signal && (
            <>
              {/* 0. Gold Price Display */}
              <GoldPriceDisplay signal={signal} marketClosed={marketClosed} />

              {/* 1. Signal Status Panel */}
              <GoldSignalPanel signal={signal} loading={!signal && loading} />

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
            </>
          )}

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
              ? "Market closed - displaying Friday close data cached from last session. No API calls during market hours off."
              : "Data refreshes automatically every 60 seconds during market hours. Strategy: Multi-TF aligned entries with strict risk gates. DO NOT trade against the higher timeframe bias."
            } Silver runs as background system with Telegram-only alerts.
          </p>
        </div>
      </div>
    </main>
  )
}
