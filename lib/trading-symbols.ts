// v5.1.0 FORCE REBUILD - GBP_JPY removed, US100/US500 added
export const TRADING_SYMBOLS = ["XAU_USD", "JP225", "US100", "US500"] as const

export type TradingSymbol = typeof TRADING_SYMBOLS[number]

export function isValidTradingSymbol(symbol: string): symbol is TradingSymbol {
  return TRADING_SYMBOLS.includes(symbol as TradingSymbol)
}
