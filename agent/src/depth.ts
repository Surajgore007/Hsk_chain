/**
 * depth.ts — Depth sweep and binary-search sizer (USP 1)
 *
 * All amounts and bps are bigint. No floating point.
 */

import type { PublicClient } from "viem";
import { quoteExactInput } from "./quoter.js";
import { idealOut, priceImpactBps, minOutFromSlippage, FEE_BPS, Q96 } from "./price.js";

export interface DepthPoint {
  amountIn: bigint;
  quotedOut: bigint;
  idealOutAmt: bigint;
  totalCostBps: bigint;
  priceImpactBps: bigint;
}

export interface DepthCurve {
  points: DepthPoint[];
  timestamp: number;
}

export interface SizerResult {
  decision: "EXECUTE_FULL" | "EXECUTE_TRIMMED" | "NO_TRADE";
  requestedAmountIn: bigint;
  decidedAmountIn: bigint;
  priceImpactBpsAtRequested: bigint;
  priceImpactBpsAtDecided: bigint;
  quotedOut: bigint;
  minOut: bigint;
  reasonCode: string;
  humanReason: string;
  depthCurve: DepthPoint[];
}

const SWEEP_PERCENTS = [1n, 2n, 5n, 10n, 25n, 50n, 100n];

/**
 * Sweep depth: get impact at multiple sizes to build the depth curve.
 */
export async function sweepDepth(
  client: PublicClient,
  quoterAddress: `0x${string}`,
  tokenIn: `0x${string}`,
  tokenOut: `0x${string}`,
  fee: number,
  sellableBalance: bigint,
  sqrtPriceX96: bigint,
  token0IsBase: boolean,
  baseToQuote: boolean,
): Promise<DepthCurve> {
  const points: DepthPoint[] = [];

  for (const pct of SWEEP_PERCENTS) {
    const amountIn = (sellableBalance * pct) / 100n;
    if (amountIn === 0n) continue;

    const quote = await quoteExactInput(client, quoterAddress, tokenIn, tokenOut, amountIn, fee);
    if (!quote.ok || quote.amountOut === 0n) {
      // Could not quote this size — stop sweep
      break;
    }

    const ideal = idealOut(sqrtPriceX96, amountIn, baseToQuote, token0IsBase);
    const costBps = ideal > 0n ? ((ideal - quote.amountOut) * 10_000n) / ideal : 0n;
    const impactBps = costBps > FEE_BPS ? costBps - FEE_BPS : 0n;

    points.push({
      amountIn,
      quotedOut: quote.amountOut,
      idealOutAmt: ideal,
      totalCostBps: costBps,
      priceImpactBps: impactBps,
    });
  }

  return { points, timestamp: Date.now() };
}

/**
 * Binary search: find the largest amountIn such that priceImpactBps <= budgetBps.
 * Returns 0n if even the smallest viable size exceeds budget.
 *
 * Uses ~10-12 quoter calls.
 */
export async function binarySearchMaxSafe(
  client: PublicClient,
  quoterAddress: `0x${string}`,
  tokenIn: `0x${string}`,
  tokenOut: `0x${string}`,
  fee: number,
  maxAmountIn: bigint,       // upper bound (per-trade cap)
  budgetBps: bigint,
  sqrtPriceX96: bigint,
  token0IsBase: boolean,
  baseToQuote: boolean,
  minViable: bigint = 1n,    // min 1 wei
): Promise<bigint> {
  // Quick check: does maxAmountIn fit?
  const topQuote = await quoteExactInput(client, quoterAddress, tokenIn, tokenOut, maxAmountIn, fee);
  if (topQuote.ok && topQuote.amountOut > 0n) {
    const ideal = idealOut(sqrtPriceX96, maxAmountIn, baseToQuote, token0IsBase);
    const impact = priceImpactBps(ideal, topQuote.amountOut);
    if (impact <= budgetBps) return maxAmountIn; // full size fits
  }

  // Binary search
  let lo = minViable;
  let hi = maxAmountIn;
  let best = 0n;

  for (let i = 0; i < 12 && hi - lo > 0n; i++) {
    const mid = lo + (hi - lo) / 2n;
    if (mid === 0n) break;

    const q = await quoteExactInput(client, quoterAddress, tokenIn, tokenOut, mid, fee);
    if (!q.ok || q.amountOut === 0n) {
      hi = mid - 1n;
      continue;
    }

    const ideal = idealOut(sqrtPriceX96, mid, baseToQuote, token0IsBase);
    const impact = priceImpactBps(ideal, q.amountOut);

    if (impact <= budgetBps) {
      best = mid;
      lo = mid + 1n;
    } else {
      hi = mid - 1n;
    }
  }

  return best;
}

/**
 * Main sizing decision (USP 1).
 *
 * 1. Get impact at requested size.
 * 2. If within budget → EXECUTE_FULL.
 * 3. Binary search for maxSafeAmountIn.
 * 4. If maxSafe ≥ MIN_VIABLE_BPS of requested → EXECUTE_TRIMMED.
 * 5. Else → NO_TRADE.
 */
