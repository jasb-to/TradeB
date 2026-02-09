import type { TradingConfig } from "@/types/trading"

// FEATURE FLAGS - System behavior control
export const FEATURE_FLAGS = {
  ENABLE_B_TIER: false, // B-tier trades DISABLED - only A/A+ allowed
  ENABLE_REVERSAL_WARNINGS: true, // Single advisory warning per trade
  ENABLE_CHANDELIER_EXIT: true, // Advisory chandelier monitoring (not auto-exit)
  ENABLE_HARD_STOPS_ONLY: true, // Only SL/TP1/TP2 auto-exit
}

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

  // Chandelier settings - tuned per asset
  chandelierSettings: {
    XAU_USD: {
      // Gold: Slower, smoother, wider
      period: 22,
      multiplier: 3.0,
      description: "Slow chandelier for gold - adapts to wider volatility swings",
    },
    XAG_USD: {
      // Silver: Faster, tighter, more defensive
      period: 14,
      multiplier: 2.0,
      description: "Fast chandelier for silver - tighter stops for quicker reactions",
    },
  },
}

export const defaultConfig = DEFAULT_TRADING_CONFIG
