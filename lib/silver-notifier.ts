import type { Signal } from "@/types/trading"

export class SilverNotifier {
  private botToken: string
  private chatId: string

  constructor(botToken: string, chatId: string) {
    this.botToken = botToken
    this.chatId = chatId
  }

  async sendSilverGetReadyAlert(
    bias: "LONG" | "SHORT", 
    conditionPercentage: number, 
    missingConditions: string[],
    htfPolarity?: string,
    primaryBlocker?: string
  ): Promise<void> {
    const dirEmoji = bias === "LONG" ? "📈" : "📉"

    const message = `${dirEmoji} SILVER (XAG/USD) - GET READY
═══════════════════════════════════════
⚠️ THIS IS NOT A TRADE ⚠️

Direction: ${bias} ${bias === "LONG" ? "UP" : "DOWN"}
HTF Polarity: ${htfPolarity || "IMPROVING"}
Setup Progress: ${(conditionPercentage * 100).toFixed(0)}%

Primary Blocker: ${primaryBlocker || missingConditions[0] || "Awaiting confirmation"}

⏳ WAITING FOR:
${missingConditions.map((c) => `  - ${c}`).join("\n")}

📌 INFORMATIONAL ONLY
   Entry alert will send when all conditions met

⏰ Time: ${new Date().toISOString()}
═══════════════════════════════════════`

    await this.sendMessage(message)
  }

  async sendSilverAlert(signal: Signal): Promise<void> {
    if (signal.type !== "ENTRY" || !signal.direction) {
      console.log("[v0] SILVER ALERT SKIPPED: Not an A/A+ entry signal")
      return
    }

    const tier = signal.setupQuality === "A+" ? "A+ PREMIUM" : "A SOLID"
    const dirEmoji = signal.direction === "LONG" ? "📈" : "📉"
    const confidence = signal.confidence || 0
    const mtfText = signal.mtfBias?.daily && signal.mtfBias?.h4 && signal.mtfBias?.daily === signal.mtfBias?.h4
      ? `Daily+4H ${signal.mtfBias.daily}`
      : `4H+1H ${signal.mtfBias?.h4}`

    const message = `${dirEmoji} SILVER (XAG/USD) - ${tier} SETUP
═══════════════════════════════════════
Setup Tier: ${signal.setupQuality === "A+" ? "🔥 A+ PREMIUM" : "⭐ A SOLID"}
Multi-Timeframe: ${mtfText}

Direction: ${signal.direction} ${signal.direction === "LONG" ? "UP ↑" : "DOWN ↓"}
Confidence: ${confidence}%
Strategy: Breakout + MTF Alignment

📊 TRADE LEVELS:
Entry: $${signal.entryPrice?.toFixed(2) || "N/A"}
Stop Loss: $${signal.stopLoss?.toFixed(2) || "N/A"}
TP1 (EXIT TARGET): $${signal.takeProfit1?.toFixed(2) || "N/A"}
TP2 (Reference): $${signal.takeProfit2?.toFixed(2) || "N/A"}

⚠️ Risk:Reward: ${signal.riskReward?.toFixed(2) || "N/A"}:1

📌 AGGRESSIVE EXIT: Full position closes at TP1
   No scaling, no hesitation - quick profit capture

🚫 ONE TRADE RULE ENFORCED:
   Only 1 active ${signal.direction} trade allowed

⏰ Time: ${new Date().toISOString()}
═══════════════════════════════════════`

    await this.sendMessage(message)
  }

  async sendSilverTP1Complete(signal: Signal, entryPrice: number, tp1Price: number, exitPrice: number): Promise<void> {
    const profit = ((exitPrice - entryPrice) / entryPrice * 100).toFixed(2)
    const profitAmount = (exitPrice - entryPrice).toFixed(2)

    const message = `✅ SILVER (XAG/USD) TRADE COMPLETE AT TP1
═══════════════════════════
Direction: ${signal.direction}

📊 Trade Summary:
Entry: $${entryPrice.toFixed(2)}
TP1 (Exit): $${tp1Price.toFixed(2)}
Actual Exit: $${exitPrice.toFixed(2)}

💰 Profit: +${profit}% (+$${profitAmount})
Setup: ${signal.setupQuality} ${signal.direction} Setup

📌 Full position closed - Profit secured!

⏰ Time: ${new Date().toISOString()}
═══════════════════════════`

    await this.sendMessage(message)
  }

  async sendSilverSLHit(signal: Signal, entryPrice: number, slPrice: number, exitPrice: number): Promise<void> {
    const loss = ((exitPrice - entryPrice) / entryPrice * 100).toFixed(2)
    const lossAmount = (entryPrice - exitPrice).toFixed(2)

    const message = `🛑 SILVER (XAG/USD) STOP LOSS HIT
═══════════════════════════
Direction: ${signal.direction}

📊 Trade Summary:
Entry: $${entryPrice.toFixed(2)}
Stop Loss: $${slPrice.toFixed(2)}
Exit: $${exitPrice.toFixed(2)}

📉 Loss: ${loss}% (-$${lossAmount})
Setup: ${signal.setupQuality} ${signal.direction} Setup

🛑 Risk management triggered - Position closed
⏳ Bias reset required before next ${signal.direction} entry

⏰ Time: ${new Date().toISOString()}
═══════════════════════════`

    await this.sendMessage(message)
  }

  private async sendMessage(message: string): Promise<void> {
    const url = `https://api.telegram.org/bot${this.botToken}/sendMessage`

    try {
      console.log("[v0] SILVER: Sending Telegram alert")
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: this.chatId,
          text: message,
          parse_mode: "Markdown",
        }),
      })

      if (!response.ok) {
        const error = await response.json()
        console.error("[v0] SILVER TELEGRAM ERROR:", error)
        throw new Error(`Telegram error: ${error.description}`)
      }

      const result = await response.json()
      console.log("[v0] SILVER: Telegram alert sent successfully")
    } catch (error) {
      console.error("[v0] SILVER: Failed to send alert:", error)
      throw error
    }
  }
}
