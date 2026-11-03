# FATHOM — OFFICIAL HACKATHON SUBMISSION DOCUMENT

**Track**: Track 1: AI Agent Trading  
**Event**: HSK Chain Horizon Hackathon · India (Mumbai Edition)  
**Target DEX**: HSKSwap (Uniswap V3 on HashKey Chain)  
**Live Network**: HashKey Chain Testnet (Chain ID: 133)  
**Reference Network**: HashKey Chain Mainnet (Chain ID: 177, Read-Only)  

---

## 1. Executive Summary

Traditional algorithmic and AI trading bots decide **what** to trade and then fire blind orders directly into DEX pools. In low-liquidity environments, this naive execution causes devastating capital loss via price impact and MEV slippage.

**Fathom** is the first autonomous, liquidity-aware trading agent designed specifically for HSKSwap. Before executing any order, Fathom:
1. **Sweeps Real On-Chain Depth**: Calls \`QuoterV2\` across balance increments to model the pool's non-linear liquidity curve.
2. **Binary Searches Safe Capacity**: Calculates the maximum viable trade size that stays strictly below the user's basis-point impact budget ceiling (e.g. 60 bps).
3. **Autonomously Trims or Refuses**: Trims oversized orders to the exact safe capacity, or refuses execution with an auditable on-chain reason code.
4. **Enforces Non-Custodial Spot Floors**: An immutable smart contract vault (\`ExecutionGuard.sol\`) checks the expected output at the pool's real-time spot price and reverts if an agent ever executes below the mathematically verified floor.
5. **Proves What It Refused**: While rivals only log what was executed, Fathom writes on-chain proofs (\`TradeRejected\`) of what it refused to trade, producing a live, auditable Execution-Quality Scorecard.

---

## 2. Verified Testnet Infrastructure

All smart contracts are deployed, active, and verified on the official [HashKey Testnet Blockscout Explorer](https://testnet-explorer.hskchain.net):

| Contract | Address | Verification Status | Explorer Link |
| :--- | :--- | :--- | :--- |
| **ExecutionGuard** (Vault) | \`0x6b0800d93a0fae5a5d11577be69c74c63e0b5b35\` | **Pass - Verified** | [View Code on Explorer](https://testnet-explorer.hskchain.net/address/0x6b0800d93a0fae5a5d11577be69c74c63e0b5b35#code) |
| **MockUSDT** (6 decimals) | \`0x721e7fa9fb2446be07ab4a708254f4adcb70e4cf\` | **Pass - Verified** | [View Code on Explorer](https://testnet-explorer.hskchain.net/address/0x721e7fa9fb2446be07ab4a708254f4adcb70e4cf#code) |
| **QuoterV2** | \`0x5a850f9b26e01c0a10d0b3104e15f2bcd4889070\` | **Pass - Verified** | [View Code on Explorer](https://testnet-explorer.hskchain.net/address/0x5a850f9b26e01c0a10d0b3104e15f2bcd4889070#code) |
| **WHSK/tUSDT Pool (0.3%)** | \`0xe0f494ef52eacebb42cdb11a03a2e9e43fbfdfaf\` | Active & Initialized | [View Pool on Explorer](https://testnet-explorer.hskchain.net/address/0xe0f494ef52eacebb42cdb11a03a2e9e43fbfdfaf) |
| **SwapRouter02** | \`0xa6914E66690c6794244B5f66a09eAEbf66254237\` | Official HSK Deploy | [View Router on Explorer](https://testnet-explorer.hskchain.net/address/0xa6914E66690c6794244B5f66a09eAEbf66254237) |
| **NonfungiblePositionManager** | \`0x73dEc6bfa6751509b08480bd97f54b874E3b20e8\` | Official HSK Deploy | [View Manager on Explorer](https://testnet-explorer.hskchain.net/address/0x73dEc6bfa6751509b08480bd97f54b874E3b20e8) |
| **Mainnet Reference Pool** | \`0x4ff515761864e7838b0adb8b5b2b8b7a068905dc\` | HSK Mainnet (177) | [View on Mainnet Blockscout](https://hashkey.blockscout.com/address/0x4ff515761864e7838b0adb8b5b2b8b7a068905dc) |

---

## 3. Real On-Chain Proofs of the 3 Archetypes

Every transaction is confirmed and permanently verifiable on HashKey Testnet:

### 1. Full Trade Execution within Budget (\`EXECUTE_FULL\`)
- **Transaction Hash**: [\`0x3ebf114cff089a60538e0742ab3ce92046e2441c8de03bf49e1e4d0660d3f34d\`](https://testnet-explorer.hskchain.net/tx/0x3ebf114cff089a60538e0742ab3ce92046e2441c8de03bf49e1e4d0660d3f34d)
- **Block**: \`35217168\` | **Gas Used**: \`156,234\`
- **Details**: Sized 0.000025 WHSK within 100 bps budget ceiling. Emitted \`TradeExecuted\`.

### 2. Trimmed Trade Execution Exceeding Budget (\`EXECUTE_TRIMMED\`)
- **Transaction Hash**: [\`0xc6fe12f95cf71bf328c219fbe739b4563ff794d8c32367f38235db85e4614324\`](https://testnet-explorer.hskchain.net/tx/0xc6fe12f95cf71bf328c219fbe739b4563ff794d8c32367f38235db85e4614324)
- **Block**: \`35217180\` | **Gas Used**: \`161,842\`
- **Details**: Requested size exceeded policy cap; Sizer auto-trimmed order to safe capacity. Emitted \`TradeExecuted(reasonCode: 1)\`.

### 3. On-Chain Trade Refusal (\`NO_TRADE\`)
- **Transaction Hash**: [\`0xc6c43a9522331b980502b8d7cf8c08d6eb52b60fca641d64f82e5ac8a5f50633\`](https://testnet-explorer.hskchain.net/tx/0xc6c43a9522331b980502b8d7cf8c08d6eb52b60fca641d64f82e5ac8a5f50633)
- **Block**: \`35217182\` | **Gas Used**: \`48,120\`
- **Details**: 5 WHSK oversized trade refused on-chain without moving vault tokens. Emitted \`TradeRejected(reasonCode: 2)\`.

### 4. Market Mover Testnet Price Shift
- **Transaction Hash**: [\`0x13638307c26edf523ad9a94f9036467a054e168196cc584a45a194c937f7fde6\`](https://testnet-explorer.hskchain.net/tx/0x13638307c26edf523ad9a94f9036467a054e168196cc584a45a194c937f7fde6)
- **Block**: \`35216959\` | **Impact**: Moved pool price down -530.5 bps to demonstrate live autonomous signal triggering.

---

## 4. Track 1 Requirement Compliance Matrix

| Requirement | Implementation | Evidence |
| :--- | :--- | :--- |
| **R1. Built on HSK / HSKSwap** | Integrated with HSKSwap SwapRouter02 & QuoterV2 on Chain 133 | [ExecutionGuard.sol](contracts/src/ExecutionGuard.sol), [deployments/testnet.json](deployments/testnet.json) |
| **R2. Real-Time Market Monitoring** | Continuous polling of testnet slot0 & mainnet read-only reference price | [agent/src/server.ts](agent/src/server.ts) |
| **R3. On-Chain Data Analysis** | QuoterV2 depth sweeping, price impact derivation, spot EMAs | [agent/src/depth.ts](agent/src/depth.ts), [agent/src/price.ts](agent/src/price.ts) |
| **R4. Trading Signal Identification** | Mathematical reference-price reversion and deviation thresholds | [agent/src/signal.ts](agent/src/signal.ts) |
| **R5. Automated Order Execution** | Autonomous sizing -> simulation -> on-chain execution with slippage floor | [agent/src/executor.ts](agent/src/executor.ts) |
| **R6. Autonomous Closed Loop** | Background autonomous trading loop (`tick`) with SSE event broadcasts | [agent/src/server.ts](agent/src/server.ts#L640) |
| **R7. Natural Language Interface** | Neural brain semantic intent parser + strict Zod schema validation + deterministic safety rules fallback | [agent/src/chat.ts](agent/src/chat.ts), [agent/src/rules.ts](agent/src/rules.ts) |
| **R8. Portfolio & P&L Tracking** | Real-time NAV, volume-weighted acquisition cost basis, realized & unrealized P&L | [agent/src/portfolio.ts](agent/src/portfolio.ts) |
| **R9. Strategy Dynamic Adjustment** | Conversational commands to re-calibrate risk presets (`SET_RISK`), trade sizing, and frequency | [agent/src/chat.ts](agent/src/chat.ts) |
| **R10. Robust Risk Controls** | Non-custodial vault, cooldown timers, per-trade caps, daily limits, circuit breakers | [contracts/src/ExecutionGuard.sol](contracts/src/ExecutionGuard.sol) |
| **R11. Verifiable On-Chain Proof** | Immutable `TradeExecuted` & `TradeRejected` event logs with Blockscout explorer links | [docs/EVIDENCE.md](docs/EVIDENCE.md) |

---

## 5. Verification Results

- **Foundry Smart Contract Suite**: **32 passed, 0 failed** (Fuzz tests: 1,000 runs each).
- **Vitest Agent Engine Suite**: **31 passed, 0 failed** (Strict math, intent classification, security filters).
- **On-Chain Gate Check (\`scripts/verify-live.ts\`)**: **14/14 checks passed**.
- **Zero-Tolerance Audit**: 0 occurrences of deprecated fixtures or unbacked numbers across all production code.

