// v5.5.2: XAU_USD FOCUS - Removed JP225, US100, US500 - System now focused on gold trading only
export const TRADING_SYMBOLS = ["XAU_USD"] as const

export type TradingSymbol = typeof TRADING_SYMBOLS[number]

export function isValidTradingSymbol(symbol: string): symbol is TradingSymbol {
  return TRADING_SYMBOLS.includes(symbol as TradingSymbol)
}
