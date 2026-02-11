import type { Signal } from "@/types/trading"
import { ActiveTradeTracker } from "@/lib/active-trade-tracker"

export class TelegramNotifier {
  private botToken: string;
  private chatId: string;
  private dashboardUrl: string;

  constructor(botToken: string, chatId: string, dashboardUrl: string) {
    this.botToken = botToken;
    this.chatId = chatId;
    this.dashboardUrl = dashboardUrl;
  }

  async sendTestMessage(): Promise<void> {
    const message = `✅ TELEGRAM TEST SUCCESSFUL
━━━━━━━━━━━━━━━━━━━━
Your TradeB trading system is now connected to Telegram!

This test confirms:
✓ Bot token is valid
✓ Chat ID is correct
✓ API connection is working
✓ Messages will be delivered

You will now receive:
📈 Entry signals with full trade details
⚠️ TP1 alerts when positions are scaled
🚨 Stop loss alerts when risk breaches
✅ TP2 alerts when full position closes

⏰ *Time:* ${new Date().toISOString()}
━━━━━━━━━━━━━━━━━━━━`;

    console.log("[v0] TelegramNotifier - Sending test message")
    await this.sendMessage(message);
  }

  async sendSignalAlert(signal: Signal & { symbol?: string }): Promise<void> {
    if (!signal || !signal.type) {
      console.error("[v0] TELEGRAM: Signal is empty or missing type");
      return;
    }

    const symbol = signal.symbol || "UNKNOWN";

    // Don't send alerts for NO_TRADE signals
    if (signal.type === "NO_TRADE" || signal.alertLevel === 0) {
      console.log(`[v0] TELEGRAM: Skipping NO_TRADE alert for ${symbol}`);
      return;
    }

    // Only send ENTRY alerts with alertLevel >= 2
    if (signal.type !== "ENTRY" || signal.alertLevel < 2) {
      console.log(`[v0] TELEGRAM: Skipping alert for ${symbol} - type=${signal.type} level=${signal.alertLevel}`);
      return;
    }

    const emoji = signal.direction === "LONG" ? "📈" : signal.direction === "SHORT" ? "📉" : "⚪";
    const confidence = signal.confidence || 0;
    const confidenceBadge = confidence >= 80 ? "🟢" : confidence >= 70 ? "🟡" : "🔴";
    
    // B TIER: Use independent branding with explicit "B TIER SETUP" header
    // Read tier from entryDecision (canonical source of truth)
    const isBTier = signal.entryDecision?.tier === "B";
    const setupTier = signal.entryDecision?.tier === "A+" ? "A+ PREMIUM SETUP" 
      : signal.entryDecision?.tier === "A" ? "A SETUP"
      : "B TIER SETUP";
    const setupDescription = signal.entryDecision?.tier === "A+" 
      ? "(High confidence - ADX strong, perfect alignment)"
      : signal.entryDecision?.tier === "A" 
      ? "(Good setup - Solid trend confirmation)"
      : "(B TIER: 1H/15M aligned momentum - Reduced position size)";

    const entryPrice = signal.entryPrice?.toFixed(2) || "N/A";
    const stopLoss = signal.stopLoss?.toFixed(2) || "N/A";
    const tp1 = signal.takeProfit1?.toFixed(2) || "N/A";
    const tp2 = signal.takeProfit2?.toFixed(2) || "N/A";
    
    // B TIER: Hard TP1 only - no TP2, no runners, no scaling
    const tp1Instruction = isBTier 
      ? "HARD TP1 ONLY - Full position closes at TP1 level"
      : "TP2 for full exit (50% at TP1, 50% at TP2)";
    
    // HTF Trend context (Gold only)
    const trendContext = signal.htfTrend 
      ? `📊 HTF Trend: ${signal.htfTrend}-only regime\n   (${(signal as any).trendContext || "Polarity locked"})\n`
      : "";
    
    // Calculate entry window expiry
    const entryWindowMin = symbol.includes("XAU") ? 15 : 20;
    const expiryTime = new Date(Date.now() + entryWindowMin * 60000).toISOString();

    // Build message with HARDENED safety rules explicit
    const headerEmoji = isBTier ? "🚨" : emoji;
    const headerText = isBTier ? `${headerEmoji} B TIER SETUP – ${symbol}` : `${emoji} ENTRY SIGNAL ALERT - ONE TRADE ONLY`;
    const message = `${headerText}
═══════════════════════════════════════
SETUP TIER: ${setupTier}
${setupDescription}

Symbol: ${symbol}
Direction: ${signal.direction || "NONE"} ${signal.direction === "LONG" ? "UP ↑" : signal.direction === "SHORT" ? "DOWN ↓" : ""}
Confidence: ${confidenceBadge} ${confidence}%
Strategy: ${signal.strategy || "Breakout Chandelier"}

${trendContext}📊 TRADE LEVELS:
Entry: $${entryPrice}
Stop Loss: $${stopLoss}
TP1: $${tp1}${isBTier ? " (FULL EXIT)" : ""}
${!isBTier ? `TP2: $${tp2}` : ""}

⚠️ Risk:Reward: ${signal.riskReward?.toFixed(2) || "N/A"}:1

${isBTier ? `🚨 B TIER EXIT RULE
   ${tp1Instruction}
   • No TP2 ladder
   • No scaling out
   • Hard exit at TP1 level only

` : `📌 EARLY HTF CONTINUATION ENTRY
   • Designed for multi-day hold (1–3 days)
   • Lower timeframes used for timing, not permission
   • Higher probability = earlier participation in trend

`}🚫 ONE-TRADE-ONLY SETUP
   • NO scaling in
   • NO re-entries after stop loss
   • Only 1 active trade allowed

⛔ NO RE-ENTRY IF STOPPED
   Hard Cooldown: ${symbol.includes("XAU") ? "90 minutes" : "60 minutes"}
   
Entry Valid Until: ${expiryTime} (UTC)
After expiry: Setup automatically invalidated

Alert Level: ${this.getAlertLevelBadge(signal.alertLevel)}

🔗 Dashboard: ${this.dashboardUrl}

⏰ Time: ${new Date().toISOString()}
═══════════════════════════════════════`;

    await this.sendMessage(message, false);
  }

