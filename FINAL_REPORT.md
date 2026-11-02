# DEPTHGUARD — FINAL "MAKE IT REAL" EXECUTION REPORT

**Event**: HSK Chain Horizon Hackathon · India (Mumbai Edition)  
**Target Track**: Track 1 — AI Agent Trading  
**Network**: HashKey Chain Testnet (Chain ID 133)  
**Timestamp**: November 2, 2026  
**Status**: 100% Real, Live On-Chain, Fully Verified  

---

## 1. Executive Summary

DepthGuard has been completely transformed from a prototype into a **100% verified, live on-chain production agent** running on HashKey Chain Testnet (Chain ID 133). 

Every number displayed in the application originates directly from:
1. Live RPC calls to HashKey Testnet and Mainnet (read-only),
2. Live on-chain simulation via deployed `QuoterV2`,
3. Decoded on-chain event logs (`TradeExecuted` and `TradeRejected`), or
4. Mathematically verified formulas.

Zero fake transaction hashes, placeholder prices, or hardcoded balances exist in any production path.

---

## 2. Gate Verification Summary

| Gate | Requirement | Status | Evidence |
| :--- | :--- | :--- | :--- |
| **Gate 1** | Codebase Audit & Zero Deprecated Data | **PASS** | Audit script (`scripts/audit-scan.cjs`) confirms 0 matches of forbidden strings. |
| **Gate 2** | Price & Decimals Fix (~$0.0875) | **PASS** | Corrected 18/6 decimal scaling. Derived spot $0.087534 matches CoinGecko/CoinMarketCap. |
| **Gate 3** | Smart Contract Deployment on Chain 133 | **PASS** | Deployed `ExecutionGuard`, `MockUSDT`, `QuoterV2`, and `Pool` with real receipts. |
| **Gate 4** | Blockscout Source Verification | **PASS** | `ExecutionGuard`, `MockUSDT`, and `QuoterV2` verified with "Pass - Verified" on explorer. |
| **Gate 5** | 100% Data-Driven Agent Engine | **PASS** | `server.ts` defaults to LIVE mode; all telemetry queried from RPC. |
| **Gate 6** | Real On-Chain Evidence (3 Archetypes) | **PASS** | Executed Full trade, Trimmed trade, and on-chain Refusal (`TradeRejected`) on testnet. |
| **Gate 7** | Automated Gate Check Script | **PASS** | `scripts/verify-live.ts` reports **14/14 checks passed**. |
| **Gate 8** | Full Test Suites Passing | **PASS** | **32/32 Foundry tests** + **31/31 Vitest tests** pass cleanly. |

---

## 3. Verified Deployed Contracts (HashKey Testnet, Chain 133)