export async function computeSize(
  client: PublicClient,
  quoterAddress: `0x${string}`,
  tokenIn: `0x${string}`,
  tokenOut: `0x${string}`,
  fee: number,
  requestedAmountIn: bigint,
  perTradeCap: bigint,           // from policy
  impactBudgetBps: bigint,
  slippageBps: bigint,
  sqrtPriceX96: bigint,
  token0IsBase: boolean,
  baseToQuote: boolean,
  dustThreshold: bigint,
  minViableBps: bigint = 20n,   // 20% of requested = min for TRIMMED
): Promise<SizerResult> {
  // Quote at raw requested size first to get true requested impact
  const rawReqQuote = await quoteExactInput(client, quoterAddress, tokenIn, tokenOut, requestedAmountIn, fee);
  const idealAtRawReq = idealOut(sqrtPriceX96, requestedAmountIn, baseToQuote, token0IsBase);
  const impactAtRawReq = rawReqQuote.ok && rawReqQuote.amountOut > 0n
    ? priceImpactBps(idealAtRawReq, rawReqQuote.amountOut)
    : 9999n;

  const isCappedByPolicy = requestedAmountIn > perTradeCap;
  const cappedAmount = isCappedByPolicy ? perTradeCap : requestedAmountIn;

  // Quote at capped amount
  const reqQuote = isCappedByPolicy
    ? await quoteExactInput(client, quoterAddress, tokenIn, tokenOut, cappedAmount, fee)
    : rawReqQuote;

  if (!reqQuote.ok || reqQuote.amountOut === 0n) {
    return {
      decision: "NO_TRADE",
      requestedAmountIn,
      decidedAmountIn: 0n,
      priceImpactBpsAtRequested: impactAtRawReq,
      priceImpactBpsAtDecided: 0n,
      quotedOut: 0n,
      minOut: 0n,
      reasonCode: "NO_LIQUIDITY",
      humanReason: "Quoter returned zero output — pool may have no liquidity at this size.",
      depthCurve: [],
    };
  }

  const idealAtCapped = idealOut(sqrtPriceX96, cappedAmount, baseToQuote, token0IsBase);
  const impactAtCapped = priceImpactBps(idealAtCapped, reqQuote.amountOut);

  // If within budget AND not capped by policy: EXECUTE_FULL
  if (impactAtCapped <= impactBudgetBps && !isCappedByPolicy) {
    const minOut = minOutFromSlippage(reqQuote.amountOut, slippageBps);
    return {
      decision: "EXECUTE_FULL",
      requestedAmountIn,
      decidedAmountIn: cappedAmount,
      priceImpactBpsAtRequested: impactAtRawReq,
      priceImpactBpsAtDecided: impactAtCapped,
      quotedOut: reqQuote.amountOut,
      minOut,
      reasonCode: "OK",
      humanReason: `Price impact ${impactAtCapped} bps is within your ${impactBudgetBps} bps budget.`,
      depthCurve: [],
    };
  }

  // If capped by policy and impact at capped is within budget: EXECUTE_TRIMMED
  if (isCappedByPolicy && impactAtCapped <= impactBudgetBps) {
    const minOut = minOutFromSlippage(reqQuote.amountOut, slippageBps);
    return {
      decision: "EXECUTE_TRIMMED",
      requestedAmountIn,
      decidedAmountIn: cappedAmount,
      priceImpactBpsAtRequested: impactAtRawReq,
      priceImpactBpsAtDecided: impactAtCapped,
      quotedOut: reqQuote.amountOut,
      minOut,
      reasonCode: "TRIMMED_TO_FIT",
      humanReason: `Order trimmed to per-trade cap (${cappedAmount}) to comply with vault policy (impact: ${impactAtCapped} bps within ${impactBudgetBps} bps budget).`,
      depthCurve: [],
    };
  }

  // Need to trim further via binary search
  const maxSafe = await binarySearchMaxSafe(
    client, quoterAddress, tokenIn, tokenOut, fee,
    cappedAmount, impactBudgetBps,
    sqrtPriceX96, token0IsBase, baseToQuote,
  );

  // Check if trim is viable
  const minViableAmt = (requestedAmountIn * minViableBps) / 100n;
  if (maxSafe < minViableAmt || maxSafe < dustThreshold) {
    return {
      decision: "NO_TRADE",
      requestedAmountIn,
      decidedAmountIn: 0n,
      priceImpactBpsAtRequested: impactAtRawReq,
      priceImpactBpsAtDecided: 0n,
      quotedOut: 0n,
      minOut: 0n,
      reasonCode: "IMPACT_TOO_HIGH",
      humanReason: `Estimated price impact ${impactAtRawReq} bps exceeds your ${impactBudgetBps} bps budget. Max safe size (${maxSafe}) is below minimum viable (${minViableAmt}).`,
      depthCurve: [],
    };
  }

  // Quote at the trimmed size
  const trimQuote = await quoteExactInput(client, quoterAddress, tokenIn, tokenOut, maxSafe, fee);
  const idealAtTrim = idealOut(sqrtPriceX96, maxSafe, baseToQuote, token0IsBase);
  const impactAtTrim = priceImpactBps(idealAtTrim, trimQuote.ok ? trimQuote.amountOut : 0n);
  const minOut = trimQuote.ok ? minOutFromSlippage(trimQuote.amountOut, slippageBps) : 0n;

  return {
    decision: "EXECUTE_TRIMMED",
    requestedAmountIn,
    decidedAmountIn: maxSafe,
    priceImpactBpsAtRequested: impactAtRawReq,
    priceImpactBpsAtDecided: impactAtTrim,
    quotedOut: trimQuote.ok ? trimQuote.amountOut : 0n,
    minOut,
    reasonCode: "TRIMMED_TO_FIT",
    humanReason: `Estimated price impact at requested size is ${impactAtRawReq} bps — exceeds ${impactBudgetBps} bps budget. Max safe size is ${maxSafe}. Executing trimmed amount.`,
    depthCurve: [],
  };
}

