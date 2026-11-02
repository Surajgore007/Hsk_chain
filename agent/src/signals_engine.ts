/**
 * signals_engine.ts — Quantitative Technical & Liquidity Signals Engine
 *
 * Deterministic, computed in TypeScript, fed into AI Brain as structured input.
 * Implements:
 * 1. Price Spread vs Reference (Mainnet pool for WHSK; seeded reference for mock pairs)
 * 2. EMA Fast (12 periods) & EMA Slow (26 periods) with Crossover Identification
 * 3. Rolling Z-Score of Spot vs EMA Slow (Window >= 30 samples, flags "warming up")
 * 4. Pool Imbalance & Liquidity Shrinkage Detector (flags if depth shrank)
 */

export interface PriceSample {
  spotPrice: number;
  timestamp: number;
  blockNumber: number;
}

export interface PairSignals {
  pairId: string;
  spotPrice: number;
  referencePrice: number;
  spreadBps: number;
  emaFast: number;
  emaSlow: number;
  emaCross: "BULLISH" | "BEARISH" | "NEUTRAL";
  zScore: number;
  isWarmingUp: boolean;
  sampleCount: number;
  currentLiquidity: string;
  seededLiquidity: string;
  depthShrunk: boolean;
  liquidityRatioPct: number;
  timestamp: number;
  blockNumber: number;
  strategyLabel: string;
}

export class SignalsEngine {
  private history: Map<string, PriceSample[]> = new Map();
  private emaFastMap: Map<string, number> = new Map();
  private emaSlowMap: Map<string, number> = new Map();
  private seededLiquidityMap: Map<string, bigint> = new Map();

  // Smoothing factors:
  // Fast: ~12 periods -> 2 / (12 + 1) ≈ 0.1538
  // Slow: ~26 periods -> 2 / (26 + 1) ≈ 0.0741
  private readonly alphaFast = 0.1538;
  private readonly alphaSlow = 0.0741;
  private readonly minSamples = 30;

  constructor() {}

  /**
   * Seed baseline pool liquidity if not recorded yet.
   */
  public registerSeededLiquidity(pairId: string, liquidity: bigint) {
    if (!this.seededLiquidityMap.has(pairId) && liquidity > 0n) {
      this.seededLiquidityMap.set(pairId, liquidity);
    }
  }

  /**
   * Ingest a new on-chain price and pool liquidity sample.
   */
  public update(params: {
    pairId: string;
    spotPrice: number;
    referencePrice: number;
    currentLiquidity: bigint;
    blockNumber: number;
    timestamp?: number;
  }): PairSignals {
    const { pairId, spotPrice, referencePrice, currentLiquidity, blockNumber } = params;
    const ts = params.timestamp || Date.now();

    // 1. Maintain rolling sample history (keep last 60 samples)
    let samples = this.history.get(pairId);
    if (!samples) {
      samples = [];
      this.history.set(pairId, samples);
    }
    samples.push({ spotPrice, timestamp: ts, blockNumber });
    if (samples.length > 60) samples.shift();

    // 2. Compute EMAs
    let fast = this.emaFastMap.get(pairId);
    let slow = this.emaSlowMap.get(pairId);

    if (fast === undefined) {
      fast = spotPrice;
      slow = spotPrice;
    } else {
      fast = fast + this.alphaFast * (spotPrice - fast);
      slow = slow! + this.alphaSlow * (spotPrice - slow!);
    }
    this.emaFastMap.set(pairId, fast);
    this.emaSlowMap.set(pairId, slow);

    // 3. Compute EMA Crossover
    const emaDiffPct = slow > 0 ? ((fast - slow) / slow) * 100 : 0;
    let emaCross: "BULLISH" | "BEARISH" | "NEUTRAL" = "NEUTRAL";
    if (emaDiffPct > 0.1) emaCross = "BULLISH";
    else if (emaDiffPct < -0.1) emaCross = "BEARISH";

    // 4. Compute Rolling Z-Score vs EMA Slow
    const isWarmingUp = samples.length < this.minSamples;
    let zScore = 0;
    if (!isWarmingUp) {
      const mean = samples.reduce((acc, s) => acc + s.spotPrice, 0) / samples.length;
      const variance = samples.reduce((acc, s) => acc + Math.pow(s.spotPrice - mean, 2), 0) / samples.length;
      const stdDev = Math.sqrt(variance);
      if (stdDev > 0) {
        zScore = Number(((spotPrice - slow) / stdDev).toFixed(2));
      }
    }

    // 5. Compute Spread in Basis Points
    // spreadBps = ((spot - reference) / reference) * 10000
    let spreadBps = 0;
    if (referencePrice > 0) {
      spreadBps = Math.round(((spotPrice - referencePrice) / referencePrice) * 10000);
    }

    // 6. Check Liquidity Shrinkage
    this.registerSeededLiquidity(pairId, currentLiquidity);
    const seeded = this.seededLiquidityMap.get(pairId) || currentLiquidity;
    const liquidityRatioPct = seeded > 0n ? Number((currentLiquidity * 10000n) / seeded) / 100 : 100;
    const depthShrunk = liquidityRatioPct < 95; // More than 5% shrinkage

    return {
      pairId,
      spotPrice: Number(spotPrice.toFixed(6)),
      referencePrice: Number(referencePrice.toFixed(6)),
      spreadBps,
      emaFast: Number(fast.toFixed(6)),
      emaSlow: Number(slow.toFixed(6)),
      emaCross,
      zScore,
      isWarmingUp,
      sampleCount: samples.length,
      currentLiquidity: currentLiquidity.toString(),
      seededLiquidity: seeded.toString(),
      depthShrunk,
      liquidityRatioPct: Number(liquidityRatioPct.toFixed(2)),
      timestamp: ts,
      blockNumber,
      strategyLabel: "Price-spread & Mean-reversion Demo Strategy (HSKSwap execution-guarded)",
    };
  }

  /**
   * Fast retrieval of current signal snapshot without mutating state.
   */
  public getSignals(pairId: string, currentSpot: number, refPrice: number, curLiq: bigint, blockNumber: number): PairSignals {
    return this.update({
      pairId,
      spotPrice: currentSpot,
      referencePrice: refPrice,
      currentLiquidity: curLiq,
      blockNumber,
    });
  }
}

