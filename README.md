# 🛡️ FATHOM

> **An autonomous AI trading agent for HSKSwap that *sizes every order to the pool's real liquidity*, and records every decision — executed, trimmed, or refused — on-chain with an execution-quality scorecard.**

Built for **HSK Chain Horizon Hackathon · India (Mumbai Edition)** — **Track 1: AI Agent Trading**.

---

## ⚡ The Problem & Our Solution

Traditional trading bots decide *what* to trade, then blindly fire an order of fixed size into whatever liquidity happens to exist. On decentralized exchanges and emerging L1/L2 thin pools, this causes catastrophic price impact and slippage. Even worse, autonomous AI agents can hallucinate sizes or execute stale quotes without safety constraints.

Existing guards simply cap maximum trade size or place stop-loss triggers. None answers the fundamental question:
> **"Can this pool absorb my order at an acceptable cost right now?"**

**Fathom combines AI-driven autonomy with deterministic mathematical risk controls across two core innovations:**

### USP 1 — Depth-Aware Sizing
Before executing any trade, Fathom sweeps real quotes across multiple balance fractions (1% to 100%), constructs the live price impact curve via `QuoterV2`, and uses binary search to compute the **largest safe order size that stays strictly within the user's impact budget** (e.g. 60 bps).
- **`EXECUTE_FULL`**: Order impact is within budget.
- **`EXECUTE_TRIMMED`**: "You requested 100 tUSDT, but safe capacity is 42.50 tUSDT — executing 42.50 tUSDT."
- **`NO_TRADE`**: Pool is too thin; order refused with on-chain reason code `IMPACT_TOO_HIGH`.
- **On-Chain Spot Floor:** `ExecutionGuard.sol` independently computes the expected output at the pool's `slot0` spot price and reverts if `amountOutMin` is below policy floor. A compromised agent can never trade at predatory prices.

### USP 2 — On-Chain Decision Ledger + Execution Scorecard
Rivals only prove what they traded. **Fathom also proves what it refused to trade.**
- Every executed trade emits `TradeExecuted` with rationale hash and quote block.
- Refused trades emit `TradeRejected` on-chain with exact impact and reason codes.
- The dashboard displays a live **Execution-Quality Scorecard**:
  - Predicted vs. realized slippage
  - Quoter estimation accuracy
  - **Estimated loss avoided** (what trimmed or refused orders would have lost to price impact)
  - 100% budget compliance record

---

## 🏷️ Mode & Network Honesty Labels

To adhere strictly to hackathon rules and scientific integrity, all modes in the UI, code, and documentation are explicitly labelled:
- `LIVE HSK TESTNET (own-seeded pool)` — Live transactions on HSK Testnet (Chain ID 133). Pool seeded by us because HSKSwap testnet lacks an official stablecoin pair.
- `MAINNET READ-ONLY (reference price)` — Live queries to HSK Mainnet (Chain ID 177) WHSK/USDT pool (`0x4ff5...05dc`) for fair reference pricing. No mainnet transactions are ever sent.
- `LOCAL MOCK (not HSK)` — Automated unit tests using mock tokens and routers.
- `REPLAY MODE (recorded)` — Replaying verifiable historical demo fixtures when offline.

### Non-Claims & Honest Limitations
- **Not Alpha / Financial Advice:** The reference-price reversion signal is a deterministic demonstration strategy, not a guaranteed profit algorithm.
- **Not Audited:** Contracts are developed for hackathon demonstration.
- **Testnet Seeded Pool:** Our testnet pool does not represent HSKSwap mainnet production depth.
- **No Order Slicing Claimed:** Slicing large orders over time requires active arbitrageurs to restore pool depth between blocks. Since testnet has no external arbitrageurs, order slicing was deliberately not claimed or simulated.

---

## 📋 Track 1 Problem Statement Checklist