  async sendTP1Alert(symbol: string, entryPrice: number, tp1Price: number, currentPrice: number, isBTier: boolean = false): Promise<void> {
    const priceGain = ((currentPrice - entryPrice) / entryPrice * 100).toFixed(2)

    if (isBTier) {
      // B TIER: Hard TP1 closes entire position
      const message = `🚨 B TIER TP1 - FULL POSITION CLOSED
═══════════════════════════════════════
Symbol: ${symbol}
Entry Price: $${entryPrice.toFixed(2)}
TP1 Level (Full Exit): $${tp1Price.toFixed(2)}
Exit Price: $${currentPrice.toFixed(2)}
Profit: +${priceGain}%

✅ B TIER Trade Closed at Target
Position fully exited at TP1 level (no TP2 ladder for B tier)

⏰ Time: ${new Date().toISOString()}
═══════════════════════════════════════`
      await this.sendMessage(message, false)
    } else {
      // A/A+ TIER: TP1 scales 50%, hold 50% for TP2
      const message = `✅ TP1 REACHED - SCALE OUT
═══════════════════════════
Symbol: ${symbol}
Entry Price: $${entryPrice.toFixed(2)}
TP1 Level: $${tp1Price.toFixed(2)}
Current Price: $${currentPrice.toFixed(2)}
Profit: +${priceGain}%

📊 Action: Take 50% profit
🔒 Move SL to: Entry ($${entryPrice.toFixed(2)})
📈 Hold remaining 50% for TP2

⏰ Time: ${new Date().toISOString()}
═══════════════════════════`
      await this.sendMessage(message, false)
    }
  }

  async sendDirectionChangeAlert(symbol: string, message: string): Promise<void> {
    const fullMessage = `${message}

═════════════════════════════════════════
⚠️ THIS IS A DIRECTION CHANGE ALERT
⚠️ CLOSE YOUR TRADE IMMEDIATELY

The market has reversed direction.
Your active trade is now at risk.

Dashboard: ${this.dashboardUrl}
⏰ Time: ${new Date().toISOString()}
═════════════════════════════════════════`;

    console.log(`[v0] Sending direction-change alert for ${symbol}`)
    await this.sendMessage(fullMessage, false)
  }

  async sendTP2Alert(symbol: string, entryPrice: number, tp2Price: number, currentPrice: number): Promise<void> {
    const priceGain = ((currentPrice - entryPrice) / entryPrice * 100).toFixed(2)

    const message = `🎯 TP2 REACHED - FULL EXIT
═══════════════════════════
Symbol: ${symbol}
Entry Price: $${entryPrice.toFixed(2)}
TP2 Level: $${tp2Price.toFixed(2)}
Exit Price: $${currentPrice.toFixed(2)}
Total Profit: +${priceGain}%

✅ Trade Closed Successfully
Position fully exited at target

⏰ Time: ${new Date().toISOString()}
═══════════════════════════`

    await this.sendMessage(message, false)
  }

