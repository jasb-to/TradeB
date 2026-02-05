"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { TrendingUp, TrendingDown, Target, X, Plus, Pencil } from "lucide-react"
import type { ActiveTrade } from "@/types/trading"
import { useState } from "react"

interface ActiveTradesProps {
  trades: ActiveTrade[]
  currentPrice: number | null | undefined
  onCloseTrade: (tradeId: string) => void
  onAddTrade: (trade: Omit<ActiveTrade, "id" | "entryTime" | "status">) => void
  onEditTrade: (tradeId: string, trade: Omit<ActiveTrade, "id" | "entryTime" | "status">) => void
}

export function ActiveTrades({ trades, currentPrice, onCloseTrade, onAddTrade, onEditTrade }: ActiveTradesProps) {
  const [showAddForm, setShowAddForm] = useState(false)
  const [editingTradeId, setEditingTradeId] = useState<string | null>(null)
  const [formData, setFormData] = useState({
    direction: "LONG" as "LONG" | "SHORT",
    entryPrice: "",
    stopLoss: "",
    takeProfit1: "",
    takeProfit2: "",
  })

  const calculatePnL = (trade: ActiveTrade) => {
    if (currentPrice === null || currentPrice === undefined || isNaN(currentPrice)) {
      return { pnl: 0, pnlPercent: 0, riskPercent: 0 }
    }

    const pnl = trade.direction === "LONG" ? currentPrice - trade.entryPrice : trade.entryPrice - currentPrice
    const pnlPercent = (pnl / trade.entryPrice) * 100

    const maxRisk = Math.abs(trade.entryPrice - trade.stopLoss)
    const currentRisk =
      trade.direction === "LONG"
        ? Math.max(0, trade.entryPrice - currentPrice)
        : Math.max(0, currentPrice - trade.entryPrice)
    const riskPercent = (currentRisk / maxRisk) * 100

    return { pnl, pnlPercent, riskPercent }
  }

  const handleAddTrade = () => {
    console.log("[v0] Save Trade clicked", { formData })

    if (!formData.entryPrice || !formData.stopLoss || !formData.takeProfit1 || !formData.takeProfit2) {
      console.log("[v0] Validation failed: missing fields")
      return
    }

    const tradeData = {
      direction: formData.direction,
      entryPrice: Number.parseFloat(formData.entryPrice),
      stopLoss: Number.parseFloat(formData.stopLoss),
      takeProfit1: Number.parseFloat(formData.takeProfit1),
      takeProfit2: Number.parseFloat(formData.takeProfit2),
      tp1Hit: false,
      tp2Hit: false,
      slHit: false,
    }

    console.log("[v0] Adding trade:", tradeData)
    onAddTrade(tradeData)

    setFormData({
      direction: "LONG",
      entryPrice: "",
      stopLoss: "",
      takeProfit1: "",
      takeProfit2: "",
    })
    setShowAddForm(false)
  }

  const handleEditTrade = () => {
    if (
      !editingTradeId ||
      !formData.entryPrice ||
      !formData.stopLoss ||
      !formData.takeProfit1 ||
      !formData.takeProfit2
    ) {
      return
    }

    onEditTrade(editingTradeId, {
      direction: formData.direction,
      entryPrice: Number.parseFloat(formData.entryPrice),
      stopLoss: Number.parseFloat(formData.stopLoss),
      takeProfit1: Number.parseFloat(formData.takeProfit1),
      takeProfit2: Number.parseFloat(formData.takeProfit2),
      tp1Hit: false,
      tp2Hit: false,
      slHit: false,
    })

    setFormData({
      direction: "LONG",
      entryPrice: "",
      stopLoss: "",
      takeProfit1: "",
      takeProfit2: "",
    })
    setEditingTradeId(null)
  }

  const startEdit = (trade: ActiveTrade) => {
    setFormData({
      direction: trade.direction,
      entryPrice: trade.entryPrice.toString(),
      stopLoss: trade.stopLoss.toString(),
      takeProfit1: trade.takeProfit1.toString(),
      takeProfit2: trade.takeProfit2.toString(),
    })
    setEditingTradeId(trade.id)
    setShowAddForm(false)
  }

  const cancelEdit = () => {
    setEditingTradeId(null)
    setFormData({
      direction: "LONG",
      entryPrice: "",
      stopLoss: "",
      takeProfit1: "",
      takeProfit2: "",
    })
  }

  return (
    <Card className="border-primary/20">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <Target className="h-4 w-4" />
            Active Trades
            {trades.length > 0 && (
              <Badge variant="outline" className="border-primary/30">
                {trades.length}
              </Badge>
            )}
          </CardTitle>
          <Button
            size="sm"
            variant="outline"
            className="h-7 gap-1 bg-transparent"
            onClick={() => setShowAddForm(!showAddForm)}
            disabled={editingTradeId !== null}
          >
            <Plus className="h-3 w-3" />
            Add Trade
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {editingTradeId && (
          <div className="border border-amber-500/30 rounded-lg p-3 space-y-2 bg-amber-950/10">
            <p className="text-xs font-semibold mb-2 text-amber-400">Edit Trade</p>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs text-muted-foreground">Direction</label>
                <select
                  className="w-full bg-background border border-primary/20 rounded px-2 py-1 text-sm"
                  value={formData.direction}
                  onChange={(e) => setFormData({ ...formData, direction: e.target.value as "LONG" | "SHORT" })}
                >
                  <option value="LONG">LONG</option>
                  <option value="SHORT">SHORT</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Entry Price</label>
                <input
                  type="number"
                  step="0.01"
                  className="w-full bg-background border border-primary/20 rounded px-2 py-1 text-sm"
                  value={formData.entryPrice}
                  onChange={(e) => setFormData({ ...formData, entryPrice: e.target.value })}
                  placeholder="1963.30"
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Stop Loss</label>
                <input
                  type="number"
                  step="0.01"
                  className="w-full bg-background border border-primary/20 rounded px-2 py-1 text-sm"
                  value={formData.stopLoss}
                  onChange={(e) => setFormData({ ...formData, stopLoss: e.target.value })}
                  placeholder="1796.57"
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">TP1</label>
                <input
                  type="number"
                  step="0.01"
                  className="w-full bg-background border border-primary/20 rounded px-2 py-1 text-sm"
                  value={formData.takeProfit1}
                  onChange={(e) => setFormData({ ...formData, takeProfit1: e.target.value })}
                  placeholder="2296.75"
                />
              </div>
              <div className="col-span-2">
                <label className="text-xs text-muted-foreground">TP2</label>
                <input
                  type="number"
                  step="0.01"
                  className="w-full bg-background border border-primary/20 rounded px-2 py-1 text-sm"
                  value={formData.takeProfit2}
                  onChange={(e) => setFormData({ ...formData, takeProfit2: e.target.value })}
                  placeholder="2630.20"
                />
              </div>
            </div>
            <div className="flex gap-2">
              <Button size="sm" onClick={handleEditTrade} className="flex-1">
                Update Trade
              </Button>
              <Button size="sm" variant="outline" onClick={cancelEdit}>
                Cancel
              </Button>
            </div>
          </div>
        )}

        {showAddForm && (
          <div className="border border-primary/20 rounded-lg p-3 space-y-2 bg-card/50">
            <p className="text-xs font-semibold mb-2">Add Existing Trade</p>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs text-muted-foreground">Direction</label>
                <select
                  className="w-full bg-background border border-primary/20 rounded px-2 py-1 text-sm"
                  value={formData.direction}
                  onChange={(e) => setFormData({ ...formData, direction: e.target.value as "LONG" | "SHORT" })}
                >
                  <option value="LONG">LONG</option>
                  <option value="SHORT">SHORT</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Entry Price</label>
                <input
                  type="number"
                  step="0.01"
                  className="w-full bg-background border border-primary/20 rounded px-2 py-1 text-sm"
                  value={formData.entryPrice}
                  onChange={(e) => setFormData({ ...formData, entryPrice: e.target.value })}
                  placeholder="1963.30"
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Stop Loss</label>
                <input
                  type="number"
                  step="0.01"
                  className="w-full bg-background border border-primary/20 rounded px-2 py-1 text-sm"
                  value={formData.stopLoss}
                  onChange={(e) => setFormData({ ...formData, stopLoss: e.target.value })}
                  placeholder="1796.57"
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">TP1</label>
                <input
                  type="number"
                  step="0.01"
                  className="w-full bg-background border border-primary/20 rounded px-2 py-1 text-sm"
                  value={formData.takeProfit1}
                  onChange={(e) => setFormData({ ...formData, takeProfit1: e.target.value })}
                  placeholder="2296.75"
                />
              </div>
              <div className="col-span-2">
                <label className="text-xs text-muted-foreground">TP2</label>
                <input
                  type="number"
                  step="0.01"
                  className="w-full bg-background border border-primary/20 rounded px-2 py-1 text-sm"
                  value={formData.takeProfit2}
                  onChange={(e) => setFormData({ ...formData, takeProfit2: e.target.value })}
                  placeholder="2630.20"
                />
              </div>
            </div>
            <div className="flex gap-2">
              <Button size="sm" onClick={handleAddTrade} className="flex-1">
                Save Trade
              </Button>
              <Button size="sm" variant="outline" onClick={() => setShowAddForm(false)}>
                Cancel
              </Button>
            </div>
          </div>
        )}

        {trades.length === 0 && !showAddForm ? (
          <div className="text-center py-8 text-muted-foreground text-sm">
            <Target className="h-8 w-8 mx-auto mb-2 opacity-30" />
            <p>No active trades</p>
            <p className="text-xs mt-1">Trades auto-track when ENTER NOW signals fire</p>
            <p className="text-xs mt-1 text-primary/70">Or click "Add Trade" to manually track an existing position</p>
          </div>
        ) : (
          trades.map((trade) => {
            const { pnl, pnlPercent, riskPercent } = calculatePnL(trade)
            const isProfit = pnl > 0
            const isWarning = pnlPercent < -1.5
            const isDanger = pnlPercent < -3.0 || riskPercent > 80

            return (
              <div
                key={trade.id}
                className={`border rounded-lg p-3 space-y-2 ${
                  isDanger
                    ? "border-red-500/50 bg-red-950/20"
                    : isWarning
                      ? "border-amber-500/50 bg-amber-950/10"
                      : "border-primary/20 bg-card/50"
                }`}
              >
                {/* Trade Header */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {trade.direction === "LONG" ? (
                      <TrendingUp className="h-4 w-4 text-green-400" />
                    ) : (
                      <TrendingDown className="h-4 w-4 text-red-400" />
                    )}
                    <span className="font-semibold">{trade.direction}</span>
                    {isDanger && (
                      <Badge variant="outline" className="border-red-500/50 text-red-400 text-[10px] animate-pulse">
                        DANGER!
                      </Badge>
                    )}
                    {isWarning && !isDanger && (
                      <Badge variant="outline" className="border-amber-500/50 text-amber-400 text-[10px]">
                        Warning
                      </Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge
                      variant="outline"
                      className={isProfit ? "border-green-500/50 text-green-400" : "border-red-500/50 text-red-400"}
                    >
                      {isProfit ? "+" : ""}${pnl.toFixed(2)} ({pnlPercent.toFixed(2)}%)
                    </Badge>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-6 w-6 p-0"
                      onClick={() => startEdit(trade)}
                      disabled={editingTradeId !== null}
                    >
                      <Pencil className="h-3 w-3" />
                    </Button>
                    <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={() => onCloseTrade(trade.id)}>
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                </div>

                {!isProfit && riskPercent > 0 && (
                  <div className="space-y-1">
                    <div className="flex justify-between text-[10px] text-muted-foreground">
                      <span>Risk to Stop Loss</span>
                      <span className={riskPercent > 80 ? "text-red-400 font-semibold" : ""}>
                        {riskPercent.toFixed(0)}%
                      </span>
                    </div>
                    <div className="w-full bg-muted/30 rounded-full h-1.5">
                      <div
                        className={`h-1.5 rounded-full transition-all ${
                          riskPercent > 80 ? "bg-red-500" : riskPercent > 50 ? "bg-amber-500" : "bg-blue-500"
                        }`}
                        style={{ width: `${Math.min(riskPercent, 100)}%` }}
                      />
                    </div>
                  </div>
                )}

                {/* Trade Levels */}
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Entry:</span>
                    <span className="font-mono">${trade.entryPrice.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Stop:</span>
                    <span className="font-mono text-red-400">${trade.stopLoss.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">TP1:</span>
                    <span className={`font-mono ${trade.tp1Hit ? "text-green-400 line-through" : ""}`}>
                      ${trade.takeProfit1.toFixed(2)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">TP2:</span>
                    <span className={`font-mono ${trade.tp2Hit ? "text-green-400 line-through" : ""}`}>
                      ${trade.takeProfit2.toFixed(2)}
                    </span>
                  </div>
                </div>

                {/* Status Indicators */}
                {(trade.tp1Hit || trade.tp2Hit || trade.slHit) && (
                  <div className="flex gap-1">
                    {trade.tp1Hit && (
                      <Badge variant="outline" className="border-green-500/50 text-green-400 text-[10px]">
                        TP1 Hit
                      </Badge>
                    )}
                    {trade.tp2Hit && (
                      <Badge variant="outline" className="border-green-500/50 text-green-400 text-[10px]">
                        TP2 Hit
                      </Badge>
                    )}
                    {trade.slHit && (
                      <Badge variant="outline" className="border-red-500/50 text-red-400 text-[10px]">
                        Stop Hit
                      </Badge>
                    )}
                  </div>
                )}

                <p className="text-[10px] text-muted-foreground">
                  Entered {new Date(trade.entryTime).toLocaleString("en-GB")}
                </p>
              </div>
            )
          })
        )}
      </CardContent>
    </Card>
  )
}
