// v11.6.0: Multi-symbol support with symbol-specific strategy routing
// XAU_USD = STRICT strategy (volatility-driven)
// EUR_USD = BALANCED strategy (pair stability)
// NAS100USD = STRICT strategy (high-vol index)
// SPX500USD = STRICT strategy (medium-vol index)
export const TRADING_SYMBOLS = ["XAU_USD", "EUR_USD", "NAS100USD", "SPX500USD"] as const

export type TradingSymbol = typeof TRADING_SYMBOLS[number]

export function isValidTradingSymbol(symbol: string): symbol is TradingSymbol {
  return TRADING_SYMBOLS.includes(symbol as TradingSymbol)
}
