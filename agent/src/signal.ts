/**
 * signal.ts — Deterministic reference-price reversion signal
 *
 * NOT ALPHA. A simple, honest demo strategy for hackathon showcase:
 * Compares testnet pool spot price against HSK mainnet read-only reference price.
 * - If testnet pool is discounted vs mainnet (devBps <= -thresholdBps) -> BUY base
 * - If testnet pool is expensive vs mainnet (devBps >= +thresholdBps) -> SELL base
 * - Otherwise -> HOLD (NO_SIGNAL)
 */

import { deviationBps, updateEma, mulDiv } from "./price.js";
import { APP_CONFIG, RISK_PRESETS, type RiskPreset } from "./config.js";

export type SignalAction = "BUY" | "SELL" | "HOLD";

export interface SignalState {
  emaFast: bigint;
  emaSlow: bigint;
  lastRefUpdate: number;
}

export interface SignalInput {
  spotPrice: bigint;           // token1 / token0 price in raw units (or scaled)
  refPrice: bigint;            // mainnet reference price in same scale
  refTimestamp: number;        // when reference price was recorded
  baseBalance: bigint;         // sellable base balance (for SELL)
  quoteBalance: bigint;        // sellable quote balance (for BUY)
  baseToken: `0x${string}`;
  quoteToken: `0x${string}`;
  riskPreset: RiskPreset;
  state: SignalState;
}

export interface SignalOutput {
  action: SignalAction;
  tokenIn: `0x${string}`;
  tokenOut: `0x${string}`;
  side: "BUY" | "SELL" | "HOLD";
  devBps: bigint;
  thresholdBps: bigint;
  requestedAmountIn: bigint;
  spotPrice: bigint;
  refPrice: bigint;
  emaFast: bigint;
  emaSlow: bigint;
  reason: string;
  isStaleRef: boolean;
}

export function evaluateSignal(input: SignalInput): { output: SignalOutput; nextState: SignalState } {
  const preset = RISK_PRESETS[input.riskPreset];
  const now = Date.now();
  const isStaleRef = now - input.refTimestamp > 60_000; // 60s timeout

  // Update EMAs
  const nextEmaFast = input.state.emaFast === 0n
    ? input.spotPrice
    : updateEma(input.state.emaFast, input.spotPrice, APP_CONFIG.EMA_FAST_ALPHA_BPS);

  const nextEmaSlow = input.state.emaSlow === 0n
    ? input.spotPrice
    : updateEma(input.state.emaSlow, input.spotPrice, APP_CONFIG.EMA_SLOW_ALPHA_BPS);

  const nextState: SignalState = {
    emaFast: nextEmaFast,
    emaSlow: nextEmaSlow,
    lastRefUpdate: input.refTimestamp,
  };

  // If reference price is zero or stale, hold
  if (input.refPrice === 0n || isStaleRef) {
    return {
      output: {
        action: "HOLD",
        tokenIn: input.baseToken,
        tokenOut: input.quoteToken,
        side: "HOLD",
        devBps: 0n,
        thresholdBps: preset.signalThresholdBps,
        requestedAmountIn: 0n,
        spotPrice: input.spotPrice,
        refPrice: input.refPrice,
        emaFast: nextEmaFast,
        emaSlow: nextEmaSlow,
        reason: isStaleRef ? "Mainnet reference price is stale (>60s old)" : "Mainnet reference price unavailable",
        isStaleRef,
      },
      nextState,
    };
  }

  const devBps = deviationBps(input.spotPrice, input.refPrice);
  const threshold = preset.signalThresholdBps;

  // Signal decision
  if (devBps <= -threshold) {
    // Our pool is cheap compared to mainnet: BUY base using quote
    // requested quote = quoteBalance * maxTradePercent / 100
    const requested = mulDiv(input.quoteBalance, preset.maxTradePercent, 100n);
    return {
      output: {
        action: "BUY",
        tokenIn: input.quoteToken,
        tokenOut: input.baseToken,
        side: "BUY",
        devBps,
        thresholdBps: threshold,
        requestedAmountIn: requested,
        spotPrice: input.spotPrice,
        refPrice: input.refPrice,
        emaFast: nextEmaFast,
        emaSlow: nextEmaSlow,
        reason: `Pool discounted by ${-devBps} bps vs mainnet reference (threshold: ${threshold} bps). BUY signal generated.`,
        isStaleRef: false,
      },
      nextState,
    };
  } else if (devBps >= threshold) {
    // Our pool is expensive compared to mainnet: SELL base for quote
    const requested = mulDiv(input.baseBalance, preset.maxTradePercent, 100n);
    return {
      output: {
        action: "SELL",
        tokenIn: input.baseToken,
        tokenOut: input.quoteToken,
        side: "SELL",
        devBps,
        thresholdBps: threshold,
        requestedAmountIn: requested,
        spotPrice: input.spotPrice,
        refPrice: input.refPrice,
        emaFast: nextEmaFast,
        emaSlow: nextEmaSlow,
        reason: `Pool premium is +${devBps} bps vs mainnet reference (threshold: +${threshold} bps). SELL signal generated.`,
        isStaleRef: false,
      },
      nextState,
    };
  }

  return {
    output: {
      action: "HOLD",
      tokenIn: input.baseToken,
      tokenOut: input.quoteToken,
      side: "HOLD",
      devBps,
      thresholdBps: threshold,
      requestedAmountIn: 0n,
      spotPrice: input.spotPrice,
      refPrice: input.refPrice,
      emaFast: nextEmaFast,
      emaSlow: nextEmaSlow,
      reason: `Deviation ${devBps} bps within deadband [${-threshold}, +${threshold}] bps. No trade.`,
      isStaleRef: false,
    },
    nextState,
  };
}

