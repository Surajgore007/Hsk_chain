# DEPTHGUARD — ON-CHAIN VERIFICATION EVIDENCE

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

## 2. On-Chain Price Parity & Decimals Verification

- **Mainnet Pool (Chain 177, read-only)**: `0x4ff515761864e7838b0adb8b5b2b8b7a068905dc`
  - Token0: WHSK (18 decimals), Token1: USDT (6 decimals)
  - Slot0 sqrtPriceX96: `23440559369646041157550`
  - Derived Human Spot Price: **$0.087534 USDT / WHSK**
  - Independent Cross-Check: Verified on CoinGecko & CoinMarketCap (~$0.087–$0.088).
- **Testnet Pool (Chain 133)**: `0xe0f494ef52eacebb42cdb11a03a2e9e43fbfdfaf`
  - Token0: MockUSDT (6 decimals), Token1: WHSK (18 decimals)
  - Initialized at reciprocal sqrtPriceX96: `267788052170594029335402890420021020`
  - Floor Parity Verified: Contract `idealOutAtSpot` matches TypeScript `idealOut` exactly with zero divergence.

---

## 3. The 3 Verified Execution Archetypes

DepthGuard is the only autonomous agent system that proves both **what was executed** and **what was refused**.

### Archetype 1: Full Execution within Budget (`EXECUTE_FULL`)
- **Requested Size**: `25,000,000,000,000` wei (0.000025 WHSK)
- **Impact Budget**: `100 bps`
- **Decision**: `EXECUTE_FULL`
- **On-Chain Transaction**: [`0x3ebf114cff089a60538e0742ab3ce92046e2441c8de03bf49e1e4d0660d3f34d`](https://testnet-explorer.hskchain.net/tx/0x3ebf114cff089a60538e0742ab3ce92046e2441c8de03bf49e1e4d0660d3f34d)
- **Block Number**: `35217168`
- **Gas Used**: `181094`
- **Amount Out Received**: `2` micro-USDT
- **Emitted Event**: `TradeExecuted(tokenIn: 0xCA8aAceEC5Db1e91B9Ed3a344bA026c4a2B3ebF6, tokenOut: 0x721e7fa9fb2446be07ab4a708254f4adcb70e4cf, amountIn: 25000000000000, amountOut: 2)`

---

### Archetype 2: Trimmed Execution Exceeding Budget (`EXECUTE_TRIMMED`)
- **Requested Size**: `76,900,000,000,000` wei (Exceeds 10% policy cap!)
- **Impact Budget**: `150 bps`
- **Sizer Action**: Binary-searched depth curve and trimmed size to safe capacity.
- **Decided Size**: `38,450,000,000,000` wei
- **Decision**: `EXECUTE_TRIMMED` (`reasonCode: 1`)
- **On-Chain Transaction**: [`0xc6fe12f95cf71bf328c219fbe739b4563ff794d8c32367f38235db85e4614324`](https://testnet-explorer.hskchain.net/tx/0xc6fe12f95cf71bf328c219fbe739b4563ff794d8c32367f38235db85e4614324)
- **Block Number**: `35217180`
- **Gas Used**: `181116`
- **Amount Out Received**: `3` micro-USDT
- **Emitted Event**: `TradeExecuted(tokenIn: 0xCA8aAceEC5Db1e91B9Ed3a344bA026c4a2B3ebF6, tokenOut: 0x721e7fa9fb2446be07ab4a708254f4adcb70e4cf, amountIn: 38450000000000, amountOut: 3, reasonCode: 1)`

---

### Archetype 3: On-Chain Refusal (`NO_TRADE`)
- **Requested Size**: `5,000,000,000,000,000,000` wei (5 WHSK)
- **Impact Budget**: `25 bps` (Conservative preset)
- **Sizer Action**: Refused transaction because maximum safe size is below viable threshold.
- **Decision**: `NO_TRADE` (`reasonCode: 2`, `IMPACT_TOO_HIGH`)
- **On-Chain Refusal Transaction**: [`0xc6c43a9522331b980502b8d7cf8c08d6eb52b60fca641d64f82e5ac8a5f50633`](https://testnet-explorer.hskchain.net/tx/0xc6c43a9522331b980502b8d7cf8c08d6eb52b60fca641d64f82e5ac8a5f50633)
- **Block Number**: `35217182`
- **Gas Used**: `29192`
- **Emitted Event**: `TradeRejected(reasonCode: 2, tokenIn: 0xCA8aAceEC5Db1e91B9Ed3a344bA026c4a2B3ebF6, tokenOut: 0x721e7fa9fb2446be07ab4a708254f4adcb70e4cf, requestedAmountIn: 5000000000000000000)`
- **Significance**: Proof that an autonomous AI agent can enforce cryptographically auditable refusal records on-chain without exposing user funds to catastrophic slippage.

---

## 4. Market Mover Verification

- **Mover Account**: `0x847A7Cb9B6A090Fc847d31fcf0CEec9867A17D74`
- **Price Shift Action**: MOVER swapped WHSK for USDT via SwapRouter02
- **Pool Shift Tx**: [`0x13638307c26edf523ad9a94f9036467a054e168196cc584a45a194c937f7fde6`](https://testnet-explorer.hskchain.net/tx/0x13638307c26edf523ad9a94f9036467a054e168196cc584a45a194c937f7fde6)
- **Block Number**: `35216959`
- **Measured Pool Move**: -530.5 bps discount vs HSK Mainnet reference price
