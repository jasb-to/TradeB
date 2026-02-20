/**
 * System Version Management
 * Single source of truth for TradeB system version across all components and APIs
 */

export const SYSTEM_VERSION = "11.0.0-ARCHITECTURAL-RESET"

export const SYSTEM_INFO = {
  version: SYSTEM_VERSION,
  phase: "Phase 3 - Capital Protection Layer",
  buildDate: new Date().toISOString(),
  symbols: ["XAU_USD", "NAS100USD", "SPX500USD"],
  strategyMode: "Strict + Balanced Multi-Timeframe",
  capitalProtection: {
    staleDateDetection: true,
    instrumentHours: true,
    safeMode: true,
  },
}
