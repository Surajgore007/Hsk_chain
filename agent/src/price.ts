/**
 * price.ts — All price/impact math. BigInt only. No floating point.
 *
 * TOKEN ORDERING (matches our pool):
 *   token0 = WHSK (baseToken, 18 decimals)
 *   token1 = tUSDT (quoteToken, 6 decimals)
 *
 * sqrtPriceX96 encodes the price of token1 per token0 in raw units.
 *   price_raw = (sqrtPriceX96 / 2^96)^2  [token1-units per token0-unit]
 *
 * Decimal adjustment for WHSK(18)/tUSDT(6):
 *   price_adjusted = price_raw * 10^12  [tUSDT per WHSK]
 *
 * This file is the SINGLE source of truth for price math.
 * The contract's idealOutAtSpot() must agree with idealOut() below.
 * test/price.test.ts verifies parity against hand-calculated values.
 */

export const Q96 = 2n ** 96n;
export const Q192 = 2n ** 192n;

// Decimal constants
export const BASE_DECIMALS  = 18n;
export const QUOTE_DECIMALS = 6n;
export const DECIMAL_ADJ    = 10n ** (BASE_DECIMALS - QUOTE_DECIMALS); // 10^12

export const FEE_TIER = 3000n;
export const FEE_BPS  = 30n;     // 3000 fee tier → 30 bps

/**
 * Safe 256-bit multiplication-division: floor(a * b / c).
 * Throws if result overflows uint256 equivalent.
 */
export function mulDiv(a: bigint, b: bigint, c: bigint): bigint {
  if (c === 0n) throw new Error("mulDiv: division by zero");
  return (a * b) / c;
}

/**
 * Compute the "ideal" amountOut with zero price impact and no pool fee.
 * Derived from pool's sqrtPriceX96 (must match contract's idealOutAtSpot exactly).
 *
 * In Uniswap V3:
 *   sqrtPriceX96 = sqrt(token1_raw / token0_raw) * 2^96
 * The raw price P_raw = (sqrtPriceX96)^2 / 2^192 converts between token0 raw units
 * and token1 raw units directly. Token decimals (WHSK 18 vs USDT 6) are inherently
 * reflected in the pool's raw reserves and sqrtPriceX96.
 *
 * Live Mainnet read (Pool 0x4ff515761864e7838b0adb8b5b2b8b7a068905dc):
 *   token0: WHSK (18 dec), token1: USDT (6 dec)
 *   slot0.sqrtPriceX96 = 23440559369646041157550
 *   Human spot price = 0.087534 USDT / WHSK
 *   1 WHSK (10^18) -> idealOut = 87,534 micro-USDT (0.087534 USDT, 6 dec)
 *
 * @param sqrtPriceX96  pool slot0 sqrtPriceX96
 * @param amountIn      amount of tokenIn (in its native raw units, as bigint)
 * @param baseToQuote   true = selling WHSK for tUSDT, false = selling tUSDT for WHSK
 * @param token0IsBase  true if pool.token0() == baseToken (WHSK)
 */
export function idealOut(
  sqrtPriceX96: bigint,
  amountIn: bigint,
  baseToQuote: boolean,
  token0IsBase: boolean,
): bigint {
  if (sqrtPriceX96 === 0n) throw new Error("pool not initialized");

  if (token0IsBase) {
    if (baseToQuote) {
      // Sell base (18 dec) → get quote (6 dec)
      // idealOut = amountIn * sqrtP^2 / Q192
      const mid = mulDiv(amountIn, sqrtPriceX96, Q96);
      return mulDiv(mid, sqrtPriceX96, Q96);
    } else {
      // Sell quote (6 dec) → get base (18 dec)
      // idealOut = amountIn * Q192 / sqrtP^2
      return mulDiv(amountIn, Q192, sqrtPriceX96 * sqrtPriceX96);
    }
  } else {
    // token0 == quoteToken, token1 == baseToken (inverted pool)
    if (baseToQuote) {
      return mulDiv(amountIn, Q192, sqrtPriceX96 * sqrtPriceX96);
    } else {
      const mid = mulDiv(amountIn, sqrtPriceX96, Q96);
      return mulDiv(mid, sqrtPriceX96, Q96);
    }
  }
}

/**
 * Total cost in bps (includes pool fee + price impact).
 *   totalCostBps = (idealOut - quotedOut) * 10000 / idealOut
 *
 * Returns 0 if quotedOut >= idealOut (shouldn't happen but defensive).
 */
export function totalCostBps(idealOutAmt: bigint, quotedOut: bigint): bigint {
  if (idealOutAmt === 0n) return 0n;
  if (quotedOut >= idealOutAmt) return 0n;
  return ((idealOutAmt - quotedOut) * 10_000n) / idealOutAmt;
}

