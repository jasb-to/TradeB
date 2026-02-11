the api export interface Candle {
  timestamp: number
  open: number
  high: number
  low: number
  close: number
  volume?: number
}

export type AlignmentState = "BULLISH" | "BEARISH" | "NO_CLEAR_BIAS"

export type HTFPolarityState = 
  | "NEUTRAL_IMPROVING"
  | "SOFT_CONFLICT"
  | "NEUTRAL_CONFLICTING"
  | "EXPLICIT_OPPOSITION"
  | "UNKNOWN"

export interface TimeframeAlignment {
  daily: AlignmentState
  h4: AlignmentState
  h1: AlignmentState
  m15: AlignmentState
  m5: AlignmentState
}

export interface StochRSIResult {
  value: number | null
  state: "CALCULATING" | "MOMENTUM_UP" | "MOMENTUM_DOWN" | "COMPRESSION"
}

export interface TechnicalIndicators {
  atr: number
  adx: number
  vwap: number
  ema20: number
  ema50: number
  ema200: number
  rsi: number
  stochRSI: number | StochRSIResult
  bollingerUpper: number
  bollingerLower: number
  chandelierStop: number | { long: number; short: number }
  chandelierLongStop?: number
  chandelierShortStop?: number
  chandelierStop4H?: number
  fibonacciLevels?: {
    high: number
    low: number
    fib236: number
    fib382: number
    fib500: number
    fib618: number
    fib786: number
  }
  supportResistance?: {
    resistance: number[]
    support: number[]
  }
  marketBias?: "BULLISH" | "BEARISH" | "RANGING"
  macd?: {
    macd: number
    signal: number
    histogram: number
  }
  divergence?: {
    bullish: boolean
    bearish: boolean
    strength: number
  }
  volumeSpike?: boolean
}

export interface EntryDecisionCriteria {
  key: string
  label: string
  passed: boolean
  reason: string
}

export interface EntryDecision {
  allowed: boolean
  tier: "NO_TRADE" | "B" | "A" | "A+"
  score: number // 0-10
  criteria: EntryDecisionCriteria[]
  blockedReasons: string[]
  alertLevel: 0 | 1 | 2 | 3
  confidence: number
}

export interface Signal {
  id?: string
  timestamp: number | string
  type: "ENTRY" | "EXIT" | "NO_TRADE" | "PENDING"
  alertLevel: 0 | 1 | 2 | 3
  strategy:
    | "BREAKOUT_CHANDELIER"
    | "BREAKOUT"
    | "BREAKDOWN"
    | "VWAP_PULLBACK"
    | "RANGE_BREAKER"
    | "MEAN_REVERSION"
    | "SUPPORT_BOUNCE"
    | "RESISTANCE_BOUNCE"
    | "CHANDELIER_TRAILING"
  direction?: "LONG" | "SHORT" | "EXIT" | "NONE" | "NEUTRAL"
  entryPrice?: number
  stopLoss?: number
  takeProfit?: number
  takeProfit1?: number
  takeProfit2?: number
  riskReward?: number
  riskRewardRatio?: number
  confidence: number
  advice?: string
  reasons: string[]
  entryDecision?: EntryDecision
  tradeStateInfo?: TradeStateInfo
  timeframeAlignment?: TimeframeAlignment
  filters?: {
    passed: string[]
    failed: string[]
  }
  indicators: Partial<TechnicalIndicators>
  mtfBias?: {
    daily: "LONG" | "SHORT" | "NEUTRAL"
    "8h": "LONG" | "SHORT" | "NEUTRAL"
    "4h": "LONG" | "SHORT" | "NEUTRAL"
    "1h": "LONG" | "SHORT" | "NEUTRAL"
    "15m": "LONG" | "SHORT" | "NEUTRAL"
    "5m": "LONG" | "SHORT" | "NEUTRAL"
  }
  entrySetup?: string
  structuralTier?: "A+" | "A" | "B" | "STANDARD"  // The tier determined by HTF regime, NOT overridden by score
  passed?: string[]
  failed?: string[]
  setupQuality?: "A+" | "A" | "B" | "STANDARD"
  targetStrategy?: "2R_HOLD" | "SCALED_1.5R" | "TRAIL_BREAKEVEN"
  pendingReason?: string
  strategyRequirements?: {
    dailyAligned: boolean
    htfAligned: boolean
    ltfConfirmation: boolean
    adxThreshold: boolean
    atrThreshold: boolean
    chopFilter: boolean
  }
  waiting?: {
    for: string[]
    met: string[]
  }
  patienceMetrics?: PatienceMetrics
  htfTrend?: "LONG" | "SHORT" | "NEUTRAL"
  htfPolarityState?: HTFPolarityState
  counterTrendBlocked?: boolean
  getReadyState?: GetReadyState
  lastCandle?: {
    close: number
    atr?: number
    adx?: number
    stochRSI?: number
    vwap?: number
    timestamp?: number
  }
}

