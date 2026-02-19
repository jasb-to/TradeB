"use client"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { AlertCircle, TrendingUp, TrendingDown, X } from "lucide-react"
import { useState } from "react"
import type { Signal } from "@/types/trading"

interface GoldSignalPanelProps {
  signal: Signal | null
  loading?: boolean
  onManualExit?: () => void
}

export function GoldSignalPanel({ signal, loading, onManualExit }: GoldSignalPanelProps) {
  const [exiting, setExiting] = useState(false)

  // DEFENSIVE ASSERTION: Catch tier mismatch regressions
  if (signal && signal.type === "ENTRY" && signal.entryDecision?.approved === false) {
    console.error("[CRITICAL] REGRESSION DETECTED: signal.type=ENTRY but entryDecision.approved=false")
    console.error("[CRITICAL] This indicates approval state mutation or improper tier display")
  }

  // Show signal as soon as we have one -- even if loading hasn't flipped to false yet
  if (!signal) {
    if (loading) {
      return (
        <Card className="bg-slate-900/40 border-slate-700/50 p-6">
          <div className="text-center text-slate-400">Loading signal...</div>
        </Card>
      )
    }
    return (
      <Card className="bg-slate-900/40 border-slate-700/50 p-6">
        <div className="text-center text-slate-400">No signal available</div>
      </Card>
    )
  }

  const getStatusBadge = () => {
    // ENTRY signals - full trade active
    if (signal.type === "ENTRY" && signal.direction === "LONG")
      return { icon: TrendingUp, color: "bg-green-950 border-green-700", text: "ENTRY SIGNAL - LONG" }
    if (signal.type === "ENTRY" && signal.direction === "SHORT")
      return { icon: TrendingDown, color: "bg-red-950 border-red-700", text: "ENTRY SIGNAL - SHORT" }
    
    // PENDING signals - get ready, trade forming
    if (signal.type === "PENDING" && signal.direction === "LONG")
      return { icon: TrendingUp, color: "bg-amber-950 border-amber-700", text: "GET READY - TRADE FORMING (LONG)" }
    if (signal.type === "PENDING" && signal.direction === "SHORT")
      return { icon: TrendingDown, color: "bg-orange-950 border-orange-700", text: "GET READY - TRADE FORMING (SHORT)" }
    
    // NO_TRADE with direction - was pending but conditions changed
    if (signal.direction === "LONG" && signal.type === "NO_TRADE")
      return { icon: TrendingUp, color: "bg-blue-950 border-blue-700", text: "AWAITING CONFIRMATION - LONG" }
    if (signal.direction === "SHORT" && signal.type === "NO_TRADE")
      return { icon: TrendingDown, color: "bg-yellow-950 border-yellow-700", text: "AWAITING CONFIRMATION - SHORT" }
    
    return { icon: AlertCircle, color: "bg-slate-800 border-slate-600", text: "NO TRADE" }
  }

  const badge = getStatusBadge()
  const Icon = badge.icon

  return (
    <Card className={`${badge.color} border p-6 space-y-4`}>
      <div className="flex items-center gap-3">
        <Icon className="w-6 h-6" />
        <h2 className="text-xl font-bold">{badge.text}</h2>
      </div>

      {signal.type === "ENTRY" && signal.direction && (
        <>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-slate-400 text-xs">Setup Tier</p>
              {signal.entryDecision?.tier === "A+" ? (
                <Badge className="bg-yellow-900/60 border-yellow-700/60 text-yellow-200 font-bold">
                  🔥 A+ PREMIUM
                </Badge>
              ) : signal.entryDecision?.tier === "A" ? (
                <Badge className="bg-blue-900/60 border-blue-700/60 text-blue-200 font-bold">
                  ⭐ A SETUP
                </Badge>
              ) : signal.entryDecision?.tier === "B" ? (
                <Badge className="bg-slate-700/60 border-slate-600/60 text-slate-200 font-bold">
                  🚨 B TIER SETUP
                </Badge>
              ) : (
                <Badge className="bg-slate-700/60 border-slate-600/60 text-slate-200 font-bold">
                  STANDARD SETUP
                </Badge>
              )}
            </div>
            <div>
              <p className="text-slate-400 text-xs">Market Regime</p>
              <Badge className="bg-green-900/50 border-green-700/50">
                {signal.direction === "LONG" ? "LONG" : signal.direction === "SHORT" ? "SHORT" : "RANGE"}
              </Badge>
            </div>
          </div>
          
          {signal.entryDecision?.tier === "A+" && (
            <div className="p-2 bg-yellow-900/30 border border-yellow-700/50 rounded text-xs text-yellow-200">
              High confidence setup - Maximum capital allocation recommended
            </div>
          )}

          {signal.entryDecision?.tier === "B" && (
            <div className="p-2 bg-slate-800/30 border border-slate-700/50 rounded text-xs text-slate-300">
              B TIER: 1H momentum-aligned entry • Hard TP1 exit only • Use 50% position size
            </div>
          )}

          {/* Trade Levels - only show on ENTRY signals */}
          {(signal.entryPrice || signal.stopLoss || signal.takeProfit1 || signal.takeProfit2) && (
            <div className="pt-2 border-t border-slate-700/50 space-y-3">
              <p className="text-slate-300 font-semibold text-sm">TRADE LEVELS</p>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                {signal.entryPrice && (
                  <div className="bg-slate-900/40 rounded p-3">
                    <p className="text-slate-500 text-xs mb-1">Entry</p>
                    <p className="text-lg font-bold text-blue-300">${signal.entryPrice.toFixed(2)}</p>
                    <p className="text-xs text-slate-400 mt-1">Now Active</p>
                  </div>
                )}
                {signal.stopLoss && (
                  <div className="bg-slate-900/40 rounded p-3">
                    <p className="text-slate-500 text-xs mb-1">Stop Loss</p>
                    <p className="text-lg font-bold text-red-400">${signal.stopLoss.toFixed(2)}</p>
                    <p className="text-xs text-slate-400 mt-1">
                      {signal.entryPrice ? 
                        ((Math.abs(Number(signal.entryPrice) - Number(signal.stopLoss)) / Number(signal.entryPrice)) * 100).toFixed(2) 
                        : "—"
                      }% risk
                    </p>
                  </div>
                )}
                {signal.takeProfit1 && (
                  <div className="bg-slate-900/40 rounded p-3">
                    <p className="text-slate-500 text-xs mb-1">TP 1</p>
                    <p className="text-lg font-bold text-green-300">${signal.takeProfit1.toFixed(2)}</p>
                    <p className="text-xs text-slate-400 mt-1">1R (Exit 50%)</p>
                  </div>
                )}
                {signal.takeProfit2 && (
                  <div className="bg-slate-900/40 rounded p-3">
                    <p className="text-slate-500 text-xs mb-1">TP 2</p>
                    <p className="text-lg font-bold text-green-400">${signal.takeProfit2.toFixed(2)}</p>
                    <p className="text-xs text-slate-400 mt-1">{signal.entryDecision?.tier === "A+" ? "2R" : "1.5R"} (Trail)</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Manual Exit Button - visible when trade is active or at TP1 */}
          <div className="pt-2 border-t border-slate-700/50">
            <Button
              onClick={async () => {
                setExiting(true)
                try {
                  const response = await fetch("/api/trade/manual-exit", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ symbol: "XAU_USD" }),
                  })
                  if (response.ok) {
                    onManualExit?.()
                  }
                } catch (error) {
                  console.error("[v0] Manual exit failed:", error)
                } finally {
                  setExiting(false)
                }
              }}
              disabled={exiting}
              variant="destructive"
              size="sm"
              className="w-full gap-2"
            >
              <X className="w-4 h-4" />
              {exiting ? "Exiting..." : "Manual Exit - Close Trade"}
            </Button>
          </div>
        </>
      )}

      {signal.type !== "ENTRY" && signal.direction && signal.type === "PENDING" && signal.waiting && (
        <div className="space-y-4 p-4 bg-amber-900/30 border border-amber-700/50 rounded-lg">
          <div className="flex items-center justify-between">
                <p className="text-amber-300 font-semibold">Setup Forming: {signal.entryDecision?.tier === "A+" ? "🔥 A+ PREMIUM" : signal.entryDecision?.tier === "A" ? "⭐ A SETUP" : signal.entryDecision?.tier === "B" ? "🚨 B TIER SETUP" : "STANDARD SETUP"}</p>
            <p className="text-amber-200/60 text-xs">(Awaiting LTF confirmation)</p>
          </div>

          <div className="space-y-3">
            <div>
              <p className="text-amber-300 font-semibold text-sm mb-2">STRATEGY REQUIREMENTS MET:</p>
              <ul className="space-y-1">
                {signal.waiting.met && signal.waiting.met.length > 0 ? (
                  signal.waiting.met.map((item, i) => (
                    <li key={i} className="text-xs text-amber-200 flex items-center gap-2">
                      <span className="text-green-400">✓</span>
                      {item}
                    </li>
                  ))
                ) : (
                  <li className="text-xs text-amber-200/60">All core conditions aligned</li>
                )}
              </ul>
            </div>

            <div>
              <p className="text-amber-200 font-semibold text-sm mb-2">WAITING FOR:</p>
              <ul className="space-y-1">
                {signal.waiting.for && signal.waiting.for.length > 0 ? (
                  signal.waiting.for.map((item, i) => (
                    <li key={i} className="text-xs text-amber-100 flex items-center gap-2">
                      <span className="text-orange-400">⏳</span>
                      {item}
                    </li>
                  ))
                ) : (
                  <li className="text-xs text-amber-100">Final confirmation signals</li>
                )}
              </ul>
            </div>
          </div>

          <p className="text-xs text-amber-200/70 italic">
            {signal.pendingReason || "Awaiting lower timeframe entry confirmation before full trade entry"}
          </p>
        </div>
      )}

      {signal.reasons && signal.reasons.length > 0 && (
        <div className="text-xs text-slate-300 space-y-1">
          <p className="font-semibold text-slate-200">Reasons:</p>
          {signal.reasons.slice(0, 3).map((reason, i) => (
            <p key={i} className="text-slate-400">• {reason}</p>
          ))}
        </div>
      )}
    </Card>
  )
}
