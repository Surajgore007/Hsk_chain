# FATHOM — ON-CHAIN VERIFICATION EVIDENCE

This document contains **100% verified, live on-chain receipts** executed on **HashKey Chain Testnet (Chain ID 133)**.
Every transaction hash, event log, and contract address is publicly verifiable on the [HashKey Testnet Blockscout Explorer](https://testnet-explorer.hskchain.net).

---

## 1. Verified Multi-Pair Infrastructure

To address the Track 1 requirement for dynamic multi-asset trading under real liquidity constraints, Fathom deploys dedicated non-custodial `ExecutionGuard` vaults and initialized Uniswap V3 pools across three pairs:

| Asset Pair | Fee Tier | Base Token | Quote Token | Pool Contract | ExecutionGuard (Vault) | Pool Depth & Reserve Status |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **tWETH / tUSDT** | 3000 (0.3%) | `0xbb1f1b23...` (18 dec) | `0x721e7fa9...` (6 dec) | [`0x4605627A...`](https://testnet-explorer.hskchain.net/address/0x4605627Af0621C90A74B2828E4Ee16d07cAD0d8c) | [`0x0d326a2b...`](https://testnet-explorer.hskchain.net/address/0x0d326a2b8eafd98c3bdf3412ed44ac151fdc3cc8) | Deep Pool: 100 tWETH + 250,000 tUSDT ($250,000) |
| **tWBTC / tUSDT** | 3000 (0.3%) | `0x48bdf4a8...` (8 dec) | `0x721e7fa9...` (6 dec) | [`0x313BE070...`](https://testnet-explorer.hskchain.net/address/0x313BE070B6851F74C17bb866C2F82A26f41cc9e8) | [`0xd04859a8...`](https://testnet-explorer.hskchain.net/address/0xd04859a859cf07fcf4bf6fb6f07eb90402e4f1b0) | Deep Pool: 5 tWBTC + 350,000 tUSDT ($350,000) |
| **WHSK / tUSDT** | 3000 (0.3%) | `0xCA8aAceE...` (18 dec) | `0x721e7fa9...` (6 dec) | [`0xe0f494ef...`](https://testnet-explorer.hskchain.net/address/0xe0f494ef52eacebb42cdb11a03a2e9e43fbfdfaf) | [`0x6b0800d9...`](https://testnet-explorer.hskchain.net/address/0x6b0800d93a0fae5a5d11577be69c74c63e0b5b35) | Testnet Seeded Pool (0.019 WHSK / 0.0015 tUSDT) |

- **QuoterV2**: [`0x5a850f9b26e01c0a10d0b3104e15f2bcd4889070`](https://testnet-explorer.hskchain.net/address/0x5a850f9b26e01c0a10d0b3104e15f2bcd4889070#code) (Verified bytecode on HSK Testnet)
- **SwapRouter02**: [`0xa6914E66690c6794244B5f66a09eAEbf66254237`](https://testnet-explorer.hskchain.net/address/0xa6914E66690c6794244B5f66a09eAEbf66254237) (Official HSK Deployment)
- **Reference Price Anchor (WHSK)**: HSK Mainnet (Chain 177, read-only) Pool `0x4ff515761864e7838b0adb8b5b2b8b7a068905dc`

> **Transparency Disclosure**: `tWETH` and `tWBTC` are testnet mock tokens deployed and funded by the team to simulate realistic decentralized exchange liquidity pools on HSK Testnet, where public testnet liquidity is typically dust. Both pools are initialized with full-range Uniswap V3 liquidity.

---

## 2. QuoterV2 Depth Curve Sweep (Non-Dust Resolution)

To prove that price impact is genuine and not rounding noise, the table below documents the QuoterV2 outputs across order sizes on `tWETH/tUSDT` (Vault balance: 3.00 tWETH = exactly 3.00% of pool reserve):

| Order Fraction | Amount In (tWETH) | Raw Wei Units | Quoter Output (tUSDT) | Quoter Raw Units | Price Impact | Status vs 60 bps Budget |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **1% of Balance** | `0.03 tWETH` | `30,000,000,000,000,000` | `74.75 tUSDT` | `74,752,999` | **2 bps** | ✅ Safe (Within budget) |
| **5% of Balance** | `0.15 tWETH` | `150,000,000,000,000,000` | `373.30 tUSDT` | `373,303,890` | **14 bps** | ✅ Safe (Within budget) |
| **12% of Balance** | `0.35 tWETH` | `350,000,000,000,000,000` | `868.48 tUSDT` | `868,476,852` | **34 bps** | ✅ Safe (Trim Target) |
| **25% of Balance** | `0.70 tWETH` | `700,000,000,000,000,000` | `1,725.10 tUSDT` | `1,725,098,124` | **69 bps** | ❌ **Breaches 60 bps Budget** |
| **100% of Balance** | `3.00 tWETH` | `3,000,000,000,000,000,000` | `7,264.80 tUSDT` | `7,264,801,200` | **289 bps** | ❌ **High Slippage / Rejection** |

*All quoter outputs are in tens/hundreds of millions of raw units, completely eliminating rounding noise.*

---

## 3. Fresh On-Chain Execution Receipts (Section 8)

All receipts below were generated live on HSK Testnet across the deep `tWETH/tUSDT` pool.

### Receipt 1: AI-Proposed Execution Within Budget (`EXECUTE_FULL`)
- **Asset Pair**: `tWETH / tUSDT`
- **Side**: `SELL`
- **Requested Size**: `0.05 tWETH` (`50,000,000,000,000,000` wei, ~1.6% of vault)
- **Decided Size**: `0.05 tWETH` (Full execution)
- **Quoted Output**: `124.562905 tUSDT` (`124,562,905` raw units)
- **Realized Price Impact**: **4 bps** (Well within active 60 bps Balanced budget)
- **On-Chain Transaction**: [`0xdd5b48cf7077d2946ee0a9998c54588d456c5674ea385cd488ae08d8832317e9`](https://testnet-explorer.hskchain.net/tx/0xdd5b48cf7077d2946ee0a9998c54588d456c5674ea385cd488ae08d8832317e9)
- **Block Number**: `35222224`
- **Gas Used**: `226,453`
- **Emitted Event**: `TradeExecuted(intentHash, tokenIn, tokenOut, amountIn, amountOut, reasonCode: 0)`
- **AI Rationale**: *"Spread at equilibrium, size inside 60 bps budget, full execution confirmed."*

---

### Receipt 2: Depth-Curve Trimmed Execution (`EXECUTE_TRIMMED`)
> **Note on Verification**: This trim is proven to be caused **strictly by the Quoter depth impact curve exceeding the 60 bps budget**, and NOT by the contract's 25% policy cap.
- **Asset Pair**: `tWETH / tUSDT`
- **Side**: `SELL`
- **Vault Balance at Trade**: `2.95 tWETH` (Contract 25% policy cap allows up to `0.7375 tWETH`)
- **Requested Size**: `0.70 tWETH` (`700,000,000,000,000,000` wei)
  - *Proof that requested size is within policy cap: `0.70 tWETH <= 0.7375 tWETH`.*
- **Simulated Impact at Requested**: **69 bps** (Exceeds 60 bps impact budget)
- **Sizer Action**: Binary search over QuoterV2 depth curve trimmed order down until price impact was <= 60 bps.
- **Decided Size**: `0.35 tWETH` (`350,000,000,000,000,000` wei)
- **Quoted Output**: `868.476852 tUSDT` (`868,476,852` raw units)
- **Decided Price Impact**: **34 bps** (Satisfies 60 bps ceiling)
- **Decision**: `EXECUTE_TRIMMED` (`reasonCode: 1`, `TRIMMED_TO_SAFE_CAP`)
- **On-Chain Transaction**: [`0xb35dbee0eed3fc944d5eeef372c7718eab64ed0f39f10e779916ef676e7245d8`](https://testnet-explorer.hskchain.net/tx/0xb35dbee0eed3fc944d5eeef372c7718eab64ed0f39f10e779916ef676e7245d8)
- **Block Number**: `35222296`
- **Gas Used**: `176,147`
- **Emitted Event**: `TradeExecuted(..., reasonCode: 1, rationaleHash)`

---

### Receipt 3: On-Chain Refusal Proof (`TradeRejected` Event)
- **Asset Pair**: `tWETH / tUSDT`
- **Side**: `SELL`
- **Requested Size**: `1.20 tWETH` (`1,200,000,000,000,000,000` wei)
- **Simulated Impact**: **185 bps**
- **User / Policy Impact Budget**: `10 bps` (Strict limit)
- **Sizer Action**: Order cannot be filled safely without exceeding budget; order refused completely to preserve capital.
- **On-Chain Refusal Call**: `ExecutionGuard.recordRefusal(...)`
- **On-Chain Transaction**: [`0xdbc70b4f15391d4d841ed45abee1365aec8a464488567b64e00e57e0621b885f`](https://testnet-explorer.hskchain.net/tx/0xdbc70b4f15391d4d841ed45abee1365aec8a464488567b64e00e57e0621b885f)
- **Block Number**: `35222297`
- **Gas Used**: `29,180`
- **Emitted Event**: `TradeRejected(intentHash, reasonCode: 2, requestedAmountIn: 1200000000000000000, maxSafeAmountIn: 0, impactBpsAtRequested: 185)`
- **Tokens Moved**: 0 tWETH, 0 tUSDT. Complete protection against 185 bps price impact loss.

---

## 4. Continuous Autonomous Loop Evidence (AI Reasoning Engine)

Fathom runs an always-on autonomous loop (`tick()`) querying the AI reasoning engine with temperature 0. Below is the verified log of 3 consecutive autonomous cycles on `tWETH/tUSDT`:

```json
[
  {
    "cycleIndex": 1,
    "timestamp": 1793631340150,
    "blockNumber": 35222301,
    "marketSnapshot": {
      "spotPrice": 2480.1786,
      "referencePrice": 2500.0,
      "spreadBps": -79,
      "emaCross": "NEUTRAL",
      "zScore": 0,
      "guardBaseBalance": "2.6000 tWETH",
      "guardQuoteBalance": "8493.04 tUSDT"
    },
    "aiProposal": {
      "action": "HOLD",
      "sizePct": 0,
      "rationale": "Spread -79 bps is within normal band, EMA neutral, zScore 0, no dislocation – no trade needed.",
      "confidence": 0.9,
      "signalsUsed": ["spreadBps", "emaCross", "zScore"]
    },
    "source": "ai",
    "latencyMs": 1268,
    "decisionOutcome": "HOLD_RECORDED"
  },
  {
    "cycleIndex": 2,
    "timestamp": 1793631345422,
    "blockNumber": 35222303,
    "marketSnapshot": {
      "spotPrice": 2480.1786,
      "referencePrice": 2500.0,
      "spreadBps": -79,
      "emaCross": "NEUTRAL",
      "zScore": 0,
      "guardBaseBalance": "2.6000 tWETH",
      "guardQuoteBalance": "8493.04 tUSDT"
    },
    "aiProposal": {
      "action": "HOLD",
      "sizePct": 0,
      "rationale": "Spread -79 bps is within normal band, EMA neutral, zScore 0, no dislocation – no trade needed.",
      "confidence": 0.9,
      "signalsUsed": ["spreadBps", "emaCross", "zScore"]
    },
    "source": "ai",
    "latencyMs": 893,
    "decisionOutcome": "HOLD_RECORDED"
  },
  {
    "cycleIndex": 3,
    "timestamp": 1793631350318,
    "blockNumber": 35222305,
    "marketSnapshot": {
      "spotPrice": 2480.1786,
      "referencePrice": 2500.0,
      "spreadBps": -79,
      "emaCross": "NEUTRAL",
      "zScore": 0,
      "guardBaseBalance": "2.6000 tWETH",
      "guardQuoteBalance": "8493.04 tUSDT"
    },
    "aiProposal": {
      "action": "HOLD",
      "sizePct": 0,
      "rationale": "Spread -79 bps is within normal band, EMA neutral, zScore 0, no dislocation – no trade needed.",
      "confidence": 0.9,
      "signalsUsed": ["spreadBps", "emaCross", "zScore"]
    },
    "source": "ai",
    "latencyMs": 1119,
    "decisionOutcome": "HOLD_RECORDED"
  }
]
```

---

## 5. Deterministic Risk-Control & Stop-Loss Framework

Unlike typical LLM agents where risk rules are merely text prompts, Fathom implements a **deterministic risk engine (`agent/src/risk.ts`) that runs directly in code and strictly bypasses the LLM**:

1. **Hard Stop-Loss (default 3.0%)**: If the spot price drops >= 3.0% below the weighted-average cost basis of the open position, the agent immediately executes an emergency position unwind swap, selling 100% of the base token back to quote currency.
2. **Take-Profit (default 5.0%)**: If gains reach >= 5.0% above cost basis, profits are automatically locked into stablecoin units.
3. **Max Drawdown Limit (default 8.0%)**: If overall portfolio NAV drops by >= 8.0% from its historical peak, the agent immediately halts all trading and executes `ExecutionGuard.emergencyStop()`, engaging the on-chain circuit breaker.
4. **Daily Loss Limit (default 5.0%)**: If portfolio NAV drops >= 5.0% from 00:00 UTC day-open, the agent halts and pauses the contract.
5. **Consecutive Refusal Backoff**: If on-chain market conditions cause 3 consecutive trade refusals (e.g. pool depth evaporated), the polling interval dynamically backs off (2x, then 4x) to prevent wasteful RPC spamming.
6. **On-Chain Spot Price Floor**: `ExecutionGuard._validateFloor()` computes `floor = idealOut * (10000 - fee - impact - slippage) / 10000` using the pool's raw `slot0.sqrtPriceX96` inside the contract. Even if the agent were fully compromised, it cannot execute swaps below this mathematical floor.

---

## 6. Live API Verification Endpoints

The running Fathom backend service exposes public endpoints to verify continuous operation:
- `GET /api/heartbeat` — Uptime, active pair, last autonomous cycle timestamp, loop interval, risk limits.
- `GET /api/signals` — Real-time EMA fast/slow, crossover, rolling z-score, spread in bps, pool depth ratio.
- `GET /api/risk` — Active risk configuration, current NAV, drawdown percentage, pause state.
- `GET /api/depth` — Live price impact sweep curve (1% to 100% of vault balance) from QuoterV2.
- `GET /api/scorecard` — Live execution-quality scorecard (predicted vs realized slippage, quoter error bps).
- `GET /api/decisions` — Complete audit trail of executed, trimmed, and refused trades with on-chain transaction hashes.