// GET_READY State - INFORMATIONAL ONLY, never triggers trades
export interface GetReadyState {
  isGetReady: boolean
  direction: "LONG" | "SHORT" | null
  htfPolarity: "LONG" | "SHORT" | "NEUTRAL_IMPROVING" | "NEUTRAL_CONFLICTING"
  primaryBlocker: string
  structuralConditionsMet: number
  structuralConditionsRequired: number
  indicatorConditionsMet: boolean
  blockedReason: string | null
  legitimate: boolean
}

export interface TradingConfig {
  strategies: {
    breakoutChandelier: boolean
    vwapPullback: boolean
    rangeBreaker: boolean
    meanReversion: boolean
  }
  riskManagement: {
    maxRiskPerTradePercent: number
    maxTradesPerSession: number
    consecutiveLossLimit: number
    dailyLossLimitPercent: number
  }
  filters: {
    sessionFilter: {
      enableLondon: boolean
      enableNewYork: boolean
      enableAsian: boolean
      asianVolatilityThreshold: number
    }
    chopDetection: {
      minATR: number
      minADX: number
    }
  }
  parameters: {
    atrMultiplier: number
    chandelierLookback: number
    vwapPeriod: number
  }
}

export interface BacktestResult {
  winRate: number
  totalTrades: number
  profitableTrades: number
  losingTrades: number
  expectancy: number
  maxDrawdown: number
  sharpeRatio: number
  startDate: number
  endDate: number
}

export type DataSource = "oanda" | "synthetic"

export interface MarketSession {
  name: "Asian" | "London" | "NewYork"
  startHour: number
  endHour: number
  isActive: boolean
}

export interface MTFBias {
  daily: "LONG" | "SHORT" | "NEUTRAL"
  "8h": "LONG" | "SHORT" | "NEUTRAL"
  "4h": "LONG" | "SHORT" | "NEUTRAL"
  "1h": "LONG" | "SHORT" | "NEUTRAL"
  "15m": "LONG" | "SHORT" | "NEUTRAL"
  "5m": "LONG" | "SHORT" | "NEUTRAL"
}

export type TradeLifecycleState = "ACTIVE" | "PULLBACK_HEALTHY" | "NEAR_INVALIDATION" | "TP1_HIT" | "TP2_HIT" | "STOPPED" | "INVALIDATED"

export interface TradeStateInfo {
  state: TradeLifecycleState
  priceDistance: number
  percentToTP1: number
  percentToTP2: number
  pullbackDepth: number
  invalidationRisk: string | null
  reason: string
}

export interface ActiveTrade {
  id: string
  direction: "LONG" | "SHORT"
  entryPrice: number
  stopLoss: number
  takeProfit1: number
  takeProfit2: number
  entryTime: number
  status: "ACTIVE" | "TP1_HIT" | "TP2_HIT" | "SL_HIT"
  tp1Hit: boolean
  tp2Hit: boolean
  slHit: boolean
  tradeStateHistory: Array<{ state: TradeLifecycleState; timestamp: number; reason: string }>
  lastStateTransition: { state: TradeLifecycleState; timestamp: number } | null
}

// Patience & Visibility Metrics (Diagnostic Only)
export interface PatienceMetrics {
  symbol: string
  htfPolarity: "LONG" | "SHORT" | "NEUTRAL"
  htfNeutralDurationMinutes: number
  htfNeutralDurationHours: number
  htfNeutralFormatted: string
  lastHTFAlignedAt: number | null
  lastHTFAlignedFormatted: string | null
  lastHTFDirection: "LONG" | "SHORT" | null
  lastValidSetupAt: number | null
  lastValidSetupTier: "A" | "A+" | null
  hoursSinceLastValidSetup: number | null
  currentPrimaryBlocker: string
  noTradeSummary: NoTradeSummary | null
}

export interface NoTradeSummary {
  reasonCategory: "HTF_NEUTRAL" | "MTF_UNALIGNED" | "VOLATILITY_LOW" | "COOLDOWN" | "COUNTER_TREND" | "SCORE_LOW"
  explanation: string
  blockingReasons: string[]
  htfState: {
    daily: string
    h4: string
    polarity: string
  }
  durationContext: {
    htfNeutralHours: number
    hoursSinceLastSetup: number | null
  }
}
