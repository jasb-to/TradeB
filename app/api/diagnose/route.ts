import { NextResponse } from "next/server"
import { MarketHours } from "@/lib/market-hours"
import { SignalCache } from "@/lib/signal-cache"
import { CronEndpoint } from "@/lib/cron-endpoint"

export const dynamic = "force-dynamic"

const DASHBOARD_URL = "https://xptswitch.vercel.app"
const TRADING_SYMBOLS = ["XAU_USD", "XAG_USD"]

export async function GET() {
  const marketStatus = MarketHours.getMarketStatus()
  const cronEndpoint = new CronEndpoint(DASHBOARD_URL, process.env.CRON_SECRET || "")
  const configStatus = cronEndpoint.validateConfiguration()

  // Get signal cache status for each symbol
  const signalCacheStatus: Record<string, any> = {}
  for (const symbol of TRADING_SYMBOLS) {
    const cachedSignal = SignalCache.get(symbol)
    const alertState = SignalCache.getAlertState(symbol)
    signalCacheStatus[symbol] = {
      hasSignal: !!cachedSignal,
      signalType: cachedSignal?.type || null,
      signalDirection: cachedSignal?.direction || null,
      signalConfidence: cachedSignal?.confidence || null,
      signalAlertLevel: cachedSignal?.alertLevel || null,
      cacheAge: SignalCache.getTimestamp(symbol) ? `${Math.round((Date.now() - SignalCache.getTimestamp(symbol)) / 1000)}s` : null,
      hash: SignalCache.getHash(symbol),
      consecutiveNoTrades: alertState.consecutiveNoTrades,
      confidenceThreshold: SignalCache.getConfidenceThreshold(symbol),
      lastAlertType: alertState.lastAlertType,
      lastAlertDirection: alertState.lastAlertDirection,
      lastAlertLevel: alertState.lastAlertLevel,
      timeSinceLastAlert: alertState.lastAlertTime ? `${Math.round((Date.now() - alertState.lastAlertTime) / 1000)}s` : "never",
    }
  }

  const diagnostics = {
    timestamp: new Date().toISOString(),
    marketStatus,
    signalCache: signalCacheStatus,
    environment: {
      domain: DASHBOARD_URL,
      cronSecret: {
        configured: !!process.env.CRON_SECRET,
        preview: process.env.CRON_SECRET ? `${process.env.CRON_SECRET.substring(0, 8)}...` : "NOT SET",
      },
      telegram: {
        botToken: !!process.env.TELEGRAM_BOT_TOKEN,
        chatId: !!process.env.TELEGRAM_CHAT_ID,
      },
      oanda: {
        apiKey: !!process.env.OANDA_API_KEY,
        accountId: !!process.env.OANDA_ACCOUNT_ID,
      },
    },
    configurationStatus: {
      isValid: configStatus.valid,
      issues: configStatus.issues,
    },
    cronSetup: {
      url: cronEndpoint.getExternalCronUrl(),
      schedule: "*/10 * * * * (every 10 minutes)",
      instructions: "Visit https://cron-job.org/en/ and create cronjob with URL above",
    },
    endpoints: {
      externalCron: `${DASHBOARD_URL}/api/external-cron?secret=${process.env.CRON_SECRET ? "YOUR_SECRET" : "NOT_SET"}`,
      signal: {
        xau: `${DASHBOARD_URL}/api/signal/xau`,
        xag: `${DASHBOARD_URL}/api/signal/xag`,
      },
      testTelegram: `${DASHBOARD_URL}/api/test-telegram`,
      diagnose: `${DASHBOARD_URL}/api/diagnose`,
    },
    setupGuide: cronEndpoint.getSetupInstructions(),
    systemStatus: cronEndpoint.getSystemStatus(),
  }

  return NextResponse.json(diagnostics)
  if (process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID) {
    try {
      const testResult = await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/getMe`)
      const botInfo = await testResult.json()
      diagnostics.environment.telegram.botConnected = testResult.ok
      diagnostics.environment.telegram.botUsername = botInfo.result?.username || null
    } catch (error) {
      diagnostics.environment.telegram.botConnected = false
    }
  }

  return NextResponse.json(diagnostics)
}
