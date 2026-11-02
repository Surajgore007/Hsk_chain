/**
 * quoter.ts — QuoterV2 integration.
 * All amounts are bigint. No float.
 *
 * QuoterV2 interface (Uniswap v3-periphery):
 *   quoteExactInputSingle(tokenIn, tokenOut, amountIn, fee, sqrtPriceLimitX96)
 *   returns (amountOut, sqrtPriceX96After, initializedTicksCrossed, gasEstimate)
 */

import type { PublicClient } from "viem";

// Minimal QuoterV2 ABI (only what we need)
const QUOTER_V2_ABI = [
  {
    inputs: [
      {
        components: [
          { name: "tokenIn",            type: "address" },
          { name: "tokenOut",           type: "address" },
          { name: "amountIn",           type: "uint256" },
          { name: "fee",                type: "uint24"  },
          { name: "sqrtPriceLimitX96",  type: "uint160" },
        ],
        name: "params",
        type: "tuple",
      },
    ],
    name: "quoteExactInputSingle",
    outputs: [
      { name: "amountOut",                 type: "uint256" },
      { name: "sqrtPriceX96After",         type: "uint160" },
      { name: "initializedTicksCrossed",   type: "uint32"  },
      { name: "gasEstimate",               type: "uint256" },
    ],
    stateMutability: "nonpayable",
    type: "function",
  },
] as const;

export interface QuoteResult {
  amountOut: bigint;
  sqrtPriceX96After: bigint;
  ok: boolean;
  error?: string;
}

/**
 * Get a single quote from QuoterV2 via eth_call (simulated, no gas cost).
 */
export async function quoteExactInput(
  client: PublicClient,
  quoterAddress: `0x${string}`,
  tokenIn: `0x${string}`,
  tokenOut: `0x${string}`,
  amountIn: bigint,
  fee: number,
): Promise<QuoteResult> {
  if (amountIn === 0n) {
    return { amountOut: 0n, sqrtPriceX96After: 0n, ok: false, error: "amountIn is zero" };
  }
  try {
    const result = await client.simulateContract({
      address: quoterAddress,
      abi: QUOTER_V2_ABI,
      functionName: "quoteExactInputSingle",
      args: [
        {
          tokenIn,
          tokenOut,
          amountIn,
          fee,
          sqrtPriceLimitX96: 0n,
        },
      ],
    });
    const [amountOut, sqrtPriceX96After] = result.result as unknown as [bigint, bigint, ...unknown[]];
    return { amountOut, sqrtPriceX96After, ok: true };
  } catch (err) {
    return {
      amountOut: 0n,
      sqrtPriceX96After: 0n,
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Pool slot0 ABI for reading sqrtPriceX96.
 */
const POOL_ABI = [
  {
    inputs: [],
    name: "slot0",
    outputs: [
      { name: "sqrtPriceX96",              type: "uint160" },
      { name: "tick",                       type: "int24"   },
      { name: "observationIndex",           type: "uint16"  },
      { name: "observationCardinality",     type: "uint16"  },
      { name: "observationCardinalityNext", type: "uint16"  },
      { name: "feeProtocol",               type: "uint8"   },
      { name: "unlocked",                   type: "bool"    },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "token0",
    outputs: [{ type: "address" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "token1",
    outputs: [{ type: "address" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "liquidity",
    outputs: [{ type: "uint128" }],
    stateMutability: "view",
    type: "function",
  },
] as const;

export interface PoolState {
  sqrtPriceX96: bigint;
  tick: number;
  liquidity: bigint;
  token0: `0x${string}`;
  token0IsBase: boolean; // true if token0 == baseToken
}

/**
 * Read pool state (slot0 + liquidity + token ordering).
 */
export async function readPoolState(
  client: PublicClient,
  poolAddress: `0x${string}`,
  baseToken: `0x${string}`,
): Promise<PoolState> {
  const [slot0Result, liq, t0] = await Promise.all([
    client.readContract({ address: poolAddress, abi: POOL_ABI, functionName: "slot0" }),
    client.readContract({ address: poolAddress, abi: POOL_ABI, functionName: "liquidity" }),
    client.readContract({ address: poolAddress, abi: POOL_ABI, functionName: "token0" }),
  ]);

  const [sqrtPriceX96, tick] = slot0Result as unknown as [bigint, number, ...unknown[]];
  return {
    sqrtPriceX96,
    tick,
    liquidity: liq as bigint,
    token0: t0 as `0x${string}`,
    token0IsBase: (t0 as string).toLowerCase() === baseToken.toLowerCase(),
  };
}

/**
 * ERC20 balance ABI helper.
 */
const ERC20_ABI = [
  {
    inputs: [{ name: "account", type: "address" }],
    name: "balanceOf",
    outputs: [{ type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
] as const;

export async function tokenBalance(
  client: PublicClient,
  tokenAddress: `0x${string}`,
  account: `0x${string}`,
): Promise<bigint> {
  const bal = await client.readContract({
    address: tokenAddress,
    abi: ERC20_ABI,
    functionName: "balanceOf",
    args: [account],
  });
  return bal as bigint;
}

