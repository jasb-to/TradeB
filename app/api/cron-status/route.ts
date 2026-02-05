import { NextResponse } from "next/server"
import { SignalCache } from "@/lib/signal-cache"

export const dynamic = "force-dynamic"

const TRADING_SYMBOLS = ["XAU_USD", "XAG_USD"]

export async function GET() {
  const diagnostics: Record<string, any> = {
    timestamp: new Date().toISOString(),
    environment: {
      cron_secret_set: !!process.env.CRON_SECRET,
      telegram_bot_token_set: !!process.env.TELEGRAM_BOT_TOKEN,
      telegram_chat_id_set: !!process.env.TELEGRAM_CHAT_ID,
      oanda_api_key_set: !!process.env.OANDA_API_KEY,
      oanda_account_id_set: !!process.env.OANDA_ACCOUNT_ID,
    },
    cachedSignals: {},
    cronEndpoints: {
      internal_cron: "https://xptswitch.vercel.app/api/cron",
      external_cron: `https://xptswitch.vercel.app/api/external-cron?secret=${process.env.CRON_SECRET || "NOT_SET"}`,
      test_telegram: "https://xptswitch.vercel.app/api/test-telegram",
    },
    instructions: {
      "1_verify_env": "All environment variables must be set in Vercel dashboard",
      "2_test_telegram": "Call /api/test-telegram to verify Telegram connection",
      "3_check_signals": "Signals are cached and displayed below",
      "4_manual_cron": "You can call /api/cron or /api/external-cron manually to test",
    },
  }

  // Check cached signals
  for (const symbol of TRADING_SYMBOLS) {
    const cached = SignalCache.get(symbol)
    const alertState = SignalCache.getAlertState(symbol)
    diagnostics.cachedSignals[symbol] = {
      hasCachedSignal: !!cached,
      signalType: cached?.type || null,
      signalDirection: cached?.direction || null,
      signalAlertLevel: cached?.alertLevel || null,
      signalConfidence: cached?.confidence || null,
      alertState: {
        lastAlertTime: alertState.lastAlertTime,
        timeSinceLastAlert: alertState.lastAlertTime
          ? `${Math.round((Date.now() - alertState.lastAlertTime) / 1000)}s ago`
          : "never",
        cooldownActive: Date.now() - (alertState.lastAlertTime || 0) < 300000,
      },
    }
  }

  return NextResponse.json(diagnostics)
}
