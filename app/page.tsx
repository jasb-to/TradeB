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
        throw new Error("Signal API returned error")
      }

      const xauData = await xauResponse.json()
      const xagData = await xagResponse.json()

      // Track if data is synthetic - block display if so
      if (xauData.dataSource === "synthetic") {
        setDataSource("synthetic")
        console.log("[v0] WARNING: XAU data is synthetic (OANDA unavailable)")
      } else {
        setDataSource("oanda")
      }

      if (xauData.success && xauData.signal) {
        setSignalXAU(xauData.signal)
      }
      if (xagData.success && xagData.signal) {
        setSignalXAG(xagData.signal)
      }

      setLastUpdate(new Date())
      setSecondsAgo(0)
    } catch (error) {
      console.error("[v0] Signal fetch error:", error)
    } finally {
      setLoading(false)
    }
  }

  const sendTestMessage = async () => {
    setTestingTelegram(true)
    try {
      const response = await fetch("/api/test-telegram-instant", {
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
        description: "Failed to connect to Telegram endpoint",
        variant: "destructive",
      })
    } finally {
      setTestingTelegram(false)
    }
  }

  const fetchXAU = async () => {
    // Prevent double-clicks/rapid clicks by checking state before starting
    if (refreshing) {
      return
    }
    
    setRefreshing(true)
    try {
      const response = await fetch("/api/signal/current?symbol=XAU_USD", {
        signal: AbortSignal.timeout(15000) // 15 second timeout
      })
      
      if (!response.ok) {
        throw new Error(`Signal API returned ${response.status}`)
      }

      const data = await response.json()

      // Handle market closed state - preserve Friday close data
      if (data.marketClosed) {
        setMarketClosed(true)
        setMarketMessage(data.marketStatus || "Market closed for weekend")
        // Still update signal if cached data returned (Friday close snapshot)
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
      
      setLastUpdate(new Date())
      setSecondsAgo(0)
      setLoading(false) // Clear initial loading state
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        console.error("[v0] XAU fetch timeout (15s)")
      } else {
        console.error("[v0] XAU polling error:", error)
      }
      setLoading(false) // Clear loading even on error
    } finally {
      setRefreshing(false)
    }
  }

  const fetchXAG = async () => {
    try {
      const response = await fetch("/api/signal/current?symbol=XAG_USD")
      
      if (!response.ok) {
        throw new Error(`XAG Signal API returned ${response.status}`)
      }

      const data = await response.json()

      if (data.success && data.signal) {
        setSignalXAG(data.signal)
      }
    } catch (error) {
      console.error("[v0] XAG polling error:", error)
    }
  }



  useEffect(() => {
    fetchXAU()
    
    // Polling intervals - reduced to conserve API calls
    // Market open: 60 seconds (was 30s)
    // Market closed: 5 minutes (was 60m) - still check if market reopened
    const pollInterval = marketClosed ? 5 * 60 * 1000 : 60 * 1000
    
    intervalRef.current = setInterval(async () => {
      try {
        // Poll XAU (main display)
        const xauResponse = await fetch("/api/signal/current?symbol=XAU_USD")
        
        if (!xauResponse.ok) {
          throw new Error(`XAU Signal API returned ${xauResponse.status}`)
        }

        const xauData = await xauResponse.json()

        // Track data source
        if (xauData.dataSource === "synthetic") {
          setDataSource("synthetic")
        } else {
          setDataSource("oanda")
        }

        // Check if market status changed
        if (xauData.marketClosed) {
          setMarketClosed(true)
          setMarketMessage(xauData.marketStatus || "Market closed")
          if (xauData.signal) {
            setSignalXAU(xauData.signal)
          }
          return
        }
        
        // Market is open - update data normally
        setMarketClosed(false)
        setMarketMessage(null)
        
        if (xauData.success && xauData.signal) {
          setSignalXAU(xauData.signal)
          setLastUpdate(new Date())
          setSecondsAgo(0)
        }

        // Poll XAG in background (every cycle)
        fetchXAG()
      } catch (error) {
        console.error("[v0] Polling error:", error)
      }
    }, pollInterval)

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [marketClosed])

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
        <div className="flex flex-col md:flex-row justify-between items-start gap-3 md:gap-2">
          <div>
            <h1 className="text-3xl font-bold text-white">TradeB - Gold Trading Dashboard</h1>
            <p className="text-slate-400 text-sm mt-1">Production-Ready XAU/USD Strategy Execution</p>
          </div>
          <div className="flex gap-2 flex-wrap md:flex-nowrap">
            <Button
              onClick={fetchXAU}
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

        {/* Synthetic Data Warning */}
        {dataSource === "synthetic" && (
          <Card className="bg-red-950/30 border-red-700/50 p-4">
            <div className="flex gap-3 items-center">
              <AlertCircle className="w-5 h-5 text-red-400" />
              <div>
                <h3 className="font-semibold text-red-200">Synthetic Data Active</h3>
                <p className="text-sm text-red-300/80">
                  OANDA API is unavailable. Dashboard is displaying generated data only. DO NOT trade on synthetic signals.
                </p>
              </div>
            </div>
          </Card>
        )}

        {/* Main Content Grid */}
        {dataSource === "synthetic" ? (
          // Synthetic data: show warning, don't display trading signals
          <div className="space-y-6">
            <Card className="bg-slate-900/40 border-slate-700/50 p-6">
              <div className="flex gap-3 items-start">
                <AlertCircle className="w-5 h-5 text-red-400 mt-0.5" />
                <div>
                  <h3 className="font-semibold text-red-200">Signals Blocked</h3>
                  <p className="text-sm text-red-300/80 mt-1">
                    All trading signals are hidden because the system is using synthetic data. Real OANDA market data is required for live trading. Once OANDA API is available, signals will display automatically.
                  </p>
                </div>
              </div>
            </Card>
          </div>
        ) : (
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
        )}

        {/* Footer */}
        <div className="border-t border-slate-700/30 pt-6">
          <p className="text-xs text-slate-500 text-center">
            {marketClosed 
              ? "Market closed - polling every 5 minutes. Will resume normal polling when market reopens."
              : "Data refreshes automatically every 60 seconds. Strategy: Multi-TF aligned entries with strict risk gates. DO NOT trade against the higher timeframe bias."
            } Silver runs as background system with Telegram-only alerts. Synthetic data display is blocked for safety.
          </p>
        </div>
      </div>
    </div>
  )
}