/**
 * Price impact in bps (excl. pool fee).
 *   priceImpactBps = max(0, totalCostBps - feeBps)
 */
export function priceImpactBps(idealOutAmt: bigint, quotedOut: bigint, feeBps = FEE_BPS): bigint {
  const cost = totalCostBps(idealOutAmt, quotedOut);
  return cost > feeBps ? cost - feeBps : 0n;
}

/**
 * Minimum output after slippage.
 *   minOut = quotedOut * (10000 - slippageBps) / 10000
 */
export function minOutFromSlippage(quotedOut: bigint, slippageBps: bigint): bigint {
  const min = mulDiv(quotedOut, 10_000n - slippageBps, 10_000n);
  return min === 0n && quotedOut > 0n ? 1n : min;
}

/**
 * On-chain floor computation (mirrors ExecutionGuard._validateFloor).
 * amountOutMin must be >= floor to pass the guard.
 *   floor = idealOut * (10000 - feeBps - maxImpactBps - maxSlippageBps) / 10000
 */
export function contractFloor(
  idealOutAmt: bigint,
  feeBps_: bigint,
  maxImpactBps: bigint,
  maxSlippageBps: bigint,
): bigint {
  const deduct = feeBps_ + maxImpactBps + maxSlippageBps;
  if (deduct >= 10_000n) throw new Error("deductions exceed 100%");
  return mulDiv(idealOutAmt, 10_000n - deduct, 10_000n);
}

/**
 * Intent hash — must match ExecutionGuard._intentHash() exactly.
 * keccak256(abi.encode(chainId, guardAddress, nonce, tokenIn, tokenOut,
 *                      amountIn, quotedAmountOut, amountOutMin, quoteBlock, deadline))
 */
import { keccak256, encodeAbiParameters, parseAbiParameters } from "viem";

export interface IntentHashParams {
  chainId: bigint;
  guardAddress: `0x${string}`;
  nonce: bigint;
  tokenIn: `0x${string}`;
  tokenOut: `0x${string}`;
  amountIn: bigint;
  quotedAmountOut: bigint;
  amountOutMin: bigint;
  quoteBlock: bigint;
  deadline: bigint;
}

export function computeIntentHash(p: IntentHashParams): `0x${string}` {
  const encoded = encodeAbiParameters(
    parseAbiParameters(
      "uint256 chainId, address guard, uint256 nonce, address tokenIn, address tokenOut, uint256 amountIn, uint256 quotedAmountOut, uint256 amountOutMin, uint256 quoteBlock, uint256 deadline"
    ),
    [
      p.chainId,
      p.guardAddress,
      p.nonce,
      p.tokenIn,
      p.tokenOut,
      p.amountIn,
      p.quotedAmountOut,
      p.amountOutMin,
      p.quoteBlock,
      p.deadline,
    ]
  );
  return keccak256(encoded);
}

/**
 * Extract sqrtPriceX96 from slot0 call result.
 * slot0 returns: (uint160 sqrtPriceX96, int24 tick, ...)
 */
export function sqrtPriceFromSlot0(slot0Result: readonly [bigint, number, ...unknown[]]): bigint {
  return slot0Result[0];
}

/**
 * Compute EMA update.
 * alpha is in bps (e.g. 200 = 0.02).
 * newEma = prev * (10000 - alpha) / 10000 + newValue * alpha / 10000
 */
export function updateEma(prev: bigint, newValue: bigint, alphaBps: bigint): bigint {
  return mulDiv(prev, 10_000n - alphaBps, 10_000n) + mulDiv(newValue, alphaBps, 10_000n);
}

/**
 * Deviation of spot from reference in bps (signed).
 * devBps = (spot - ref) * 10000 / ref
 * Returns negative if spot < ref (our pool is cheap → BUY signal).
 */
export function deviationBps(spot: bigint, ref: bigint): bigint {
  if (ref === 0n) throw new Error("ref price is zero");
  return ((spot - ref) * 10_000n) / ref;
}

/**
 * Convert sqrtPriceX96 to a human-readable price for display only.
 * Returns price as a number with proper decimal places.
 * NEVER use this for safety math — display boundary only.
 */
export function sqrtPriceToDisplayPrice(
  sqrtPriceX96: bigint,
  token0IsBase: boolean,
  baseDecimals = 18,
  quoteDecimals = 6,
): number {
  const raw = Number(sqrtPriceX96) / Number(Q96);
  const priceRaw = raw * raw;
  const decMultiplier = Math.pow(10, baseDecimals - quoteDecimals);
  const price = token0IsBase ? priceRaw * decMultiplier : decMultiplier / priceRaw;
  return price;
}

