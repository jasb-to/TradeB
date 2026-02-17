"use strict";
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
exports.TechnicalAnalysis = void 0;
var TechnicalAnalysis = /** @class */ (function () {
    function TechnicalAnalysis() {
    }
    TechnicalAnalysis.calculateATR = function (candles, period) {
        var _a, _b, _c, _d, _e, _f;
        if (period === void 0) { period = 14; }
        if (candles.length < period + 1)
            return 0;
        var trueRanges = [];
        for (var i = 1; i < candles.length; i++) {
            var high = (_b = (_a = candles[i]) === null || _a === void 0 ? void 0 : _a.high) !== null && _b !== void 0 ? _b : 0;
            var low = (_d = (_c = candles[i]) === null || _c === void 0 ? void 0 : _c.low) !== null && _d !== void 0 ? _d : 0;
            var prevClose = (_f = (_e = candles[i - 1]) === null || _e === void 0 ? void 0 : _e.close) !== null && _f !== void 0 ? _f : 0;
            var tr = Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose));
            trueRanges.push(tr);
        }
        return this.calculateEMA(trueRanges, period);
    };
    TechnicalAnalysis.calculateADX = function (candles, period) {
        if (period === void 0) { period = 14; }
        if (candles.length < period * 2 + period)
            return 25; // Default to mid-range if not enough data
        var plusDM = [];
        var minusDM = [];
        var tr = [];
        // Calculate +DM, -DM, and TR for each period
        for (var i = 1; i < candles.length; i++) {
            var highDiff = candles[i].high - candles[i - 1].high;
            var lowDiff = candles[i - 1].low - candles[i].low;
            plusDM.push(highDiff > lowDiff && highDiff > 0 ? highDiff : 0);
            minusDM.push(lowDiff > highDiff && lowDiff > 0 ? lowDiff : 0);
            var prevClose = candles[i - 1].close;
            tr.push(Math.max(candles[i].high - candles[i].low, Math.abs(candles[i].high - prevClose), Math.abs(candles[i].low - prevClose)));
        }
        // Calculate smoothed TR, +DM, -DM using Wilder's smoothing
        var smoothedTR = tr.slice(0, period).reduce(function (a, b) { return a + b; }, 0);
        var smoothedPlusDM = plusDM.slice(0, period).reduce(function (a, b) { return a + b; }, 0);
        var smoothedMinusDM = minusDM.slice(0, period).reduce(function (a, b) { return a + b; }, 0);
        var dxValues = [];
        for (var i = period; i < tr.length; i++) {
            // Wilder's smoothing: smoothed = prev - (prev/period) + current
            smoothedTR = smoothedTR - smoothedTR / period + tr[i];
            smoothedPlusDM = smoothedPlusDM - smoothedPlusDM / period + plusDM[i];
            smoothedMinusDM = smoothedMinusDM - smoothedMinusDM / period + minusDM[i];
            // Calculate +DI and -DI
            var plusDI = smoothedTR > 0 ? (smoothedPlusDM / smoothedTR) * 100 : 0;
            var minusDI = smoothedTR > 0 ? (smoothedMinusDM / smoothedTR) * 100 : 0;
            // Calculate DX
            var diSum = plusDI + minusDI;
            var dx = diSum > 0 ? (Math.abs(plusDI - minusDI) / diSum) * 100 : 0;
            dxValues.push(dx);
        }
        // Calculate ADX as smoothed average of DX values
        if (dxValues.length < period) {
            return dxValues.length > 0 ? dxValues.reduce(function (a, b) { return a + b; }, 0) / dxValues.length : 25;
        }
        // First ADX is simple average of first 'period' DX values
        var adx = dxValues.slice(0, period).reduce(function (a, b) { return a + b; }, 0) / period;
        // Smooth the rest using Wilder's method
        for (var i = period; i < dxValues.length; i++) {
            adx = (adx * (period - 1) + dxValues[i]) / period;
        }
        return adx;
    };
    TechnicalAnalysis.calculateVWAP = function (candles, anchorTime) {
        if (!candles || candles.length === 0) {
            return { value: 0, bias: "FLAT" };
        }
        var cumVolume = 0;
        var cumTypicalPriceVolume = 0;
        for (var _i = 0, candles_1 = candles; _i < candles_1.length; _i++) {
            var candle = candles_1[_i];
            var typicalPrice = (candle.high + candle.low + candle.close) / 3;
            var volume = candle.volume || 1; // Fallback for APIs without volume
            cumTypicalPriceVolume += typicalPrice * volume;
            cumVolume += volume;
        }
        var vwap = cumVolume > 0 ? cumTypicalPriceVolume / cumVolume : 0;
        if (vwap === 0) {
            return { value: 0, bias: "FLAT" };
        }
        // Get current price (latest close)
        var currentPrice = candles[candles.length - 1].close;
        // Determine bias
        var bias = "FLAT";
        if (currentPrice > vwap * 1.001) {
            bias = "BULLISH";
        }
        else if (currentPrice < vwap * 0.999) {
            bias = "BEARISH";
        }
        return { value: vwap, bias: bias };
    };
    TechnicalAnalysis.calculateEMA = function (values, period) {
        if (values.length < period)
            return 0;
        var multiplier = 2 / (period + 1);
        var ema = values.slice(0, period).reduce(function (a, b) { return a + b; }, 0) / period;
        for (var i = period; i < values.length; i++) {
            ema = (values[i] - ema) * multiplier + ema;
        }
        return ema;
    };
    TechnicalAnalysis.calculateSMA = function (values, period) {
        if (values.length < period)
            return 0;
        var slice = values.slice(-period);
        return slice.reduce(function (a, b) { return a + b; }, 0) / period;
    };
    TechnicalAnalysis.calculateRSI = function (candles, period) {
        if (period === void 0) { period = 14; }
        if (candles.length < period + 1)
            return 50;
        var changes = [];
        for (var i = 1; i < candles.length; i++) {
            changes.push(candles[i].close - candles[i - 1].close);
        }
        var gains = changes.map(function (c) { return (c > 0 ? c : 0); });
        var losses = changes.map(function (c) { return (c < 0 ? Math.abs(c) : 0); });
        var avgGain = this.calculateSMA(gains.slice(-period), period);
        var avgLoss = this.calculateSMA(losses.slice(-period), period);
        if (avgLoss === 0)
            return 100;
        var rs = avgGain / avgLoss;
        return 100 - 100 / (1 + rs);
    };
    // Stoch RSI is NOT an entry gate. Informational only.
    TechnicalAnalysis.calculateStochasticRSI = function (candles, rsiPeriod, stochPeriod) {
        if (rsiPeriod === void 0) { rsiPeriod = 14; }
        if (stochPeriod === void 0) { stochPeriod = 5; }
        // STRICT: Never use 50 as fallback. Return null when insufficient data.
        if (!candles || candles.length < rsiPeriod + stochPeriod) {
            console.log("[v0] STOCH RSI STATE: CALCULATING | VALUE: null (insufficient candles: ".concat((candles === null || candles === void 0 ? void 0 : candles.length) || 0, " < ").concat(rsiPeriod + stochPeriod, ")"));
            return { value: null, state: "CALCULATING" };
        }
        // Calculate RSI for each candle over the lookback period
        var rsiValues = [];
        for (var i = rsiPeriod; i < candles.length; i++) {
            var slice = candles.slice(i - rsiPeriod, i + 1);
            rsiValues.push(this.calculateRSI(slice, rsiPeriod));
        }
        if (rsiValues.length === 0) {
            console.log("[v0] STOCH RSI STATE: CALCULATING | VALUE: null (no RSI values computed)");
            return { value: null, state: "CALCULATING" };
        }
        // ADAPTIVE SMOOTHING: Use larger stoch period for small datasets
        // This prevents false extremes when recent RSI values are all at one end
        // For 200+ candles: use stochPeriod=5 (default)
        // For 150-199 candles: use stochPeriod=7 for better smoothing
        // For <150 candles: use stochPeriod=min(8, candles.length/20)
        var adaptiveStochPeriod = (function () {
            if (rsiValues.length >= 200)
                return Math.min(stochPeriod, 5);
            if (rsiValues.length >= 150)
                return Math.min(stochPeriod, 7);
            if (rsiValues.length >= 100)
                return Math.min(stochPeriod, 8);
            return Math.max(3, Math.floor(rsiValues.length / 20));
        })();
        // Calculate Stochastic of RSI using adaptive period
        var recentRSI = rsiValues.slice(-adaptiveStochPeriod);
        var minRSI = Math.min.apply(Math, recentRSI);
        var maxRSI = Math.max.apply(Math, recentRSI);
        var currentRSI = rsiValues[rsiValues.length - 1];
        // If range is zero, return COMPRESSION with the current RSI value
        // (not fake 50, which could mislead analysis)
        if (maxRSI === minRSI) {
            console.log("[v0] STOCH RSI STATE: COMPRESSION | VALUE: ".concat(currentRSI.toFixed(1), " (flat RSI range over last ").concat(adaptiveStochPeriod, " candles)"));
            return { value: currentRSI, state: "COMPRESSION" };
        }
        var stochValue = ((currentRSI - minRSI) / (maxRSI - minRSI)) * 100;
        // State rules: value > 60 = MOMENTUM_UP, value < 40 = MOMENTUM_DOWN, 40-60 = COMPRESSION
        var state = "COMPRESSION";
        if (stochValue > 60) {
            state = "MOMENTUM_UP";
        }
        else if (stochValue < 40) {
            state = "MOMENTUM_DOWN";
        }
        console.log("[v0] STOCH RSI STATE: ".concat(state, " | VALUE: ").concat(stochValue.toFixed(1), " (adaptive period=").concat(adaptiveStochPeriod, ", RSI values=").concat(rsiValues.length, ")"));
        return { value: stochValue, state: state };
    };
    TechnicalAnalysis.calculateBollingerBands = function (candles, period, stdDev) {
        if (period === void 0) { period = 20; }
        if (stdDev === void 0) { stdDev = 2; }
        var closes = candles.map(function (c) { return c.close; });
        var sma = this.calculateSMA(closes, period);
        var slice = closes.slice(-period);
        var variance = slice.reduce(function (sum, val) { return sum + Math.pow(val - sma, 2); }, 0) / period;
        var std = Math.sqrt(variance);
        return {
            upper: sma + std * stdDev,
            middle: sma,
            lower: sma - std * stdDev,
        };
    };
    TechnicalAnalysis.calculateChandelierExit = function (candles, period, multiplier) {
        if (period === void 0) { period = 22; }
        if (multiplier === void 0) { multiplier = 3; }
        if (candles.length < period)
            return { long: 0, short: 0 };
        var recentCandles = candles.slice(-period);
        var highest = Math.max.apply(Math, recentCandles.map(function (c) { return c.high; }));
        var lowest = Math.min.apply(Math, recentCandles.map(function (c) { return c.low; }));
        var atr = this.calculateATR(candles, period);
        // Chandelier Exit (Long) = Highest High - (ATR × Multiplier)
        // Chandelier Exit (Short) = Lowest Low + (ATR × Multiplier)
        return {
            long: highest - atr * multiplier,
            short: lowest + atr * multiplier,
        };
    };
    TechnicalAnalysis.calculateFibonacciLevels = function (candles, lookback) {
        if (lookback === void 0) { lookback = 50; }
        var recentCandles = candles.slice(-lookback);
        var high = Math.max.apply(Math, recentCandles.map(function (c) { return c.high; }));
        var low = Math.min.apply(Math, recentCandles.map(function (c) { return c.low; }));
        var range = high - low;
        return {
            high: high,
            low: low,
            fib236: high - range * 0.236,
            fib382: high - range * 0.382,
            fib500: high - range * 0.5,
            fib618: high - range * 0.618,
            fib786: high - range * 0.786,
        };
    };
    TechnicalAnalysis.findSupportResistance = function (candles, tolerance) {
        if (tolerance === void 0) { tolerance = 0.002; }
        var pivots = [];
        // Find pivot points (local highs and lows)
        for (var i = 2; i < candles.length - 2; i++) {
            var isHigh = candles[i].high > candles[i - 1].high &&
                candles[i].high > candles[i - 2].high &&
                candles[i].high > candles[i + 1].high &&
                candles[i].high > candles[i + 2].high;
            var isLow = candles[i].low < candles[i - 1].low &&
                candles[i].low < candles[i - 2].low &&
                candles[i].low < candles[i + 1].low &&
                candles[i].low < candles[i + 2].low;
            if (isHigh)
                pivots.push(candles[i].high);
            if (isLow)
                pivots.push(candles[i].low);
        }
        // Cluster pivots within tolerance
        var clustered = [];
        pivots.sort(function (a, b) { return a - b; });
        var _loop_1 = function (pivot) {
            var existing = clustered.find(function (c) { return Math.abs(c - pivot) / pivot < tolerance; });
            if (!existing) {
                clustered.push(pivot);
            }
        };
        for (var _i = 0, pivots_1 = pivots; _i < pivots_1.length; _i++) {
            var pivot = pivots_1[_i];
            _loop_1(pivot);
        }
        var currentPrice = candles[candles.length - 1].close;
        var resistance = clustered.filter(function (p) { return p > currentPrice; }).slice(0, 3);
        var support = clustered.filter(function (p) { return p < currentPrice; }).slice(-3);
        return { resistance: resistance, support: support };
    };
    TechnicalAnalysis.detectBias = function (candles) {
        if (candles.length < 50)
            return "RANGING";
        var closes = candles.map(function (c) { return c.close; });
        var currentPrice = closes[closes.length - 1];
        var ema20 = this.calculateEMA(closes, 20);
        var ema50 = this.calculateEMA(closes, 50);
        var ema200 = this.calculateEMA(closes, 200);
        var rsi = this.calculateRSI(candles);
        var adx = this.calculateADX(candles);
        var macd = this.calculateMACD(candles);
        var stochRSI = this.calculateStochasticRSI(candles);
        // Score-based bias determination
        var bullishScore = 0;
        var bearishScore = 0;
        // 1. Price vs EMAs (0-3 points)
        if (currentPrice > ema20 && ema20 > ema50 && ema50 > ema200)
            bullishScore += 3;
        else if (currentPrice > ema20 && currentPrice > ema50)
            bullishScore += 2;
        else if (currentPrice > ema20)
            bullishScore += 1;
        if (currentPrice < ema20 && ema20 < ema50 && ema50 < ema200)
            bearishScore += 3;
        else if (currentPrice < ema20 && currentPrice < ema50)
            bearishScore += 2;
        else if (currentPrice < ema20)
            bearishScore += 1;
        // 2. RSI (0-2 points)
        if (rsi > 60)
            bullishScore += 2;
        else if (rsi > 50)
            bullishScore += 1;
        if (rsi < 40)
            bearishScore += 2;
        else if (rsi < 50)
            bearishScore += 1;
        // 3. MACD (0-2 points)
        if (macd.macd > macd.signal && macd.histogram > 0)
            bullishScore += 2;
        else if (macd.macd > macd.signal)
            bullishScore += 1;
        if (macd.macd < macd.signal && macd.histogram < 0)
            bearishScore += 2;
        else if (macd.macd < macd.signal)
            bearishScore += 1;
        // 4. StochRSI State (0-2 points) - INFORMATIONAL ONLY, not entry gate
        // Use the calculated STATE from calculateStochasticRSI, not raw thresholds
        // MOMENTUM_UP (>60) = bullish confirmation
        // MOMENTUM_DOWN (<40) = bearish confirmation
        // COMPRESSION (40-60) = neutral confirmation (no bias)
        var stochRSIState = stochRSI.state;
        if (stochRSIState === "MOMENTUM_UP")
            bullishScore += 2;
        if (stochRSIState === "MOMENTUM_DOWN")
            bearishScore += 2;
        // COMPRESSION adds no bias (already neutral)
        // 5. ADX (0-2 points for trend strength confirmation)
        if (adx >= 23) {
            if (bullishScore > bearishScore)
                bullishScore += 2;
            if (bearishScore > bullishScore)
                bearishScore += 2;
        }
        // Determine bias based on weighted scores
        var bullishThreshold = 6;
        var bearishThreshold = 6;
        if (bullishScore >= bullishThreshold && bullishScore > bearishScore)
            return "BULLISH";
        if (bearishScore >= bearishThreshold && bearishScore > bullishScore)
            return "BEARISH";
        return "RANGING";
    };
    /**
     * Calculate Chandelier Stop (volatility-adjusted trailing stop)
     * For LONG: Stop = Highest High over period - (ATR × multiple)
     * For SHORT: Stop = Lowest Low over period + (ATR × multiple)
     */
    TechnicalAnalysis.calculateChandelierStop = function (candles, period, atrMultiple) {
        var _a, _b, _c, _d, _e, _f;
        if (period === void 0) { period = 22; }
        if (atrMultiple === void 0) { atrMultiple = 3; }
        if (candles.length < period) {
            var lastClose = (_b = (_a = candles[candles.length - 1]) === null || _a === void 0 ? void 0 : _a.close) !== null && _b !== void 0 ? _b : 0;
            return { long: lastClose, short: lastClose };
        }
        var recentCandles = candles.slice(-period);
        var atr = this.calculateATR(candles, 14);
        // Find highest high and lowest low over the period
        var highestHigh = (_d = (_c = recentCandles[0]) === null || _c === void 0 ? void 0 : _c.high) !== null && _d !== void 0 ? _d : 0;
        var lowestLow = (_f = (_e = recentCandles[0]) === null || _e === void 0 ? void 0 : _e.low) !== null && _f !== void 0 ? _f : 0;
        for (var _i = 0, recentCandles_1 = recentCandles; _i < recentCandles_1.length; _i++) {
            var candle = recentCandles_1[_i];
            highestHigh = Math.max(highestHigh, candle.high);
            lowestLow = Math.min(lowestLow, candle.low);
        }
        // Chandelier Stop = Highest High - (ATR × multiple) for LONG
        // Chandelier Stop = Lowest Low + (ATR × multiple) for SHORT
        var chandelierLong = highestHigh - atr * atrMultiple;
        var chandelierShort = lowestLow + atr * atrMultiple;
        return {
            long: chandelierLong,
            short: chandelierShort,
        };
    };
    TechnicalAnalysis.calculateAllIndicators = function (candles, config) {
        var _a;
        if (!candles || candles.length < 50) {
            console.log("[v0] Insufficient candles for indicator calculation: ".concat((candles === null || candles === void 0 ? void 0 : candles.length) || 0));
            return this.getDefaultIndicators();
        }
        try {
            var symbol = (config === null || config === void 0 ? void 0 : config.symbol) || "XAU_USD";
            var validCandles = this.filterValidOHLC(candles, symbol);
            if (validCandles.length < 50) {
                console.log("[v0] Too many invalid candles, only ".concat(validCandles.length, " valid out of ").concat(candles.length));
                return this.getDefaultIndicators();
            }
            var closes = validCandles.map(function (c) { return c.close; });
            var atr = this.calculateATR(validCandles) || 0;
            var adx = this.calculateADX(validCandles) || 20;
            var vwapResult = this.calculateVWAP(validCandles);
            var ema20 = this.calculateEMA(closes, 20) || 0;
            var ema50 = this.calculateEMA(closes, 50) || 0;
            var ema200 = this.calculateEMA(closes, 200) || 0;
            var rsi = this.calculateRSI(validCandles) || 50;
            var stochRSIResult = this.calculateStochasticRSI(validCandles);
            var macd = this.calculateMACD(validCandles);
            // Ensure all numeric values are within realistic bounds
            return {
                atr: Math.max(0, atr),
                adx: Math.max(0, Math.min(100, adx)),
                vwap: vwapResult.value > 0 ? vwapResult.value : 0,
                ema20: ema20 > 0 ? ema20 : 0,
                ema50: ema50 > 0 ? ema50 : 0,
                ema200: ema200 > 0 ? ema200 : 0,
                rsi: Math.max(0, Math.min(100, rsi)),
                stochRSI: stochRSIResult && typeof stochRSIResult === "object" ? {
                    value: Math.max(0, Math.min(100, (_a = stochRSIResult.value) !== null && _a !== void 0 ? _a : 50)),
                    state: stochRSIResult.state || "CALCULATING"
                } : { value: 50, state: "CALCULATING" },
                bollingerUpper: 0,
                bollingerLower: 0,
                chandelierStop: { long: 0, short: 0 },
                macd: macd,
            };
        }
        catch (error) {
            console.error("[v0] Error in calculateAllIndicators:", error);
            return this.getDefaultIndicators();
        }
    };
    TechnicalAnalysis.filterValidOHLC = function (candles, symbol) {
        if (symbol === void 0) { symbol = "XAU_USD"; }
        // Dynamic price range based on actual candle data
        // Get realistic price range from the candles themselves
        if (!candles || candles.length === 0)
            return [];
        // Calculate price range from the actual data
        var allPrices = candles.flatMap(function (candle) { return [candle.open, candle.high, candle.low, candle.close]; });
        var minPrice = Math.min.apply(Math, allPrices);
        var maxPrice = Math.max.apply(Math, allPrices);
        // Add safety margins (10% below min, 10% above max) to handle outliers
        var safetyMargin = (maxPrice - minPrice) * 0.1;
        var dynamicMinPrice = Math.max(0, minPrice - safetyMargin);
        var dynamicMaxPrice = maxPrice + safetyMargin;
        return candles.filter(function (candle) {
            // Reject candles with invalid OHLC values
            if (candle.open <= 0 || candle.high <= 0 || candle.low <= 0 || candle.close <= 0) {
                return false;
            }
            // Reject candles with null/undefined/NaN values
            if (candle.open == null ||
                candle.high == null ||
                candle.low == null ||
                candle.close == null ||
                isNaN(candle.open) ||
                isNaN(candle.high) ||
                isNaN(candle.low) ||
                isNaN(candle.close)) {
                return false;
            }
            // Reject candles with impossible OHLC relationships
            if (candle.high < candle.low ||
                candle.close > candle.high ||
                candle.close < candle.low ||
                candle.open > candle.high ||
                candle.open < candle.low) {
                return false;
            }
            // Dynamic price range validation based on actual data
            var avgPrice = (candle.open + candle.high + candle.low + candle.close) / 4;
            if (avgPrice < dynamicMinPrice || avgPrice > dynamicMaxPrice) {
                return false;
            }
            return true;
        });
    };
    TechnicalAnalysis.validateCandles = function (candles, currentPrice) {
        // Ignore currentPrice parameter - it was causing all historical data to be rejected
        return this.filterValidOHLC(candles);
    };
    TechnicalAnalysis.calculateMACD = function (candles, fastPeriod, slowPeriod, signalPeriod) {
        if (fastPeriod === void 0) { fastPeriod = 12; }
        if (slowPeriod === void 0) { slowPeriod = 26; }
        if (signalPeriod === void 0) { signalPeriod = 9; }
        if (candles.length < slowPeriod + signalPeriod) {
            return { macd: 0, signal: 0, histogram: 0 };
        }
        var closes = candles.map(function (c) { return c.close; });
        var fastEMA = this.calculateEMA(closes, fastPeriod);
        var slowEMA = this.calculateEMA(closes, slowPeriod);
        var macd = fastEMA - slowEMA;
        // Calculate signal line (EMA of MACD)
        var macdValues = [];
        for (var i = slowPeriod; i < closes.length; i++) {
            var slice = closes.slice(0, i + 1);
            var fast = this.calculateEMA(slice, fastPeriod);
            var slow = this.calculateEMA(slice, slowPeriod);
            macdValues.push(fast - slow);
        }
        var signal = this.calculateEMA(macdValues, signalPeriod);
        var histogram = macd - signal;
        return { macd: macd, signal: signal, histogram: histogram };
    };
    TechnicalAnalysis.detectDivergence = function (candles, lookback) {
        if (lookback === void 0) { lookback = 20; }
        if (candles.length < lookback) {
            return { bullish: false, bearish: false, strength: 0 };
        }
        var recentCandles = candles.slice(-lookback);
        var rsiValues = [];
        for (var i = 14; i < recentCandles.length; i++) {
            rsiValues.push(this.calculateRSI(recentCandles.slice(0, i + 1), 14));
        }
        // Find local lows/highs in price and RSI
        var priceLows = [];
        var priceHighs = [];
        var rsiLows = [];
        var rsiHighs = [];
        for (var i = 2; i < recentCandles.length - 2; i++) {
            // Local low
            if (recentCandles[i].low < recentCandles[i - 1].low &&
                recentCandles[i].low < recentCandles[i - 2].low &&
                recentCandles[i].low < recentCandles[i + 1].low &&
                recentCandles[i].low < recentCandles[i + 2].low) {
                priceLows.push({ index: i, value: recentCandles[i].low });
                if (i >= 14) {
                    rsiLows.push({ index: i, value: rsiValues[i - 14] });
                }
            }
            // Local high
            if (recentCandles[i].high > recentCandles[i - 1].high &&
                recentCandles[i].high > recentCandles[i - 2].high &&
                recentCandles[i].high > recentCandles[i + 1].high &&
                recentCandles[i].high > recentCandles[i + 2].high) {
                priceHighs.push({ index: i, value: recentCandles[i].high });
                if (i >= 14) {
                    rsiHighs.push({ index: i, value: rsiValues[i - 14] });
                }
            }
        }
        // Bullish divergence: Price makes lower low, RSI makes higher low
        var bullish = false;
        if (priceLows.length >= 2 && rsiLows.length >= 2) {
            var lastPriceLow = priceLows[priceLows.length - 1];
            var prevPriceLow = priceLows[priceLows.length - 2];
            var lastRSILow = rsiLows[rsiLows.length - 1];
            var prevRSILow = rsiLows[rsiLows.length - 2];
            if (lastPriceLow.value < prevPriceLow.value && lastRSILow.value > prevRSILow.value) {
                bullish = true;
            }
        }
        // Bearish divergence: Price makes higher high, RSI makes lower high
        var bearish = false;
        if (priceHighs.length >= 2 && rsiHighs.length >= 2) {
            var lastPriceHigh = priceHighs[priceHighs.length - 1];
            var prevPriceHigh = priceHighs[priceHighs.length - 2];
            var lastRSIHigh = rsiHighs[rsiHighs.length - 1];
            var prevRSIHigh = rsiHighs[rsiHighs.length - 2];
            if (lastPriceHigh.value > prevPriceHigh.value && lastRSIHigh.value < prevRSIHigh.value) {
                bearish = true;
            }
        }
        var strength = bullish || bearish ? 75 : 0;
        return { bullish: bullish, bearish: bearish, strength: strength };
    };
    TechnicalAnalysis.detectVolumeSpike = function (candles, threshold) {
        if (threshold === void 0) { threshold = 1.5; }
        if (candles.length < 20)
            return false;
        var recentVolumes = candles.slice(-20).map(function (c) { return c.volume || 1; });
        var avgVolume = recentVolumes.slice(0, -1).reduce(function (a, b) { return a + b; }, 0) / (recentVolumes.length - 1);
        var currentVolume = recentVolumes[recentVolumes.length - 1];
        return currentVolume > avgVolume * threshold;
    };
    TechnicalAnalysis.getDefaultIndicators = function () {
        return {
            atr: 0,
            adx: 0,
            vwap: 0,
            ema20: 0,
            ema50: 0,
            ema200: 0,
            rsi: 50,
            stochRSI: 50,
            bollingerUpper: 0,
            bollingerLower: 0,
            chandelierStop: { long: 0, short: 0 },
            fibonacciLevels: {
                high: 0,
                low: 0,
                fib236: 0,
                fib382: 0,
                fib500: 0,
                fib618: 0,
                fib786: 0,
            },
            supportResistance: {
                resistance: [],
                support: [],
            },
            marketBias: "RANGING",
            macd: { macd: 0, signal: 0, histogram: 0 },
            divergence: { bullish: false, bearish: false, strength: 0 },
            volumeSpike: false,
        };
    };
    TechnicalAnalysis.smoothedAverage = function (values, period) {
        if (values.length < period)
            return 0;
        var sum = values.slice(0, period).reduce(function (a, b) { return a + b; }, 0);
        var smoothed = sum / period;
        for (var i = period; i < values.length; i++) {
            smoothed = (smoothed * (period - 1) + values[i]) / period;
        }
        return smoothed;
    };
    TechnicalAnalysis.calculate = function (candles) {
        return __awaiter(this, void 0, void 0, function () {
            var adx, atr, rsi, stochRSI, ema20, ema50, ema200, vwap, macd;
            return __generator(this, function (_a) {
                if (!candles || candles.length === 0) {
                    return [2 /*return*/, {
                            adx: 20,
                            atr: 0,
                            rsi: 50,
                            stochRSI: 50,
                            ema20: 0,
                            ema50: 0,
                            ema200: 0,
                            vwap: 0,
                            bollingerUpper: 0,
                            bollingerLower: 0,
                            chandelierStop: { long: 0, short: 0 },
                            macd: { macd: 0, signal: 0, histogram: 0 },
                        }];
                }
                adx = this.calculateADX(candles, 14);
                atr = this.calculateATR(candles, 14);
                rsi = this.calculateRSI(candles, 14);
                stochRSI = this.calculateStochasticRSI(candles, 14, 5);
                ema20 = this.calculateEMA(candles.map(function (c) { return c.close; }), 20);
                ema50 = this.calculateEMA(candles.map(function (c) { return c.close; }), 50);
                ema200 = this.calculateEMA(candles.map(function (c) { return c.close; }), 200);
                vwap = this.calculateVWAP(candles).value;
                macd = this.calculateMACD(candles);
                return [2 /*return*/, {
                        adx: adx,
                        atr: atr,
                        rsi: rsi,
                        stochRSI: stochRSI,
                        ema20: ema20,
                        ema50: ema50,
                        ema200: ema200,
                        vwap: vwap,
                        bollingerUpper: 0,
                        bollingerLower: 0,
                        chandelierStop: { long: 0, short: 0 },
                        macd: macd,
                    }];
            });
        });
    };
    return TechnicalAnalysis;
}());
exports.TechnicalAnalysis = TechnicalAnalysis;
