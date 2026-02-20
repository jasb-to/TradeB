// Institutional Architecture: Single Source of Truth for All Instruments
// Every system layer (guard, router, market hours, cache, UI) reads from here
// No drift. No silent failures.

export const INSTRUMENTS = {
  XAU_USD: {
    strategy: "STRICT" as const,
    marketType: "METAL" as const,
    display: "Gold",
    oandaName: "XAU_USD",
    decimals: 2,
    volatility: "MEDIUM",
    typicalPips: 50,
  },
  EUR_USD: {
    strategy: "BALANCED" as const,
    marketType: "FX" as const,
    display: "EUR/USD",
    oandaName: "EUR_USD",
    decimals: 5,
    volatility: "LOW",
    typicalPips: 20,
  },
  NAS100USD: {
    strategy: "STRICT" as const,
    marketType: "INDEX" as const,
    display: "Nasdaq 100",
    oandaName: "US NAS 100",
    decimals: 1,
    volatility: "HIGH",
    typicalPips: 100,
  },
  SPX500USD: {
    strategy: "STRICT" as const,
    marketType: "INDEX" as const,
    display: "S&P 500",
    oandaName: "US SPX 500",
    decimals: 1,
    volatility: "MEDIUM_HIGH",
    typicalPips: 80,
  },
} as const

export type InstrumentKey = keyof typeof INSTRUMENTS
export type MarketType = "METAL" | "FX" | "INDEX"
export type StrategyMode = "STRICT" | "BALANCED"

/**
 * Validate instrument symbol - single point of truth
 * Used by: API guards, frontend validation, cache keys, market hours
 */
export function isValidInstrument(symbol: string): symbol is InstrumentKey {
  return symbol in INSTRUMENTS
}

/**
 * Get instrument config - always check this exists before accessing
 */
export function getInstrumentConfig(symbol: InstrumentKey) {
  return INSTRUMENTS[symbol]
}

/**
 * Get all valid instruments for API responses
 */
export function getValidInstruments() {
  return Object.keys(INSTRUMENTS) as InstrumentKey[]
}

/**
 * Get strategy mode for instrument - declarative, not fragile switch statements
 */
export function getStrategyForInstrument(symbol: InstrumentKey): StrategyMode {
  return INSTRUMENTS[symbol].strategy
}

/**
 * Get market type for instrument - used by market hours logic
 */
export function getMarketTypeForInstrument(symbol: InstrumentKey): MarketType {
  return INSTRUMENTS[symbol].marketType
}