| # | Requirement | Implementation in Fathom | Status |
|---|---|---|---|
| **R1** | Built on HSK Chain / HSKSwap | Smart vaults (`ExecutionGuard.sol`) route trades to HSKSwap `SwapRouter02` (`0xa6914E66...`) | ✅ Complete |
| **R2** | Market Monitoring | Continuous poller queries pool state (`slot0`, liquidity) and reference prices for 3 target pairs | ✅ Complete |
| **R3** | On-Chain Data Analysis | QuoterV2 depth curves, price-impact sweep, EMAs (12/26), crossover, rolling z-score, depth shrinkage | ✅ Complete |
| **R4** | Trading-Signal Identification | Quantitative spread arbitrage + mean reversion signals exposed to Groq LLM brain | ✅ Complete |
| **R5** | Order Execution | Autonomous AI Proposer -> Deterministic Sizer -> ExecutionGuard vault -> HSKSwap router | ✅ Complete |
| **R6** | Autonomous Closed Loop | Always-on autonomous execution loop running every 20-60s without human intervention (AUTO mode) | ✅ Complete |
| **R7** | Natural-Language Interface | Conversational interface with Groq semantic intent parser + deterministic fallback | ✅ Complete |
| **R8** | Real-Time Positions & P&L | Real-time NAV, weighted average cost basis, realized & unrealized P&L from contract logs | ✅ Complete |
| **R9** | Dynamic Strategy Adjustment | Chat commands adjust sizing (`SET_SIZE`), cadence (`SET_FREQUENCY`), risk (`SET_RISK`), asset (`SET_ASSET`) | ✅ Complete |
| **R10**| Risk Controls & Stop-Loss | Deterministic Stop-Loss (3%), Take-Profit (5%), Max Drawdown (8%), Daily-Loss limit (5%), Emergency Pause | ✅ Complete |
| **R11**| Target Assets | Supports 3 pairs: `tWETH/tUSDT`, `tWBTC/tUSDT`, and `WHSK/tUSDT` with individual vaults | ✅ Complete |
| **R12**| Verifiable On-Chain Proof | Immutable `TradeExecuted` & `TradeRejected` events with verified explorer receipts | ✅ Complete |

---

## 🏛️ Verified Addresses & System Interfaces

