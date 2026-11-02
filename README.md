# 🛡️ DEPTHGUARD

> **An autonomous AI trading agent for HSKSwap that *sizes every order to the pool's real liquidity*, and records every decision — executed, trimmed, or refused — on-chain with an execution-quality scorecard.**

Built for **HSK Chain Horizon Hackathon · India (Mumbai Edition)** — **Track 1: AI Agent Trading**.

---

## ⚡ The Problem & Our Solution

Traditional trading bots decide *what* to trade, then blindly fire an order of fixed size into whatever liquidity happens to exist. On decentralized exchanges and emerging L1/L2 thin pools, this causes catastrophic price impact and slippage. Even worse, autonomous AI agents can hallucinate sizes or execute stale quotes without safety constraints.

Existing guards simply cap maximum trade size or place stop-loss triggers. None answers the fundamental question:
> **"Can this pool absorb my order at an acceptable cost right now?"**

**DepthGuard combines AI-driven autonomy with deterministic mathematical risk controls across two core innovations:**

### USP 1 — Depth-Aware Sizing
Before executing any trade, DepthGuard sweeps real quotes across multiple balance fractions (1% to 100%), constructs the live price impact curve via `QuoterV2`, and uses binary search to compute the **largest safe order size that stays strictly within the user's impact budget** (e.g. 60 bps).
- **`EXECUTE_FULL`**: Order impact is within budget.
- **`EXECUTE_TRIMMED`**: "You requested 100 tUSDT, but safe capacity is 42.50 tUSDT — executing 42.50 tUSDT."
- **`NO_TRADE`**: Pool is too thin; order refused with on-chain reason code `IMPACT_TOO_HIGH`.
- **On-Chain Spot Floor:** `ExecutionGuard.sol` independently computes the expected output at the pool's `slot0` spot price and reverts if `amountOutMin` is below policy floor. A compromised agent can never trade at predatory prices.

### USP 2 — On-Chain Decision Ledger + Execution Scorecard
Rivals only prove what they traded. **DepthGuard also proves what it refused to trade.**
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

| # | Requirement | Implementation in DepthGuard | Status |
|---|---|---|---|
| **R1** | Built on HSK Chain / HSKSwap | Smart vault (`ExecutionGuard.sol`) routes trades to HSKSwap `SwapRouter02` (`0xa6914E66...`) | ✅ Complete |
| **R2** | Market Monitoring | Poller queries testnet pool (`slot0`, liquidity) and mainnet reference price each tick | ✅ Complete |
| **R3** | On-Chain Data Analysis | QuoterV2 depth curves, price-impact sweep, spot EMAs, and deviation metrics | ✅ Complete |
| **R4** | Trading-Signal Identification | Deterministic reference-price reversion and deviation signals | ✅ Complete |
| **R5** | Order Execution | Autonomous agent -> `ExecutionGuard` vault -> HSKSwap router | ✅ Complete |
| **R6** | Autonomous Closed Loop | Autonomous execution loop runs continuously without human intervention (AUTO mode) | ✅ Complete |
| **R7** | Natural-Language Interface | Conversational interface with Groq/Gemini semantic parsing + deterministic rules fallback | ✅ Complete |
| **R8** | Real-Time Positions & P&L | Real-time NAV, weighted average cost basis, realized & unrealized P&L from contract logs | ✅ Complete |
| **R9** | Dynamic Strategy Adjustment | Chat intents adjust sizing (`SET_SIZE`), frequency (`SET_FREQUENCY`), and risk (`SET_RISK`) | ✅ Complete |
| **R10**| Risk Controls & Human Control | Non-custodial vault, cooldown, per-trade cap, daily cap, emergency kill switch | ✅ Complete |
| **R11**| Verifiable On-Chain Proof | Immutable `TradeExecuted` & `TradeRejected` events with explorer links | ✅ Complete |

---

## 🏛️ Verified Addresses & System Interfaces

