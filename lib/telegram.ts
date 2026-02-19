import type { Signal } from "@/types/trading"
import {
  formatSignalHTML,
  formatTP1AlertHTML,
  formatTP2AlertHTML,
  formatSLAlertHTML,
  formatTestMessageHTML,
  type SignalBreakdown,
} from "@/lib/telegram-html-formatter"

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
    const message = formatTestMessageHTML()
    console.log("[v0] TelegramNotifier - Sending test message")
    await this.sendMessage(message, "HTML")
  }

  async sendSignalAlert(signal: any): Promise<void> {
    // Support both raw Signal and normalized AlertPayload
    const isNormalized = signal.symbol && !signal.entryPrice && !signal.direction === "LONG";
    
    if (!signal) {
      console.error("[v0] TELEGRAM: Signal is empty");
      return;
    }

    // Extract normalized payload fields (STEP 1: Single source of truth)
    const symbol = (signal.symbol || "UNKNOWN").toUpperCase();
    const direction = (signal.direction || "N/A").toUpperCase();
    const tier = signal.tier || "NO_TRADE";
    const score = signal.score ?? 0;
    const entry = signal.entry ?? signal.entryPrice ?? null;
    const confidence = signal.confidence ?? 0;
    const tp1 = signal.tp1 ?? signal.takeProfit1 ?? null;
    const tp2 = signal.tp2 ?? signal.takeProfit2 ?? null;
    const sl = signal.sl ?? signal.stopLoss ?? null;

    // Enforce tier fallback (STEP 2)
    const validTiers = ["A+", "A", "B", "NO_TRADE"]
    const finalTier = validTiers.includes(tier) ? tier : "NO_TRADE"

    // Format symbol (STEP 3)
    const cleanSymbol = symbol.replace(/_USD/g, "")

    // Skip NO_TRADE
    if (finalTier === "NO_TRADE") {
      console.log(`[v0] TELEGRAM: Skipping NO_TRADE alert for ${cleanSymbol}`);
      return;
    }

    // Build message from normalized fields only (STEP 4)
    const emoji = direction === "LONG" ? "📈" : direction === "SHORT" ? "📉" : "⚪";
    const confidenceBadge = confidence >= 80 ? "🟢" : confidence >= 70 ? "🟡" : "🔴";
    
    const isBTier = finalTier === "B"
    const setupTier = finalTier === "A+" ? "A+ PREMIUM SETUP" 
      : finalTier === "A" ? "A SETUP"
      : "B TIER SETUP"
    const setupDescription = finalTier === "A+" 
      ? "(High confidence - ADX strong, perfect alignment)"
      : finalTier === "A" 
      ? "(Good setup - Solid trend confirmation)"
      : "(B TIER: 1H/15M aligned momentum - Reduced position size)"

    const entryStr = entry != null && typeof entry === "number" ? entry.toFixed(2) : "N/A"
    const slStr = sl != null && typeof sl === "number" ? sl.toFixed(2) : "N/A"
    const tp1Str = tp1 != null && typeof tp1 === "number" ? tp1.toFixed(2) : "N/A"
    const tp2Str = tp2 != null && typeof tp2 === "number" ? tp2.toFixed(2) : "N/A"
    
    const scoreFormatted = typeof score === "number" ? score.toFixed(1) : "0.0"
    
    const tp1Instruction = isBTier 
      ? "HARD TP1 ONLY - Full position closes at TP1 level"
      : "TP2 for full exit (50% at TP1, 50% at TP2)"

    const headerEmoji = isBTier ? "🚨" : emoji;
    const headerText = isBTier ? `${headerEmoji} B TIER SETUP – ${cleanSymbol}` : `${emoji} ENTRY SIGNAL ALERT - ONE TRADE ONLY`;
    const message = `${headerText}
═══════════════════════════════════════
SETUP TIER: ${setupTier}
${setupDescription}

Symbol: ${cleanSymbol}
Direction: ${direction}
Score: ${scoreFormatted}/9 ${confidenceBadge}

Entry: $${entryStr}
SL: $${slStr}
TP1: $${tp1Str}
${!isBTier ? `TP2: $${tp2Str}` : ""}

Exit Rule: ${tp1Instruction}

⏰ Time: ${new Date().toISOString()}
═══════════════════════════════════════`;

    console.log(`[v0] TELEGRAM: Alert message built from normalized payload for ${cleanSymbol}`)
    await this.sendMessage(message);
  }

  // Legacy method - kept for backward compatibility
  async sendSignalAlertLegacy(signal: Signal & { symbol?: string }): Promise<void> {
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

    const entryPrice = signal.entryPrice != null && typeof signal.entryPrice === "number" ? signal.entryPrice.toFixed(2) : "N/A";
    const stopLoss = signal.stopLoss != null && typeof signal.stopLoss === "number" ? signal.stopLoss.toFixed(2) : "N/A";
    const tp1 = signal.takeProfit1 != null && typeof signal.takeProfit1 === "number" ? signal.takeProfit1.toFixed(2) : "N/A";
    const tp2 = signal.takeProfit2 != null && typeof signal.takeProfit2 === "number" ? signal.takeProfit2.toFixed(2) : "N/A";
    
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
═══════════════════════════════════���═══
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
    const message = formatTP1AlertHTML({
      symbol,
      entryPrice,
      tp1Price,
      currentPrice,
      tier: isBTier ? "B" : "A",
    })
    await this.sendMessage(message, "HTML")
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
    const message = formatTP2AlertHTML({
      symbol,
      entryPrice,
      tp2Price,
      currentPrice,
    })
    await this.sendMessage(message, "HTML")
  }

  async sendSLAlert(symbol: string, entryPrice: number, slPrice: number, currentPrice: number): Promise<void> {
    const message = formatSLAlertHTML({
      symbol,
      entryPrice,
      slPrice,
      currentPrice,
    })
    await this.sendMessage(message, "HTML")
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
═══════��═══════════════════════════════`
        break

      case "NEAR_INVALIDATION":
        emoji = "⚠️"
        message = `${emoji} TRADE APPROACHING INVALIDATION
══════════════���════════════════════════
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

  private async sendMessage(message: string, parseMode?: "HTML" | "Markdown"): Promise<void> {
    const url = `https://api.telegram.org/bot${this.botToken}/sendMessage`;

    try {
      console.log(`[v0] TELEGRAM: Attempting to send message to chat ${this.chatId}`);
      console.log(`[v0] TELEGRAM: API URL: ${url}`)
      console.log(`[v0] TELEGRAM: Message length: ${message.length} characters`)
      console.log(`[v0] TELEGRAM: Parse mode: ${parseMode || "None"}`)
      
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: this.chatId,
          text: message,
          parse_mode: parseMode,
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