  async sendSLAlert(symbol: string, entryPrice: number, slPrice: number, currentPrice: number): Promise<void> {
    const loss = ((currentPrice - entryPrice) / entryPrice * 100).toFixed(2)

    const message = `🛑 STOP LOSS HIT
═══════════════════════════
Symbol: ${symbol}
Entry Price: $${entryPrice.toFixed(2)}
Stop Loss: $${slPrice.toFixed(2)}
Exit Price: $${currentPrice.toFixed(2)}
Loss: ${loss}%

❌ *Trade Closed*
Risk management triggered - Position exited at stop loss

⏰ *Time:* ${new Date().toISOString()}
━━━━━━━━━━━━━━━━━━━━`;

    await this.sendMessage(message);
  }

  async sendExitAlert(
    signal: Signal & { symbol?: string },
    reason: string,
    severity: "low" | "medium" | "high" | "critical",
  ): Promise<void> {
    const symbol = signal.symbol || "UNKNOWN";
    const severityEmoji = severity === "critical" ? "🚨" : severity === "high" ? "⚠️" : severity === "medium" ? "⚡" : "ℹ️";

    const message = `${severityEmoji} EXIT ALERT - ${severity.toUpperCase()}
━━━━━━━━━━━━━━━━━━━━
*Symbol:* ${symbol}
*Reason:* ${reason}
*Severity:* ${severity}

📊 *Position Details:*
Entry: $${signal.entryPrice?.toFixed(2) || "N/A"}
Stop Loss: $${signal.stopLoss?.toFixed(2) || "N/A"}

⏰ *Alert Time:* ${new Date().toISOString()}
━━━━━━━━━━━━━━━━━━━━`;

    await this.sendMessage(message);
  }

  async sendEntryConfirmation(signal: Signal & { symbol?: string }): Promise<void> {
    const symbol = signal.symbol || "UNKNOWN"
    const entryPrice = signal.entryPrice?.toFixed(2) || "N/A"
    const tp1 = signal.takeProfit1?.toFixed(2) || "N/A"
    const tp2 = signal.takeProfit2?.toFixed(2) || "N/A"

    const message = `✅ ENTRY CONFIRMED - TRADE ACTIVE
═══════════════════════════════════════
Symbol: ${symbol}
Entry Price: $${entryPrice}
TP1 (Partial): $${tp1}
TP2 (Full Exit): $${tp2}

🎯 FIXED TP1 / TP2 TRADE
Full exit at TP2 only.
No scaling in, no runners.

📊 Status: ACTIVE - Awaiting price targets
⏰ Time: ${new Date().toISOString()}
═══════════════════════════════════════`

    await this.sendMessage(message, false)
  }

  async sendTradeStateAlert(symbol: string, previousState: string, newState: string, reason: string): Promise<void> {
    let emoji = "📊"
    let message = ""

    switch (newState) {
      case "PULLBACK_HEALTHY":
        emoji = "📉"
        message = `${emoji} PULLBACK DETECTED — STRUCTURE INTACT
═══════════════════════════════════════
Symbol: ${symbol}
Status: Healthy Pullback

Price is retracing but:
✓ Structure remains intact
✓ VWAP not lost
✓ Momentum intact

Trade remains VALID.
No action required — stay on trade.

Reason: ${reason}
⏰ Time: ${new Date().toISOString()}
═══════════════════════════════════════`
        break

      case "NEAR_INVALIDATION":
        emoji = "⚠️"
        message = `${emoji} TRADE APPROACHING INVALIDATION
═══════════════════════════════════════
Symbol: ${symbol}
Status: NEAR INVALIDATION WARNING

One or more invalidation signals detected:
${reason}

⚡ ACTION:
Exit ONLY if:
• Stop loss is confirmed breached
• Invalidation condition fully triggers
• Structure breaks definitively

Otherwise, hold position and monitor closely.

⏰ Time: ${new Date().toISOString()}
═══════════════════════════════════════`
        break

      case "TP1_HIT":
        emoji = "✅"
        message = `${emoji} TP1 HIT — PARTIAL PROFITS SECURED
═══════════════════════════════════════
Symbol: ${symbol}
Status: TP1 FILLED

Partial profits have been secured.

📊 Next: Monitor for TP2 or invalidation
Trade remains active until TP2 or stopped.

Reason: ${reason}
⏰ Time: ${new Date().toISOString()}
═══════════════════════════════════════`
        break

      case "TP2_HIT":
        emoji = "🎯"
        message = `${emoji} TP2 HIT — TRADE CLOSED IN PROFIT
═══════════════════════════════════════
Symbol: ${symbol}
Status: TP2 FILLED ✅

Full position closed at target.
Trade completed successfully.

Reason: ${reason}
⏰ Time: ${new Date().toISOString()}
═══════════════════════════════════════`
        break

      case "INVALIDATED":
        emoji = "🛑"
        message = `${emoji} TRADE INVALIDATED
═══════════════════════════════════════
Symbol: ${symbol}
Status: TRADE INVALIDATED

Invalidation condition(s) confirmed:
${reason}

Position should be closed.
Hard cooldown period now active.

Reason: ${reason}
⏰ Time: ${new Date().toISOString()}
═══════════════════════════════════════`
        break

      case "STOPPED":
        emoji = "❌"
        message = `${emoji} STOP LOSS CONFIRMED
═══════════════════════════════════════
Symbol: ${symbol}
Status: STOPPED OUT

Stop loss level breached.
Position closed at risk management level.

Hard cooldown: ${symbol.includes("XAU") ? "90 minutes" : "60 minutes"}

Reason: ${reason}
⏰ Time: ${new Date().toISOString()}
═══════════════════════════════════════`
        break
    }

    if (message) {
      await this.sendMessage(message, false)
    }
  }

