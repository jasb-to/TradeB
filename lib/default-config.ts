import type { TradingConfig } from "@/types/trading"

// Weekly swing trading requires fewer signals but higher quality
// ATR: >1.0 for swing trades, >2.0 ideal
// ADX: >10 to avoid dead markets, >15 for trends
// Focus on catching 2-3 high-quality trades per week that can run for 5-10+ days

export const DEFAULT_TRADING_CONFIG: TradingConfig = {
  strategies: {
    breakoutChandelier: true,
    vwapPullback: false, // Disabled for cleaner swing trade focus
    rangeBreaker: false, // Disabled for cleaner swing trade focus
    meanReversion: false,
  },
  riskManagement: {
    maxRiskPerTradePercent: 1.0,
    maxTradesPerSession: 3, // Fewer trades, higher quality for swing trading
    consecutiveLossLimit: 3,
    dailyLossLimitPercent: 5.0,
  },
  filters: {
    sessionFilter: {
      enableLondon: true,
      enableNewYork: true,
      enableAsian: true, // 24/7 coverage for swing trades
      asianVolatilityThreshold: 5,
    },
    chopDetection: {
      minATR: 0.01, // Essentially disabled - accept any volatility
      minADX: 0, // Completely disabled - accept no-trend markets too
    },
  },
  parameters: {
    atrMultiplier: 3.0, // Wide stops for swing trades
    chandelierLookback: 22,
    vwapPeriod: 20,
  },
}

export const defaultConfig = DEFAULT_TRADING_CONFIG
