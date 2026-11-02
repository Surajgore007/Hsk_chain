/**
 * preflight.ts — Deterministic JS mirror of all on-chain ExecutionGuard checks
 *
 * Verifies all 10+ contract invariants BEFORE any transaction is simulated or sent.
 * Prevents wasted gas and guarantees honest, deterministic error handling.
 */

import { contractFloor, idealOut } from "./price.js";

export interface PolicyView {
  maxTradeBps: number;
  dailyCapQuote: bigint;
  maxImpactBps: number;
  maxSlippageBps: number;
  feeBps: number;
  maxQuoteAgeBlocks: number;
  cooldownSeconds: number;
}

export interface PreflightParams {
  tokenIn: `0x${string}`;
  tokenOut: `0x${string}`;
  baseToken: `0x${string}`;
  quoteToken: `0x${string}`;
  amountIn: bigint;
  amountOutMin: bigint;
  quotedAmountOut: bigint;
  balanceTokenIn: bigint;
  quoteBlock: bigint;
  currentBlock: bigint;
  deadline: bigint;
  currentTimestamp: bigint;
  lastTradeTime: bigint;
  nonceUsed: boolean;
  isPaused: boolean;
  dayVolumeQuote: bigint;
  sqrtPriceX96: bigint;
  token0IsBase: boolean;
  policy: PolicyView;
}

export interface PreflightResult {
  ok: boolean;
  reasonCode: string;
  humanReason: string;
  floor: bigint;
  idealOutAmt: bigint;
}

export function runPreflight(p: PreflightParams): PreflightResult {
  // 0. Guard paused
  if (p.isPaused) {
    return {
      ok: false,
      reasonCode: "GUARD_PAUSED",
      humanReason: "ExecutionGuard is paused. Trades are halted.",
      floor: 0n,
      idealOutAmt: 0n,
    };
  }

  // 1. Pair check
  const baseToQuote =
    p.tokenIn.toLowerCase() === p.baseToken.toLowerCase() &&
    p.tokenOut.toLowerCase() === p.quoteToken.toLowerCase();
  const quoteToBase =
    p.tokenIn.toLowerCase() === p.quoteToken.toLowerCase() &&
    p.tokenOut.toLowerCase() === p.baseToken.toLowerCase();

  if (!baseToQuote && !quoteToBase) {
    return {
      ok: false,
      reasonCode: "PAIR_NOT_ALLOWED",
      humanReason: `Pair ${p.tokenIn} -> ${p.tokenOut} is not permitted. Only WHSK/tUSDT allowed.`,
      floor: 0n,
      idealOutAmt: 0n,
    };
  }

  // 2. Deadline
  if (p.currentTimestamp > p.deadline) {
    return {
      ok: false,
      reasonCode: "DEADLINE_EXPIRED",
      humanReason: `Deadline expired (${p.deadline} < ${p.currentTimestamp}).`,
      floor: 0n,
      idealOutAmt: 0n,
    };
  }

  // 3. Quote freshness
  if (p.currentBlock > p.quoteBlock && (p.currentBlock - p.quoteBlock) > BigInt(p.policy.maxQuoteAgeBlocks)) {
    return {
      ok: false,
      reasonCode: "QUOTE_STALE",
      humanReason: `Quote is ${p.currentBlock - p.quoteBlock} blocks old (limit is ${p.policy.maxQuoteAgeBlocks}).`,
      floor: 0n,
      idealOutAmt: 0n,
    };
  }

  // 4. Nonce replay
  if (p.nonceUsed) {
    return {
      ok: false,
      reasonCode: "NONCE_REPLAY",
      humanReason: "Nonce has already been used on-chain.",
      floor: 0n,
      idealOutAmt: 0n,
    };
  }

  // 5. Cooldown
  if (p.currentTimestamp < p.lastTradeTime + BigInt(p.policy.cooldownSeconds)) {
    const remaining = Number((p.lastTradeTime + BigInt(p.policy.cooldownSeconds)) - p.currentTimestamp);
    return {
      ok: false,
      reasonCode: "COOLDOWN",
      humanReason: `Cooldown active. ${remaining}s remaining before next execution.`,
      floor: 0n,
      idealOutAmt: 0n,
    };
  }

  // 6. Balance & Per-trade size cap
  if (p.amountIn === 0n) {
    return {
      ok: false,
      reasonCode: "AMOUNT_TOO_LARGE",
      humanReason: "Order amount cannot be zero.",
      floor: 0n,
      idealOutAmt: 0n,
    };
  }

  if (p.amountIn > p.balanceTokenIn) {
    return {
      ok: false,
      reasonCode: "INSUFFICIENT_BALANCE",
      humanReason: `Vault balance (${p.balanceTokenIn}) is less than order size (${p.amountIn}).`,
      floor: 0n,
      idealOutAmt: 0n,
    };
  }

  const maxAllowed = (p.balanceTokenIn * BigInt(p.policy.maxTradeBps)) / 10_000n;
  if (p.amountIn > maxAllowed) {
    return {
      ok: false,
      reasonCode: "AMOUNT_TOO_LARGE",
      humanReason: `Amount ${p.amountIn} exceeds max per-trade cap (${maxAllowed}, ${p.policy.maxTradeBps / 100}% of balance).`,
      floor: 0n,
      idealOutAmt: 0n,
    };
  }

  // 7. Floor math & Min Out
  const ideal = idealOut(p.sqrtPriceX96, p.amountIn, baseToQuote, p.token0IsBase);

  // Daily cap estimation
  const notionalQuote = baseToQuote ? ideal : p.amountIn;
  if (p.dayVolumeQuote + notionalQuote > p.policy.dailyCapQuote) {
    return {
      ok: false,
      reasonCode: "DAILY_CAP_EXCEEDED",
      humanReason: `Daily volume ${p.dayVolumeQuote + notionalQuote} exceeds cap ${p.policy.dailyCapQuote}.`,
      floor: 0n,
      idealOutAmt: ideal,
    };
  }

  if (p.amountOutMin === 0n) {
    return {
      ok: false,
      reasonCode: "MIN_OUT_ZERO",
      humanReason: "amountOutMin cannot be zero.",
      floor: 0n,
      idealOutAmt: ideal,
    };
  }

  const floor = contractFloor(
    ideal,
    BigInt(p.policy.feeBps),
    BigInt(p.policy.maxImpactBps),
    BigInt(p.policy.maxSlippageBps)
  );

  if (p.amountOutMin < floor) {
    return {
      ok: false,
      reasonCode: "MIN_OUT_TOO_LOW",
      humanReason: `amountOutMin (${p.amountOutMin}) is below on-chain floor (${floor}). Swap would revert.`,
      floor,
      idealOutAmt: ideal,
    };
  }

  return {
    ok: true,
    reasonCode: "OK",
    humanReason: "All preflight policy and on-chain floor checks passed.",
    floor,
    idealOutAmt: ideal,
  };
}