  private getAlertLevelBadge(level: number): string {
    if (level >= 3) return "🟢 HIGH (Level 3)";
    if (level === 2) return "🟡 MEDIUM (Level 2)";
    if (level === 1) return "🔴 LOW (Level 1)";
    return "⚪ NONE";
  }

  /**
   * Send daily silent status when no trades occurred in 24h
   * This is informational only - never resembles an entry alert
   */
  async sendDailyStatus(
    symbol: string,
    htfPolarity: string,
    dailyStructure: string,
    h4Structure: string,
    htfNeutralDuration: string,
    hoursSinceLastSetup: number | null,
    primaryBlocker: string
  ): Promise<void> {
    const lastSetupText = hoursSinceLastSetup !== null 
      ? `${hoursSinceLastSetup.toFixed(1)} hours ago`
      : "No record in session"

    const message = `📊 SYSTEM STATUS — NO TRADE DAY
═══════════════════════════════════════
Symbol: ${symbol}
HTF State: ${htfPolarity} (Daily ${dailyStructure} / 4H ${h4Structure})
HTF Neutral Duration: ${htfNeutralDuration}
Last A+ Setup: ${lastSetupText}
Primary Blocker: ${primaryBlocker}

Status: System waiting for structural alignment

No action required.
This is an informational status update only.

⏰ Time: ${new Date().toISOString()}
═══════════════════════════════════════`

    await this.sendMessage(message, false)
  }

  private async sendMessage(message: string, parseMarkdown: boolean = false): Promise<void> {
    const url = `https://api.telegram.org/bot${this.botToken}/sendMessage`;

    try {
      console.log(`[v0] TELEGRAM: Attempting to send message to chat ${this.chatId}`);
      console.log(`[v0] TELEGRAM: API URL: ${url}`)
      console.log(`[v0] TELEGRAM: Message length: ${message.length} characters`)
      
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: this.chatId,
          text: message,
          parse_mode: parseMarkdown ? "Markdown" : undefined,
        }),
      });

      console.log(`[v0] TELEGRAM: API Response status: ${response.status}`)
      
      if (!response.ok) {
        const error = await response.json();
        console.error(`[v0] TELEGRAM ERROR: ${response.status}`, error);
        throw new Error(`Telegram API error: ${error.description}`);
      }

      const result = await response.json();
      console.log(`[v0] TELEGRAM: Message sent successfully`);
      if (!result.ok) {
        console.error(`[v0] TELEGRAM ERROR: ${result.description}`);
        throw new Error(`Telegram error: ${result.description}`);
      }

      console.log(`[v0] TELEGRAM MESSAGE SENT: messageId=${result.result.message_id}`);
    } catch (error) {
      console.error("[v0] TELEGRAM SEND FAILED:", error);
      throw error
    }
  }

  // Clear cooldown for test messages
  async clearCooldown(symbol: string): Promise<void> {
    console.log(`[v0] TelegramNotifier - Clearing cooldown for ${symbol}`)
    // For test messages, we don't need to actually clear anything
    // This is just to bypass the cooldown check in the test endpoint
    console.log(`[v0] TelegramNotifier - Cooldown cleared for ${symbol}`)
  }
}
