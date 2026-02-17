"use strict";
/**
 * BALANCED_BREAKOUT Strategy Engine
 *
 * Separate evaluation path from STRICT mode.
 * Designed for 1-2 swing trades per week, 1-2 day holds.
 * CACHE BUST v3.1: Force Turbopack recompile - all indicators now use calculateAllIndicators only
 *
 * Timeframe Stack:
 *   Bias: Daily (weighted, NOT blocking)
 *   Trend confirmation: 4H (required)
 *   Execution: 1H
 *
 * Key difference from STRICT:
 *   - No HTF polarity blocking
 *   - No daily alignment blocking
 *   - Only 4H trend is a hard gate
 *   - Daily adds score weight only
 *   - Breakout-based entries (20-bar high/low)
 *   - Partial TP model (50% at 1.5R, trail remainder)
 */
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.BalancedBreakoutStrategy = void 0;
var indicators_1 = require("./indicators");
var BalancedBreakoutStrategy = /** @class */ (function () {
    function BalancedBreakoutStrategy(config) {
        this.dataSource = "OANDA";
        this.config = config;
    }
    BalancedBreakoutStrategy.prototype.setDataSource = function (source) {
        this.dataSource = source;
    };
    BalancedBreakoutStrategy.prototype.evaluateSignals = function (dataDaily, data4h, data1h) {
        return __awaiter(this, void 0, void 0, function () {
            var indDaily, ind4h, ind1h, currentPrice, adx1h, atr1h, vwap1h, ema20_4h, ema50_4h, trend4h, breakoutDirection, atrThreshold, vwapOk, dailyBias, score, atrMultiple, stopLoss, riskAmount, tp1, chandelierStop, tp2, tp2_3r, finalTP2, riskReward, tier;
            var _a, _b;
            return __generator(this, function (_c) {
                console.log("ENGINE_ACTIVE: BALANCED - v3.2 CLEAN BUILD");
                console.log("BALANCED_VERSION: calculateAllIndicators GUARANTEED ACTIVE - NO_CALL_TO_calculateAll");
                indDaily = this.computeIndicators(dataDaily, "daily");
                ind4h = this.computeIndicators(data4h, "4h");
                ind1h = this.computeIndicators(data1h, "1h");
                currentPrice = ((_a = data1h[data1h.length - 1]) === null || _a === void 0 ? void 0 : _a.close) || 0;
                adx1h = ind1h.adx || 0;
                atr1h = ind1h.atr || 0;
                vwap1h = ind1h.vwap || 0;
                ema20_4h = ind4h.ema20 || 0;
                ema50_4h = ind4h.ema50 || 0;
                trend4h = ema20_4h > ema50_4h ? "LONG" : ema20_4h < ema50_4h ? "SHORT" : "NEUTRAL";
                if (trend4h === "NEUTRAL") {
                    return [2 /*return*/, this.noTradeSignal(currentPrice, data1h, ind1h, "4H trend neutral (EMA20 ~ EMA50) - no directional bias")];
                }
                breakoutDirection = this.detectBreakout(data1h, trend4h);
                if (!breakoutDirection) {
                    return [2 /*return*/, this.noTradeSignal(currentPrice, data1h, ind1h, "Awaiting 1H breakout in ".concat(trend4h, " direction (4H EMA20 ").concat(trend4h === "LONG" ? ">" : "<", " EMA50)"))];
                }
                // ── STEP 3: ADX FILTER (1H >= 20) ──────────────────────────────
                if (adx1h < 20) {
                    return [2 /*return*/, this.noTradeSignal(currentPrice, data1h, ind1h, "ADX too low: ".concat(adx1h.toFixed(1), " < 20 (breakout detected but no momentum)"))];
                }
                atrThreshold = currentPrice > 1000 ? 5.0 : 0.15 // Gold vs GBP/JPY
                ;
                if (atr1h < atrThreshold) {
                    return [2 /*return*/, this.noTradeSignal(currentPrice, data1h, ind1h, "ATR too low: ".concat(atr1h.toFixed(2), " < ").concat(atrThreshold, " (insufficient volatility)"))];
                }
                vwapOk = (breakoutDirection === "LONG" && currentPrice > vwap1h) ||
                    (breakoutDirection === "SHORT" && currentPrice < vwap1h);
                if (!vwapOk) {
                    return [2 /*return*/, this.noTradeSignal(currentPrice, data1h, ind1h, "VWAP not supporting ".concat(breakoutDirection, ": price ").concat(currentPrice.toFixed(2), " vs VWAP ").concat(vwap1h.toFixed(2)))];
                }
                dailyBias = this.determineBias(dataDaily, indDaily);
                score = 5 // Base score for passing all hard filters
                ;
                if (dailyBias === breakoutDirection) {
                    score += 1; // Daily alignment bonus
                }
                // Daily opposing does NOT block, just no bonus
                // ── STEP 7: SCORING ────────────────────────────────────────────
                // ADX strength bonus
                if (adx1h >= 30)
                    score += 2;
                else if (adx1h >= 25)
                    score += 1.5;
                else if (adx1h >= 20)
                    score += 1;
                atrMultiple = atr1h / atrThreshold;
                if (atrMultiple >= 2.0)
                    score += 1;
                stopLoss = breakoutDirection === "LONG"
                    ? currentPrice - atr1h * 1.5
                    : currentPrice + atr1h * 1.5;
                riskAmount = Math.abs(currentPrice - stopLoss);
                tp1 = breakoutDirection === "LONG"
                    ? currentPrice + riskAmount * 1.5
                    : currentPrice - riskAmount * 1.5;
                chandelierStop = indicators_1.TechnicalAnalysis.calculateChandelierStop(data1h, 22, 3);
                tp2 = breakoutDirection === "LONG" ? chandelierStop.long : chandelierStop.short;
                tp2_3r = breakoutDirection === "LONG"
                    ? currentPrice + riskAmount * 3.0
                    : currentPrice - riskAmount * 3.0;
                finalTP2 = breakoutDirection === "LONG"
                    ? Math.max(tp2, tp2_3r)
                    : Math.min(tp2, tp2_3r);
                riskReward = riskAmount > 0 ? Math.abs(finalTP2 - currentPrice) / riskAmount : 0;
                tier = score >= 8 ? "A+" : score >= 6.5 ? "A" : "B";
                console.log("[BALANCED] ENTRY: ".concat(breakoutDirection, " ").concat(tier, " @ ").concat(currentPrice.toFixed(2), " | Score ").concat(score, "/9 | ADX ").concat(adx1h.toFixed(1), " | Daily ").concat(dailyBias, " | 4H ").concat(trend4h));
                return [2 /*return*/, {
                        type: "ENTRY",
                        direction: breakoutDirection,
                        alertLevel: tier === "A+" ? 3 : tier === "A" ? 2 : 1,
                        confidence: tier === "A+" ? 90 : tier === "A" ? 75 : 65,
                        entryPrice: currentPrice,
                        stopLoss: stopLoss,
                        takeProfit1: tp1,
                        takeProfit2: tier === "B" ? undefined : finalTP2, // B-tier: hard TP1 only
                        takeProfit: tier === "B" ? tp1 : finalTP2,
                        riskReward: riskReward,
                        htfTrend: trend4h,
                        structuralTier: tier,
                        strategy: "BALANCED_BREAKOUT",
                        strategyMode: "BALANCED",
                        reasons: [
                            "4H Trend: ".concat(trend4h, " (EMA20 ").concat(trend4h === "LONG" ? ">" : "<", " EMA50)"),
                            "1H Breakout: ".concat(breakoutDirection, " (20-bar ").concat(breakoutDirection === "LONG" ? "high" : "low", " broken)"),
                            "ADX: ".concat(adx1h.toFixed(1), " (momentum confirmed)"),
                            "VWAP: Price ".concat(vwapOk ? "confirmed" : "rejected"),
                            "Daily bias: ".concat(dailyBias, " (").concat(dailyBias === breakoutDirection ? "+1 score" : "no bonus, not blocking", ")"),
                            "Score: ".concat(score, "/9 | Tier: ").concat(tier),
                            tier === "B"
                                ? "Exit: Hard TP1 at 1.5R (".concat(tp1.toFixed(2), ")")
                                : "Exit: 50% at 1.5R (".concat(tp1.toFixed(2), "), trail remaining via Chandelier"),
                            "R:R ".concat(riskReward.toFixed(2), ":1 | SL: ").concat(stopLoss.toFixed(2)),
                        ],
                        indicators: {
                            adx: adx1h,
                            rsi: ind1h.rsi || 50,
                            stochRSI: ind1h.stochRSI || 50,
                            atr: atr1h,
                            vwap: vwap1h,
                            ema20: ind1h.ema20 || 0,
                            ema50: ind1h.ema50 || 0,
                            ema200: ind1h.ema200 || 0,
                        },
                        lastCandle: {
                            close: currentPrice,
                            timestamp: ((_b = data1h[data1h.length - 1]) === null || _b === void 0 ? void 0 : _b.timestamp) || Date.now(),
                        },
                        mtfBias: {
                            daily: dailyBias,
                            "4h": trend4h,
                            "1h": this.determineBias(data1h, ind1h),
                        },
                        timestamp: Date.now(),
                    }];
            });
        });
    };
    /**
     * Detect 1H breakout: close breaks above/below 20-bar high/low
     * Only fires in the direction of 4H trend
     */
    BalancedBreakoutStrategy.prototype.detectBreakout = function (data1h, trend4h) {
        if (data1h.length < 21)
            return null;
        var currentCandle = data1h[data1h.length - 1];
        var lookback = data1h.slice(-21, -1); // Previous 20 bars (excluding current)
        var high20 = Math.max.apply(Math, lookback.map(function (c) { return c.high; }));
        var low20 = Math.min.apply(Math, lookback.map(function (c) { return c.low; }));
        // LONG breakout: 1H close above 20-bar high, aligned with 4H bullish
        if (trend4h === "LONG" && currentCandle.close > high20) {
            console.log("[BALANCED] Breakout LONG: Close ".concat(currentCandle.close.toFixed(2), " > 20-bar high ").concat(high20.toFixed(2)));
            return "LONG";
        }
        // SHORT breakout: 1H close below 20-bar low, aligned with 4H bearish
        if (trend4h === "SHORT" && currentCandle.close < low20) {
            console.log("[BALANCED] Breakout SHORT: Close ".concat(currentCandle.close.toFixed(2), " < 20-bar low ").concat(low20.toFixed(2)));
            return "SHORT";
        }
        return null;
    };
    BalancedBreakoutStrategy.prototype.determineBias = function (candles, indicators) {
        if (!candles.length)
            return "NEUTRAL";
        var close = candles[candles.length - 1].close;
        var ema20 = indicators.ema20 || 0;
        var ema50 = indicators.ema50 || 0;
        var rsi = indicators.rsi || 50;
        if (close > ema20 && ema20 > ema50 && rsi > 50)
            return "LONG";
        if (close < ema20 && ema20 < ema50 && rsi < 50)
            return "SHORT";
        return "NEUTRAL";
    };
    BalancedBreakoutStrategy.prototype.computeIndicators = function (candles, label) {
        if (!candles.length || candles.length < 14) {
            return {};
        }
        // RENAMED from calculateIndicators to FORCE recompile - using calculateAllIndicators
        return indicators_1.TechnicalAnalysis.calculateAllIndicators(candles);
    };
    BalancedBreakoutStrategy.prototype.noTradeSignal = function (price, data1h, ind1h, reason, blockedBy) {
        var _a;
        if (blockedBy === void 0) { blockedBy = []; }
        // Derive blockedBy from reason if not explicitly provided
        var gates = blockedBy.length > 0 ? blockedBy : [this.reasonToGateKey(reason)];
        console.log("[BALANCED] NO_TRADE blockedBy=[".concat(gates.join(","), "] reason=").concat(reason));
        return {
            type: "NO_TRADE",
            direction: "NONE",
            alertLevel: 0,
            confidence: 0,
            strategyMode: "BALANCED",
            strategy: "BALANCED_BREAKOUT",
            structuralTier: "NO_TRADE",
            blockedBy: gates,
            lastCandle: {
                close: price,
                timestamp: ((_a = data1h[data1h.length - 1]) === null || _a === void 0 ? void 0 : _a.timestamp) || Date.now(),
            },
            reasons: [reason],
            timestamp: Date.now(),
            indicators: {
                adx: ind1h.adx || 0,
                atr: ind1h.atr || 0,
                rsi: ind1h.rsi || 50,
                stochRSI: ind1h.stochRSI || 50,
                vwap: ind1h.vwap || 0,
                ema20: ind1h.ema20 || 0,
                ema50: ind1h.ema50 || 0,
                ema200: ind1h.ema200 || 0,
            },
        };
    };
    BalancedBreakoutStrategy.prototype.reasonToGateKey = function (reason) {
        if (reason.includes("4H trend neutral"))
            return "4h_trend";
        if (reason.includes("breakout"))
            return "1h_breakout";
        if (reason.includes("ADX"))
            return "adx_filter";
        if (reason.includes("ATR"))
            return "atr_filter";
        if (reason.includes("VWAP"))
            return "vwap_confirmation";
        return "unknown";
    };
    return BalancedBreakoutStrategy;
}());
exports.BalancedBreakoutStrategy = BalancedBreakoutStrategy;