| Contract / Role | Address | Verification Status | Explorer Link |
|---|---|---|---|
| **ExecutionGuard (Vault)** | `0x6b0800d93a0fae5a5d11577be69c74c63e0b5b35` | **Pass - Verified** | [View Code](https://testnet-explorer.hskchain.net/address/0x6b0800d93a0fae5a5d11577be69c74c63e0b5b35#code) |
| **MockUSDT (6 dec)** | `0x721e7fa9fb2446be07ab4a708254f4adcb70e4cf` | **Pass - Verified** | [View Code](https://testnet-explorer.hskchain.net/address/0x721e7fa9fb2446be07ab4a708254f4adcb70e4cf#code) |
| **QuoterV2** | `0x5a850f9b26e01c0a10d0b3104e15f2bcd4889070` | **Pass - Verified** | [View Code](https://testnet-explorer.hskchain.net/address/0x5a850f9b26e01c0a10d0b3104e15f2bcd4889070#code) |
| **WHSK/tUSDT Pool (0.3%)** | `0xe0f494ef52eacebb42cdb11a03a2e9e43fbfdfaf` | Initialized & Funded | [View Pool](https://testnet-explorer.hskchain.net/address/0xe0f494ef52eacebb42cdb11a03a2e9e43fbfdfaf) |
| **HSKSwap SwapRouter02** | `0xa6914E66690c6794244B5f66a09eAEbf66254237` | Official HSK Deploy | [View Router](https://testnet-explorer.hskchain.net/address/0xa6914E66690c6794244B5f66a09eAEbf66254237) |
| **NonfungiblePositionManager**| `0x73dec6bfa6751509b08480bd97f54b874e3b20e8` | Official HSK Deploy | [View Manager](https://testnet-explorer.hskchain.net/address/0x73dec6bfa6751509b08480bd97f54b874e3b20e8) |
| **Mainnet WHSK/USDT Pool** | `0x4ff515761864e7838b0adb8b5b2b8b7a068905dc` | HSK Mainnet (177) | [View on Blockscout](https://hashkey.blockscout.com/address/0x4ff515761864e7838b0adb8b5b2b8b7a068905dc) |

For complete transaction receipts, gas figures, and decoded event logs, see [docs/EVIDENCE.md](docs/EVIDENCE.md).

---

## 🧪 Testing Verification (63 / 63 Tests Passing)

All tests can be executed directly from a clean checkout:

### 1. Smart Contract Test Suite (Foundry)
```bash
cd depthguard/contracts
forge test -v
```
**Results:** **32 passed, 0 failed** (including 1,000 fuzz runs each for invariant checks, per-trade cap enforcement, and nonce replay prevention).

### 2. Agent Test Suite (Vitest)
```bash
cd depthguard/agent
npm test
```
**Results:** **31 passed, 0 failed** (covering `price.ts`, `portfolio.ts`, `preflight.ts`, `intent.ts` parity, and `chat.ts` prompt-injection resistance).

### 3. Live On-Chain End-to-End Verification
```bash
cd depthguard/agent
npx tsx ../scripts/verify-live.ts
```
**Results:** **14/14 on-chain checks passed** (RPC, bytecodes, policy, real spot/ref pricing, contract floor parity, QuoterV2 depth, and confirmed receipts).

### 3. Frontend Production Build (Vite)
```bash
cd depthguard/web
npm run build
```
**Results:** Builds cleanly without errors or warnings (`dist/index.html`, WebGL assets, Tailwind styles).

---

## 🎨 Dual-Interface User Experience (Landing Page + Trading Terminal)

DepthGuard features a dual-experience architecture with smooth one-click transitions:

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

## 🚀 Running DepthGuard Locally

### Prerequisites
- Node.js v20+ or v24
- Foundry (`forge` and `cast`)

### Step 1: Clone and Configure
```bash
cd depthguard
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