| Asset / Contract | Address | Verification Status | Explorer Link |
|---|---|---|---|
| **tWETH / tUSDT ExecutionGuard** | `0x0d326a2b8eafd98c3bdf3412ed44ac151fdc3cc8` | **Pass - Verified** | [View Vault](https://testnet-explorer.hskchain.net/address/0x0d326a2b8eafd98c3bdf3412ed44ac151fdc3cc8#code) |
| **tWBTC / tUSDT ExecutionGuard** | `0xd04859a859cf07fcf4bf6fb6f07eb90402e4f1b0` | **Pass - Verified** | [View Vault](https://testnet-explorer.hskchain.net/address/0xd04859a859cf07fcf4bf6fb6f07eb90402e4f1b0#code) |
| **WHSK / tUSDT ExecutionGuard** | `0x6b0800d93a0fae5a5d11577be69c74c63e0b5b35` | **Pass - Verified** | [View Vault](https://testnet-explorer.hskchain.net/address/0x6b0800d93a0fae5a5d11577be69c74c63e0b5b35#code) |
| **QuoterV2** | `0x5a850f9b26e01c0a10d0b3104e15f2bcd4889070` | **Pass - Verified** | [View Quoter](https://testnet-explorer.hskchain.net/address/0x5a850f9b26e01c0a10d0b3104e15f2bcd4889070#code) |
| **tWETH / tUSDT Pool (0.3%)** | `0x4605627Af0621C90A74B2828E4Ee16d07cAD0d8c` | Initialized ($250k Depth) | [View Pool](https://testnet-explorer.hskchain.net/address/0x4605627Af0621C90A74B2828E4Ee16d07cAD0d8c) |
| **tWBTC / tUSDT Pool (0.3%)** | `0x313BE070B6851F74C17bb866C2F82A26f41cc9e8` | Initialized ($350k Depth) | [View Pool](https://testnet-explorer.hskchain.net/address/0x313BE070B6851F74C17bb866C2F82A26f41cc9e8) |
| **WHSK / tUSDT Pool (0.3%)** | `0xe0f494ef52eacebb42cdb11a03a2e9e43fbfdfaf` | Initialized & Funded | [View Pool](https://testnet-explorer.hskchain.net/address/0xe0f494ef52eacebb42cdb11a03a2e9e43fbfdfaf) |
| **HSKSwap SwapRouter02** | `0xa6914E66690c6794244B5f66a09eAEbf66254237` | Official HSK Deploy | [View Router](https://testnet-explorer.hskchain.net/address/0xa6914E66690c6794244B5f66a09eAEbf66254237) |
| **Mainnet WHSK/USDT Pool** | `0x4ff515761864e7838b0adb8b5b2b8b7a068905dc` | HSK Mainnet (177) | [View on Blockscout](https://hsk.blockscout.com/address/0x4ff515761864e7838b0adb8b5b2b8b7a068905dc) |

---

## 🔍 Verify It Yourself (In Seconds)

Judges can verify every claim independently via live RPC reads or the terminal:

1. **Verify Contract On-Chain Parameters (Live eth_call):**
   ```bash
   # Check vault paused state, owner, operator on HSK Testnet
   curl https://fathom-agent.onrender.com/api/verify
   ```
2. **Verify Live Quoter Depth Curve:**
   ```bash
   curl https://fathom-agent.onrender.com/api/depth
   # Read-only live mainnet liquidity curve:
   curl "https://fathom-agent.onrender.com/api/depth?network=mainnet"
   ```
3. **Verify On-Chain Receipts:**
   - `EXECUTE_FULL` — [Tx `0xdd5b48cf...`](https://testnet-explorer.hskchain.net/tx/0xdd5b48cf1ffb527582522778da51ca3fc76e1a7428ce0732df723e7f4c9a8979) (Block #35222224)
   - `EXECUTE_TRIMMED` — [Tx `0xb35dbee0...`](https://testnet-explorer.hskchain.net/tx/0xb35dbee0beab3cf0e6b8180c55fbb6a4270bc78d5236686e0017a41490236aeb) (Block #35222296)
   - `NO_TRADE / TradeRejected` — [Tx `0xdbc70b4f...`](https://testnet-explorer.hskchain.net/tx/0xdbc70b4fa1be24cc05dfbc8813faee7121ae43b17c2f6d0a797745778841029c) (Block #35222297)

For complete transaction receipts, gas figures, and decoded event logs, see [docs/EVIDENCE.md](docs/EVIDENCE.md).

---

## 🧪 Testing Verification (63 / 63 Tests Passing)

All tests can be executed directly from a clean checkout:

### 1. Smart Contract Test Suite (Foundry)
```bash
cd fathom/contracts
forge test -v
```
**Results:** **32 passed, 0 failed** (including 1,000 fuzz runs each for invariant checks, per-trade cap enforcement, and nonce replay prevention).

### 2. Agent Test Suite (Vitest)
```bash
cd fathom/agent
npm test
```
**Results:** **31 passed, 0 failed** (covering `price.ts`, `portfolio.ts`, `preflight.ts`, `intent.ts` parity, and `chat.ts` prompt-injection resistance).

### 3. Live On-Chain End-to-End Verification
```bash
cd fathom/agent
npx tsx ../scripts/verify-live.ts
```
**Results:** **14/14 on-chain checks passed** (RPC, bytecodes, policy, real spot/ref pricing, contract floor parity, QuoterV2 depth, and confirmed receipts).

### 3. Frontend Production Build (Vite)
```bash
cd fathom/web
npm run build
```
**Results:** Builds cleanly without errors or warnings (`dist/index.html`, WebGL assets, Tailwind styles).

---

## 🎨 Dual-Interface User Experience (Landing Page + Trading Terminal)

Fathom features a dual-experience architecture with smooth one-click transitions:

1. **Interactive WebGL Landing Page (Overview)**
   - **Interactive Liquidity Orb:** Morphing WebGL fluid mesh that ripples and reacts dynamically to cursor position.
   - **Interactive Live Depth Simulator (USP 1):** Users and judges can drag the order size slider from 5 to 300 WHSK to watch the Sizer dynamically calculate price impact, identify safe vs. trimmed thresholds, and estimate avoided slippage losses in real time.
   - **Connected Pipeline Hotspots:** Interactive 4-stage breakdown (Market Monitor → Signal Engine → Depth Sizer → ExecutionGuard Vault) with connecting laser lines and expandable inspection cards.
   - **Verified Architecture Showcase:** Transparent addresses, hard ceilings, and direct explorer links.

2. **Full Autonomous Trading Terminal**
   - **Chat-First Strategy Controller:** Adjust risk presets, sizing, or query portfolio P&L in plain language.
   - **Real-Time ECG Heartbeat:** Canvas oscilloscope wave in the top bar confirming agent liveliness.
   - **Dynamic 3D Risk Preset Picker:** Interactive glass cards for Conservative (25 bps), Balanced (60 bps), and Aggressive (120 bps) profiles.
   - **Live Decision Marquee & Tabs:** Real-time stream of decisions, depth impact curve, NAV, execution scorecard, and on-chain ledger.

---

## 🚀 Running Fathom Locally

### Prerequisites
- Node.js v20+ or v24
- Foundry (`forge` and `cast`)

### Step 1: Clone and Configure
```bash
cd fathom
cp .env.example .env
```
Fill in your Groq or Gemini API key (optional; system includes automatic deterministic rules fallback).

### Step 2: Start Agent Backend
```bash
cd agent
npm install
npm run dev
```
Agent server starts at `http://localhost:3001` with Server-Sent Events (SSE).

### Step 3: Start Web Dashboard
```bash
cd ../web
npm install
npm run dev
```
Open `http://localhost:5173` in your browser.

### Step 4: Run Programmatic Demo Script
```bash
cd ../agent
npm run demo
```
Runs the full 100-second end-to-end scenario displaying real-time depth curves, trimmed executions, refusal proofs, and scorecard metrics.

---

## 📽️ 100-Second Demo Video Walkthrough

1. **Top Bar & Honest Mode Label:** Displays `LIVE HSK TESTNET (own-seeded pool)`, active Chain 133 badge, and heartbeat pulse.
2. **Chat Status Query:** User types `"status"` -> Agent responds with live NAV, spot price, and current risk preset.
3. **Simulated Price Drop:** Demo mover script pushes pool price down -> Agent detects discount vs HSK mainnet reference -> Autonomous loop triggers `EXECUTE_FULL` trade with live on-chain receipt.
4. **Oversized Order Refusal:** User types `"buy 100% of my balance"` -> Depth sweep reveals >400 bps price impact -> Agent issues `NO_TRADE (IMPACT_TOO_HIGH)` and records `TradeRejected` on-chain.
5. **Dynamic Risk Adjustment:** User types `"be more cautious"` -> Agent sets risk preset to Conservative (25 bps budget, 120s cooldown). Repeat request now trims harder.
6. **Prompt Injection Defense:** User inputs malicious jailbreak prompt -> Rejected immediately with zero contract calls.
7. **Scorecard Verification:** Reviewing predicted vs realized slippage, 100% budget compliance, and total estimated loss avoided.
8. **Closing Statement:** *"The AI proposes. Deterministic code measures depth. The contract enforces the floor. We prove both what we traded and what we refused."*

---

## 📄 License
MIT License. Built for the HSK Chain Horizon Hackathon (India - Mumbai Edition) 2026.

