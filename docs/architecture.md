# Fathom System Architecture

## Overview
Fathom is an autonomous AI trading agent system designed specifically for HSKSwap on HSK Chain.
Unlike conventional bots that fire fixed order sizes regardless of pool depth, Fathom:
1. Sweeps the pool's real-time liquidity depth using Uniswap-V3 QuoterV2.
2. Derives the price impact curve and dynamically sizes the trade to stay within the user's risk budget.
3. Automatically trims oversized orders (`EXECUTE_TRIMMED`) or refuses hazardous trades (`NO_TRADE`).
4. Enforces an immutable minimum-output floor directly inside the on-chain smart vault (`ExecutionGuard.sol`).
5. Immutably records executed trades and refusals (`TradeExecuted` / `TradeRejected`) with an execution quality scorecard.

---

## Architectural Diagram

```
 +-------------------------------------------------------------------------+
 |                               Browser UI                                |
 |               React + Vite + Tailwind CSS · Light Theme                 |
 |       Chat-First · Decision Card · Depth Chart · Live P&L · Scorecard   |
 +------------------------------------+------------------------------------+
                                      | HTTP & SSE Stream
                                      v
 +-------------------------------------------------------------------------+
 |                        Fathom Agent Service                         |
 |                       Node.js + TypeScript + Viem                       |
 |                                                                         |
 |  +--------------------+   +---------------------+   +----------------+  |
 |  | Market Monitor     |   | AI Semantic Parser  |   | Rules Engine   |  |
 |  | Polls spot & ref   |   | Neural Brain -> Zod |   | Safety Fallback|  |
 |  +---------+----------+   +----------+----------+   +-------+--------+  |
 |            |                         |                      |           |
 |            v                         v                      v           |
 |  +-------------------------------------------------------------------+  |
 |  | Deterministic Signal Engine (Reference Deviation + Spot EMAs)     |  |
 |  +-----------------------------------+-------------------------------+  |
 |                                      |                                  |
 |                                      v                                  |
 |  +-------------------------------------------------------------------+  |
 |  | USP 1: Depth Sizer & Impact Curve (Binary Search over QuoterV2)   |  |
 |  | Full -> Trimmed -> Refusal                                        |  |
 |  +-----------------------------------+-------------------------------+  |
 |                                      |                                  |
 |                                      v                                  |
 |  +-------------------------------------------------------------------+  |
 |  | Preflight Engine (Deterministic JS mirror of contract invariants) |  |
 |  +-----------------------------------+-------------------------------+  |
 |                                      |                                  |
 |                                      v                                  |
 |  +-------------------------------------------------------------------+  |
 |  | USP 2: Decision Ledger & Execution Scorecard                      |  |
 |  | Loss Avoided · Slippage Accuracy · On-Chain Proofs                |  |
 |  +-----------------------------------+-------------------------------+  |
 +--------------------------------------|----------------------------------+
                                        | Viem Transactions & Queries
                                        v
 +-------------------------------------------------------------------------+
 |                         HSK Testnet (Chain 133)                         |
 |                                                                         |
 |  +-------------------------------------------------------------------+  |
 |  | ExecutionGuard.sol (Non-Custodial Smart Vault)                    |  |
 |  | - Nonce replay protection                                         |  |
 |  | - Cooldown & per-trade size cap                                   |  |
 |  | - On-chain spot price floor: amountOutMin >= idealOut * (1 - fee) |  |
 |  | - Events: TradeExecuted, TradeRejected                            |  |
 |  +-----------------------------------+-------------------------------+  |
 |                                      | Swap via exactInputSingle
 |                                      v
 |  +-------------------------------------------------------------------+  |
 |  | HSKSwap SwapRouter02 (0xa6914E66690c6794244B5f66a09eAEbf66254237) |  |
 |  +-----------------------------------+-------------------------------+  |
 |                                      |
 |                                      v
 |  +-------------------------------------------------------------------+  |
 |  | WHSK / tUSDT 0.3% Pool (Uniswap-V3 Fork)                          |  |
 |  +-------------------------------------------------------------------+  |
 +-------------------------------------------------------------------------+
                                        ^
                                        | Read-Only Spot (slot0)
 +-------------------------------------------------------------------------+
 |                         HSK Mainnet (Chain 177)                         |
 |  WHSK/USDT 0.3% Pool (0x4ff515761864e7838b0adb8b5b2b8b7a068905dc)       |
 +-------------------------------------------------------------------------+
```

---

## Component Details

### 1. Market Monitor
- Polls the active testnet pool (`slot0`, `liquidity`) and HSK Mainnet reference pool every interval.
- Computes deviation:
  $$\text{devBps} = \frac{\text{spot} - \text{ref}}{\text{ref}} \times 10000$$

### 2. Signal Engine
- Deterministic and non-predictive.
- BUY when testnet pool is discounted vs reference ($\text{devBps} \le -\text{threshold}$).
- SELL when testnet pool is at a premium vs reference ($\text{devBps} \ge +\text{threshold}$).
- Disables trading if reference price is older than 60 seconds.

### 3. Depth-Aware Sizer (USP 1)
- Quotes multiple size fractions: 1%, 2%, 5%, 10%, 25%, 50%, 100% of vault balance.
- Constructs the price impact curve:
  $$\text{priceImpactBps} = \max\left(0, \frac{\text{idealOut} - \text{quotedOut}}{\text{idealOut}} \times 10000 - \text{feeBps}\right)$$
- If requested size causes impact $\le \text{budgetBps}$: `EXECUTE_FULL`.
- If requested size exceeds budget: runs integer binary search (~10-12 calls) to find $\text{maxSafeAmountIn}$.
- If $\text{maxSafeAmountIn} \ge 20\%$ of requested: `EXECUTE_TRIMMED`.
- Otherwise: `NO_TRADE` with reason `IMPACT_TOO_HIGH`.

### 4. Smart Contract Enforcement (`ExecutionGuard.sol`)
- Owner deposits funds and sets bounded policy.
- Operator can only execute swaps where `recipient == address(this)`. Operator CANNOT withdraw.
- Enforces an independent on-chain minimum-output floor calculated from `pool.slot0().sqrtPriceX96`.
- Emits `TradeExecuted` or `TradeRejected` for every action.

