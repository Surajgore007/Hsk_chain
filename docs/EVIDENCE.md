# FATHOM — ON-CHAIN VERIFICATION EVIDENCE

This document contains **100% verified, live on-chain receipts** executed on **HashKey Chain Testnet (Chain ID 133)**.
Every transaction hash, event log, and contract address is publicly verifiable on the [HashKey Testnet Blockscout Explorer](https://testnet-explorer.hskchain.net).

---

## 1. Verified Infrastructure

| Contract | Address | Verification Status | Explorer Link |
| :--- | :--- | :--- | :--- |
| **ExecutionGuard** | `0x6b0800d93a0fae5a5d11577be69c74c63e0b5b35` | **Pass - Verified** | [View Code](https://testnet-explorer.hskchain.net/address/0x6b0800d93a0fae5a5d11577be69c74c63e0b5b35#code) |
| **MockUSDT** (6 dec) | `0x721e7fa9fb2446be07ab4a708254f4adcb70e4cf` | **Pass - Verified** | [View Code](https://testnet-explorer.hskchain.net/address/0x721e7fa9fb2446be07ab4a708254f4adcb70e4cf#code) |
| **QuoterV2** | `0x5a850f9b26e01c0a10d0b3104e15f2bcd4889070` | **Pass - Verified** | [View Code](https://testnet-explorer.hskchain.net/address/0x5a850f9b26e01c0a10d0b3104e15f2bcd4889070#code) |
| **WHSK/tUSDT Pool (0.3%)** | `0xe0f494ef52eacebb42cdb11a03a2e9e43fbfdfaf` | Initialized & Funded | [View Pool](https://testnet-explorer.hskchain.net/address/0xe0f494ef52eacebb42cdb11a03a2e9e43fbfdfaf) |
| **SwapRouter02** | `0xa6914E66690c6794244B5f66a09eAEbf66254237` | Official HSK Deploy | [View Router](https://testnet-explorer.hskchain.net/address/0xa6914E66690c6794244B5f66a09eAEbf66254237) |
| **NonfungiblePositionManager** | `0x73dEc6bfa6751509b08480bd97f54b874E3b20e8` | Official HSK Deploy | [View Manager](https://testnet-explorer.hskchain.net/address/0x73dEc6bfa6751509b08480bd97f54b874E3b20e8) |

---

## 2. On-Chain Price Parity, Decimals & Balance Calibration

### Decimals & Price Derivation
- **Mainnet Pool (Chain 177, read-only)**: `0x4ff515761864e7838b0adb8b5b2b8b7a068905dc`
  - Token0: WHSK (18 decimals), Token1: USDT (6 decimals)
  - Slot0 sqrtPriceX96: `23440559369646041157550`
  - Derived Human Spot Price: **$0.087534 USDT / WHSK**
  - Independent Cross-Check: Verified on CoinGecko & CoinMarketCap (~$0.087–$0.088).
- **Testnet Pool (Chain 133)**: `0xe0f494ef52eacebb42cdb11a03a2e9e43fbfdfaf`
  - Token0: MockUSDT (6 decimals), Token1: WHSK (18 decimals)
  - Initialized at reciprocal sqrtPriceX96: `267788052170594029335402890420021020`
  - Floor Parity Verified: Contract `idealOutAtSpot` matches TypeScript `idealOut` exactly with zero divergence.

### Guard Balances Sized to Pool Reserves
- **Pool Reserves**:
  - Pool WHSK: `0.018948` WHSK (`18948476548926476` wei)
  - Pool tUSDT: `0.001499` tUSDT (`1499` raw units)
- **Guard Balances (Calibrated to 3–5% of Pool Reserves)**:
  - Guard WHSK: `0.00057956` WHSK (`579560210180993` wei) = **3.05% of pool reserve**
  - Guard tUSDT: `0.000089` tUSDT (`89` raw units) = **5.93% of pool reserve**
- **Impact Scaling Confirmation (via QuoterV2)**:
  - 5% order: **0 bps impact** (< 25 bps Conservative budget, < 60 bps Balanced budget)
  - 100% order: **1,149 bps impact** (> 25 bps budget, > 60 bps budget)

---

## 3. The 3 Verified Execution Archetypes (Fresh Receipts)

Fathom is the only autonomous agent system that proves both **what was executed** and **what was refused**.

### Archetype 1: Full Execution within Budget (`EXECUTE_FULL`)
- **Requested Size**: `28,978,010,509,049` wei (0.0000289 WHSK, 5% of vault)
- **Impact Budget**: `60 bps`
- **Simulated Impact**: `0 bps` (< 60 bps)
- **Decision**: `EXECUTE_FULL` (`reasonCode: OK`)
- **On-Chain Transaction**: [`0x99a32cb86b54c7fa4282356a151a3bd27c978d841037264b83f0f116428c826b`](https://testnet-explorer.hskchain.net/tx/0x99a32cb86b54c7fa4282356a151a3bd27c978d841037264b83f0f116428c826b)
- **Block Number**: `35218993`
- **Amount Out Received**: `2` micro-USDT
- **Emitted Event**: `TradeExecuted`

---

### Archetype 2: Trimmed Execution Exceeding Budget / Policy (`EXECUTE_TRIMMED`)
- **Requested Size**: `275,291,099,835,972` wei (0.000275 WHSK, 50% of vault)
- **Impact Budget**: `60 bps`
- **Sizer Action**: Requested size exceeded vault 10% policy ceiling (`maxTradeBps = 1000`); sizer trimmed execution to `55,058,219,967,194` wei (10% of vault, impact 0 bps)
- **Decided Size**: `55,058,219,967,194` wei
- **Decision**: `EXECUTE_TRIMMED` (`reasonCode: 1`, `TRIMMED_TO_FIT`)
- **On-Chain Transaction**: [`0xf01219c8fcd8ce1a1a401208842cde0bae105dd3165c1b5910cad7c64f64a047`](https://testnet-explorer.hskchain.net/tx/0xf01219c8fcd8ce1a1a401208842cde0bae105dd3165c1b5910cad7c64f64a047)
- **Block Number**: `35219005`
- **Amount Out Received**: `4` micro-USDT
- **Emitted Event**: `TradeExecuted(..., reasonCode: 1)`

---

### Archetype 3: On-Chain Refusal Proof (`NO_TRADE`)
- **Requested Size**: `2,500,000,000,000,000` wei (0.0025 WHSK, exceeding pool safe liquidity)
- **Impact Budget**: `25 bps` (Conservative preset)
- **Simulated Impact at Requested**: `1,149 bps` (46x higher than 25 bps budget!)
- **Sizer Action**: Maximum safe size that satisfies 25 bps is below minimum viable fill (20% of requested). Refused completely to preserve capital.
- **Decision**: `NO_TRADE` (`reasonCode: 2`, `IMPACT_TOO_HIGH`)
- **On-Chain Refusal Transaction**: [`0x891566b72dc2e67c2ffc09aa33e11d134084b7ca978d5a9ab2d1fa1ea950205a`](https://testnet-explorer.hskchain.net/tx/0x891566b72dc2e67c2ffc09aa33e11d134084b7ca978d5a9ab2d1fa1ea950205a)
- **Block Number**: `35219016`
- **Emitted Event**: `TradeRejected(reasonCode: 2, tokenIn: 0xCA8aAceEC5Db1e91B9Ed3a344bA026c4a2B3ebF6, tokenOut: 0x721e7fa9fb2446be07ab4a708254f4adcb70e4cf, requestedAmountIn: 2500000000000000, maxSafeAmountIn: 0, impactBpsAtRequested: 1149)`
- **Tokens Moved**: 0 WHSK, 0 tUSDT. Complete protection against 1,149 bps loss.

---

## 4. On-Chain Decoding of Previous Refusal Transactions

Auditing previous transactions (`0x0bad6cdf...` and `0x1f692227...`):

1. **Tx `0x0bad6cdf1bdf07722ccd408cd021dd3285c9a2fa7712bc69b11744c71760b802`**:
   - **Block**: 35218451 | **Status**: Success
   - **Contract Call**: `ExecutionGuard.recordRefusal(intentHash, reasonCode: 2, tokenIn: MockUSDT, tokenOut: WHSK, requestedAmountIn: 17302500000000, maxSafeAmountIn: 0, impactBpsAtRequested: 9969)`
   - **Emitted Event**: `TradeRejected` (reasonCode: 2 → `IMPACT_TOO_HIGH`)
   - **Tokens Moved**: `amountIn = 0, amountOut = 0`.
2. **Tx `0x1f692227c6752604955074f90ac6b4e50ebd9095e319963da24388aa477ae7d8`**:
   - **Block**: 35218461 | **Status**: Success
   - **Contract Call**: `ExecutionGuard.recordRefusal(intentHash, reasonCode: 2, tokenIn: MockUSDT, tokenOut: WHSK, requestedAmountIn: 346050000000000, maxSafeAmountIn: 0, impactBpsAtRequested: 9969)`
   - **Emitted Event**: `TradeRejected` (reasonCode: 2 → `IMPACT_TOO_HIGH`)
   - **Tokens Moved**: `amountIn = 0, amountOut = 0`.

**Explanation**: Both transactions called `recordRefusal` on-chain. Zero tokens were moved because the order was refused (`TradeRejected`). In previous UI versions, the success receipt was mislabeled as an "Execution Receipt"; it is now properly labeled as **"On-Chain Refusal Proof (TradeRejected)"**, and zero/insufficient-balance requests are strictly blocked upfront with `INSUFFICIENT_BALANCE` without displaying a Confirm button.
