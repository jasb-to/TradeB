export const TRADING_SYMBOLS = ["XAU_USD", "JP225", "US100", "US500"] as const

export type TradingSymbol = typeof TRADING_SYMBOLS[number]

export function isValidTradingSymbol(symbol: string): symbol is TradingSymbol {
  return TRADING_SYMBOLS.includes(symbol as TradingSymbol)
}