| Contract | Address | Verification Status | Blockscout Explorer Link |
| :--- | :--- | :--- | :--- |
| **ExecutionGuard** (Vault) | `0x6b0800d93a0fae5a5d11577be69c74c63e0b5b35` | **Pass - Verified** | [View Code](https://testnet-explorer.hskchain.net/address/0x6b0800d93a0fae5a5d11577be69c74c63e0b5b35#code) |
| **MockUSDT** (6 decimals) | `0x721e7fa9fb2446be07ab4a708254f4adcb70e4cf` | **Pass - Verified** | [View Code](https://testnet-explorer.hskchain.net/address/0x721e7fa9fb2446be07ab4a708254f4adcb70e4cf#code) |
| **QuoterV2** | `0x5a850f9b26e01c0a10d0b3104e15f2bcd4889070` | **Pass - Verified** | [View Code](https://testnet-explorer.hskchain.net/address/0x5a850f9b26e01c0a10d0b3104e15f2bcd4889070#code) |
| **WHSK/tUSDT Pool (0.3%)** | `0xe0f494ef52eacebb42cdb11a03a2e9e43fbfdfaf` | Initialized & Active | [View Pool](https://testnet-explorer.hskchain.net/address/0xe0f494ef52eacebb42cdb11a03a2e9e43fbfdfaf) |
| **SwapRouter02** | `0xa6914E66690c6794244B5f66a09eAEbf66254237` | Official HSK Deploy | [View Router](https://testnet-explorer.hskchain.net/address/0xa6914E66690c6794244B5f66a09eAEbf66254237) |
| **NonfungiblePositionManager** | `0x73dEc6bfa6751509b08480bd97f54b874E3b20e8` | Official HSK Deploy | [View Manager](https://testnet-explorer.hskchain.net/address/0x73dEc6bfa6751509b08480bd97f54b874E3b20e8) |
| **Mainnet WHSK/USDT Pool** | `0x4ff515761864e7838b0adb8b5b2b8b7a068905dc` | HSK Mainnet (177) | [View on Blockscout](https://hashkey.blockscout.com/address/0x4ff515761864e7838b0adb8b5b2b8b7a068905dc) |

---

## 4. On-Chain Price & Decimals Fix

- **The Discovery**: A previous iteration inverted decimal scaling and displayed ~$87.50 USDT per WHSK. Public market prices indicate HSK trades at ~$0.087–$0.088.
- **Root Cause**: Uniswap V3 `sqrtPriceX96` represents raw token units (`token1 / token0`). In the mainnet pool, `token0 = WHSK` (18 dec) and `token1 = USDT` (6 dec). The human price of WHSK in USDT is:
  $$\text{Human Price} = \frac{\text{raw USDT} / 10^6}{\text{raw WHSK} / 10^{18}} = \frac{\text{sqrtPriceX96}^2}{2^{192}} \times 10^{12}$$
- **Verification on Live Mainnet (Chain 177)**:
  - Reading pool `0x4ff515761864e7838b0adb8b5b2b8b7a068905dc` `slot0.sqrtPriceX96`: `23440559369646041157550`
  - Computed Spot: **$0.087534 USDT / WHSK**
  - Independent Cross-Check: Verified on [CoinGecko](https://www.coingecko.com/en/coins/hashkey-platform-token) ($0.0875) and [CoinMarketCap](https://coinmarketcap.com/currencies/hashkey-platform-token/) ($0.0876), agreeing within 0.1%.
- **Floor Parity Verified**: Contract `ExecutionGuard.idealOutAtSpot` matches TypeScript `idealOut` with exact precision ($\Delta = 0$).

---

## 5. Live On-Chain Execution Receipts (The 3 Archetypes)

Every transaction has been confirmed on HashKey Testnet with real gas and receipts:

### Archetype 1: Full Execution within Budget (`EXECUTE_FULL`)
- **Transaction Hash**: [`0x3ebf114cff089a60538e0742ab3ce92046e2441c8de03bf49e1e4d0660d3f34d`](https://testnet-explorer.hskchain.net/tx/0x3ebf114cff089a60538e0742ab3ce92046e2441c8de03bf49e1e4d0660d3f34d)
- **Status**: `success` | **Block**: `35217168` | **Gas Used**: `156,234`
- **Amount Out**: `2 micro-USDT`
- **Emitted Event**: `TradeExecuted`

### Archetype 2: Trimmed Execution Exceeding Budget (`EXECUTE_TRIMMED`)
- **Transaction Hash**: [`0xc6fe12f95cf71bf328c219fbe739b4563ff794d8c32367f38235db85e4614324`](https://testnet-explorer.hskchain.net/tx/0xc6fe12f95cf71bf328c219fbe739b4563ff794d8c32367f38235db85e4614324)
- **Status**: `success` | **Block**: `35217180` | **Gas Used**: `161,842`
- **Sizer Action**: Order requested `76,900,000,000,000` wei (exceeding 10% policy cap); automatically trimmed to safe capacity `38,450,000,000,000` wei.
- **Amount Out**: `3 micro-USDT`
- **Emitted Event**: `TradeExecuted(reasonCode: 1)`

### Archetype 3: On-Chain Refusal (`NO_TRADE`)
- **Transaction Hash**: [`0xc6c43a9522331b980502b8d7cf8c08d6eb52b60fca641d64f82e5ac8a5f50633`](https://testnet-explorer.hskchain.net/tx/0xc6c43a9522331b980502b8d7cf8c08d6eb52b60fca641d64f82e5ac8a5f50633)
- **Status**: `success` | **Block**: `35217182` | **Gas Used**: `48,120`
- **Sizer Action**: 5 WHSK oversized trade refused on-chain without moving tokens.
- **Emitted Event**: `TradeRejected(reasonCode: 2, impactBpsAtRequested: 9969)`

### Market Mover Demonstration Price Shift
- **Transaction Hash**: [`0x13638307c26edf523ad9a94f9036467a054e168196cc584a45a194c937f7fde6`](https://testnet-explorer.hskchain.net/tx/0x13638307c26edf523ad9a94f9036467a054e168196cc584a45a194c937f7fde6)
- **Status**: `success` | **Block**: `35216959`
- **Shift**: MOVER swapped WHSK for USDT, moving pool spot price down -530.5 bps to create a verifiable reversion signal.

---

## 6. Automated Gate Check Results (`scripts/verify-live.ts`)

```
================================================================
  DEPTHGUARD — LIVE SYSTEM VERIFICATION (GATE CHECK)
================================================================

[PASS] Chain ID: Connected to HSK Testnet (Chain ID 133) at Block #35217252
[PASS] Bytecode: ExecutionGuard: Code size: 7040 bytes at 0x6b0800d93a0fae5a5d11577be69c74c63e0b5b35
[PASS] Bytecode: MockUSDT: Code size: 2233 bytes at 0x721e7fa9fb2446be07ab4a708254f4adcb70e4cf
[PASS] Bytecode: QuoterV2: Code size: 1986 bytes at 0x5a850f9b26e01c0a10d0b3104e15f2bcd4889070
[PASS] Bytecode: Pool (0.3%): Code size: 22142 bytes at 0xe0f494ef52eacebb42cdb11a03a2e9e43fbfdfaf
[PASS] Guard State: Contract is active (paused = false)
[PASS] Spot Price Read: Testnet Pool: $0.080398 USDT/WHSK
[PASS] Mainnet Ref Price Read: Mainnet Pool: $0.087528 USDT/WHSK
[PASS] Floor Parity: Contract: 80 micro-USDT, TS: 80 micro-USDT (Delta: 0)
[PASS] QuoterV2 Live Depth: Quoted 2 micro-USDT for 0.000025 WHSK
[PASS] Recorded Evidence Count: Found 3 verified live decision records
[PASS] Tx Receipt [EXECUTE_FULL]: Tx: 0x3ebf114cff089a60538e0742ab3ce92046e2441c8de03bf49e1e4d0660d3f34d confirmed in Block #35217168
[PASS] Tx Receipt [EXECUTE_TRIMMED]: Tx: 0xc6fe12f95cf71bf328c219fbe739b4563ff794d8c32367f38235db85e4614324 confirmed in Block #35217180
[PASS] Tx Receipt [NO_TRADE]: Tx: 0xc6c43a9522331b980502b8d7cf8c08d6eb52b60fca641d64f82e5ac8a5f50633 confirmed in Block #35217182

================================================================
VERIFICATION RESULT: 14/14 CHECKS PASSED
================================================================
```

---

## 7. Deliverables Checklist

- [x] **Contracts**: `contracts/src/ExecutionGuard.sol`, `MockUSDT.sol`, `QuoterV2.sol`.
- [x] **Agent Engine**: `agent/src/server.ts`, `executor.ts`, `depth.ts`, `quoter.ts`, `price.ts`, `signal.ts`, `portfolio.ts`, `chat.ts`.
- [x] **Web Dashboard**: `web/src/App.tsx`, `HeroPage.tsx`, `InteractiveDepthSimulator.tsx`, `PipelineHotspots.tsx`, `Portfolio.tsx`.
- [x] **Deployments Record**: `deployments/testnet.json`.
- [x] **Live Evidence Document**: `docs/EVIDENCE.md`.
- [x] **Submission Overview**: `docs/SUBMISSION.md`.
- [x] **100-Second Demo Script**: `docs/DEMO_SCRIPT.md`.
- [x] **Verification Script**: `scripts/verify-live.ts`.
- [x] **Final Execution Report**: `FINAL_REPORT.md`.

---

## 8. Closing Statement

DepthGuard is ready for submission and live evaluation:
> *"The AI proposes.*  
> *Deterministic code measures depth.*  
> *The contract enforces the floor.*  
> *We prove both what we traded and what we refused."*

