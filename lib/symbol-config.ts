/**
 * Trading Symbol Configuration
 * Centralized instrument definitions with OANDA API names and metadata
 */

export const TRADING_SYMBOLS = ["XAU_USD", "NAS100USD", "SPX500USD"] as const
export type TradingSymbol = (typeof TRADING_SYMBOLS)[number]

export interface SymbolConfig {
  symbol: TradingSymbol
  display: string
  oandaName: string
  description: string
  volatility: "LOW" | "MEDIUM" | "HIGH"
  typicalPips: number
  sessionHours: string
  recommendedMaxTrades: number
  // Strategy tuning for this symbol
  adxMinimum: number
  emaGapMinimum: number
  signalThreshold: number
  tp1RiskReward: number
  tp2RiskReward: number
}

export const SYMBOL_CONFIG: Record<TradingSymbol, SymbolConfig> = {
  XAU_USD: {
    symbol: "XAU_USD",
    display: "XAU",
    oandaName: "XAU_USD",
    description: "Gold / US Dollar",
    volatility: "MEDIUM",
    typicalPips: 50,
    sessionHours: "24/5 (Forex)",
    recommendedMaxTrades: 2,
    adxMinimum: 10,
    emaGapMinimum: 1.0,
    signalThreshold: 3.5,
    tp1RiskReward: 1.0,
    tp2RiskReward: 1.5,
  },
  NAS100USD: {
    symbol: "NAS100USD",
    display: "US100",
    oandaName: "US NAS 100",
    description: "NASDAQ 100 Index",
    volatility: "HIGH",
    typicalPips: 100,
    sessionHours: "24/5 (Index)",
    recommendedMaxTrades: 1,
    // Looser thresholds for higher volatility
    adxMinimum: 8,
    emaGapMinimum: 0.5,
    signalThreshold: 3.0,
    tp1RiskReward: 1.0,
    tp2RiskReward: 1.5,
  },
  SPX500USD: {
    symbol: "SPX500USD",
    display: "US500",
    oandaName: "US SPX 500",
    description: "S&P 500 Index",
    volatility: "MEDIUM_HIGH",
    typicalPips: 80,
    sessionHours: "24/5 (Index)",
    recommendedMaxTrades: 1,
    // Medium thresholds for medium-high volatility
    adxMinimum: 9,
    emaGapMinimum: 0.7,
    signalThreshold: 3.2,
    tp1RiskReward: 1.0,
    tp2RiskReward: 1.5,
  },
}

export const getSymbolConfig = (symbol: string): SymbolConfig | null => {
  const config = SYMBOL_CONFIG[symbol as TradingSymbol]
  return config || null
}

export const isValidSymbol = (symbol: string): symbol is TradingSymbol => {
  return TRADING_SYMBOLS.includes(symbol as TradingSymbol)
}
