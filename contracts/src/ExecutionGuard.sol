// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

// ─────────────────────────────────────────────────────────────────────────────
//  ExecutionGuard.sol — Fathom · HSK Chain Hackathon 2026
//
//  PURPOSE: A non-custodial vault that lets a designated OPERATOR swap tokens
//  through a single approved HSKSwap router, within strict on-chain policy
//  bounds. The OPERATOR can never withdraw funds, never pick an arbitrary target,
//  and never trade at worse-than-policy prices.
//
//  USP: On-chain minimum-output floor derived from the pool's live spot price,
//  plus a full decision ledger (TradeExecuted + TradeRejected events).
//
//  LABEL: LIVE HSK TESTNET (own-seeded pool) — NOT production liquidity.
//  NOT AUDITED. NOT FINANCIAL ADVICE.
// ─────────────────────────────────────────────────────────────────────────────

import "@openzeppelin/contracts/access/Ownable2Step.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import "./interfaces/ISwapRouter02.sol";
import "./interfaces/IUniswapV3Pool.sol";
import "./lib/TickMathLib.sol";

/// @notice Reason codes — shared between TS and Solidity (same names).
library ReasonCodes {
    uint8 constant OK                  = 0;
    uint8 constant TOKEN_NOT_ALLOWED   = 1;
    uint8 constant PAIR_NOT_ALLOWED    = 2;
    uint8 constant ROUTER_NOT_ALLOWED  = 3;
    uint8 constant AMOUNT_TOO_LARGE    = 4;
    uint8 constant DAILY_CAP_EXCEEDED  = 5;
    uint8 constant COOLDOWN            = 6;
    uint8 constant QUOTE_STALE         = 7;
    uint8 constant DEADLINE_EXPIRED    = 8;
    uint8 constant IMPACT_TOO_HIGH     = 9;
    uint8 constant SLIPPAGE_TOO_HIGH   = 10;
    uint8 constant MIN_OUT_ZERO        = 11;
    uint8 constant MIN_OUT_TOO_LOW     = 12;
    uint8 constant NO_LIQUIDITY        = 13;
    uint8 constant POOL_STATE_CHANGED  = 14;
    uint8 constant NONCE_REPLAY        = 15;
    uint8 constant NOT_OPERATOR        = 16;
    uint8 constant GUARD_PAUSED        = 17;
    uint8 constant INVALID_INTENT      = 18;
    uint8 constant NO_SIGNAL           = 19;
    uint8 constant INSUFFICIENT_BALANCE = 20;
    uint8 constant TRIMMED_TO_FIT      = 21;
}

contract ExecutionGuard is Ownable2Step, Pausable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    // ─── Hard ceilings (cannot be exceeded by setPolicy) ─────────────────────
    uint16 public constant MAX_IMPACT_BPS_CEILING   = 150;  // 1.5%
    uint16 public constant MAX_SLIPPAGE_BPS_CEILING = 100;  // 1.0%
    uint16 public constant MAX_TRADE_BPS_CEILING    = 5000; // 50% of balance

    // ─── Intent struct ────────────────────────────────────────────────────────
    struct Intent {
        uint256 nonce;
        address tokenIn;
        address tokenOut;
        uint256 amountIn;
        uint256 quotedAmountOut;
        uint256 amountOutMin;
        uint256 quoteBlock;
        uint256 deadline;
        uint8   reasonCode;
        bytes32 rationaleHash;
    }

    // ─── Policy ───────────────────────────────────────────────────────────────
    struct Policy {
        uint16  maxTradeBps;        // per-trade cap as % of sellable balance (bps)
        uint256 dailyCapQuote;      // max quote notional per UTC day (quote decimals)
        uint16  maxImpactBps;       // agent's off-chain impact budget
        uint16  maxSlippageBps;     // slippage allowance
        uint16  feeBps;             // pool fee in bps (3000 → 30 bps)
        uint8   maxQuoteAgeBlocks;  // stale-quote check
        uint64  cooldownSeconds;    // min seconds between trades
    }

    // ─── Immutables ───────────────────────────────────────────────────────────
    address public immutable router;
    address public immutable pool;
    address public immutable baseToken;  // WHSK (18 dec)
    address public immutable quoteToken; // tUSDT (6 dec)
    uint24  public immutable feeTier;

    // ─── Mutable state ────────────────────────────────────────────────────────
    Policy internal _policy;
    address public operator;
    uint256 public lastTradeTime;
    mapping(uint256 => bool) public usedNonce;
    mapping(uint256 => uint256) public dayVolume; // UTC day → quote notional

    // ─── Events ───────────────────────────────────────────────────────────────
    event TradeExecuted(
        bytes32 indexed intentHash,
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        uint256 amountOut,
        uint256 quotedAmountOut,
        uint256 amountOutMin,
        uint8   reasonCode,
        bytes32 rationaleHash,
        uint256 blockNumber
    );

    event TradeRejected(
        bytes32 indexed intentHash,
        uint8   reasonCode,
        address tokenIn,
        address tokenOut,
        uint256 requestedAmountIn,
        uint256 maxSafeAmountIn,
        uint256 impactBpsAtRequested,
        uint256 quoteBlock,
        bytes32 rationaleHash
    );

    event PolicyUpdated(Policy newPolicy);
    event OperatorChanged(address oldOperator, address newOperator);

    // ─── Custom errors (names = reason codes) ────────────────────────────────
    error PAIR_NOT_ALLOWED();
    error DEADLINE_EXPIRED();
    error QUOTE_STALE();
    error NONCE_REPLAY();
    error COOLDOWN();
    error AMOUNT_TOO_LARGE();
    error DAILY_CAP_EXCEEDED();
    error MIN_OUT_ZERO();
    error MIN_OUT_TOO_LOW();
    error NOT_OPERATOR();
    error GUARD_PAUSED();
    error INVALID_INTENT();
    error ABOVE_CEILING();
    error ZERO_ADDRESS();
    error SWAP_INSUFFICIENT_OUTPUT();

    // ─── Constructor ─────────────────────────────────────────────────────────
    constructor(
        address _router,
        address _pool,
        address _baseToken,
        address _quoteToken,
        uint24  _feeTier,
        address _operator,
        Policy memory _initialPolicy
    ) Ownable(msg.sender) {
        if (_router == address(0) || _pool == address(0) || _baseToken == address(0) ||
            _quoteToken == address(0) || _operator == address(0)) revert ZERO_ADDRESS();
        _validatePolicy(_initialPolicy);

        router     = _router;
        pool       = _pool;
        baseToken  = _baseToken;
        quoteToken = _quoteToken;
        feeTier    = _feeTier;
        operator   = _operator;
        _policy = _initialPolicy;
    }

    // ─── Modifiers ───────────────────────────────────────────────────────────
    modifier onlyOperator() {
        if (msg.sender != operator) revert NOT_OPERATOR();
        _;
    }

    // ─── Owner functions ─────────────────────────────────────────────────────

    /// @notice Withdraw any token from the vault. Works even when paused.
    function ownerWithdraw(address token, address to, uint256 amount) external onlyOwner {
        if (to == address(0)) revert ZERO_ADDRESS();
        IERC20(token).safeTransfer(to, amount);
    }

    function setPolicy(Policy calldata newPolicy) external onlyOwner {
        _validatePolicy(newPolicy);
        _policy = newPolicy;
        emit PolicyUpdated(newPolicy);
    }

    function setOperator(address _operator) external onlyOwner {
        if (_operator == address(0)) revert ZERO_ADDRESS();
        emit OperatorChanged(operator, _operator);
        operator = _operator;
    }

    /// @notice Owner OR operator can pause.
    function pause() external {
        if (msg.sender != owner() && msg.sender != operator) revert NOT_OPERATOR();
        _pause();
    }

    /// @notice Only owner can unpause.
    function unpause() external onlyOwner {
        _unpause();
    }

    // ─── Core execution ──────────────────────────────────────────────────────

    /**
     * @notice Execute a swap through the approved router within policy bounds.
     *         The recipient is always address(this) — operator cannot withdraw.
     *
     * @dev    Checks (in order):
     *         1. pair allowed
     *         2. deadline
     *         3. quote freshness
     *         4. nonce replay
     *         5. cooldown
     *         6. per-trade size cap
     *         7. daily cap
     *         8. amountOutMin > 0
     *         9. ON-CHAIN FLOOR: amountOutMin >= idealOut * (10000 - fee - impact - slippage) / 10000
     *        10. execute swap; verify output >= amountOutMin; update state
     */
    function executeSwap(Intent calldata intent)
        external
        nonReentrant
        whenNotPaused
        onlyOperator
    {
        // 1. Pair check
        bool baseToQuote = (intent.tokenIn == baseToken && intent.tokenOut == quoteToken);
        bool quoteToBase = (intent.tokenIn == quoteToken && intent.tokenOut == baseToken);
        if (!baseToQuote && !quoteToBase) revert PAIR_NOT_ALLOWED();

        // 2. Deadline (guard-enforced; SwapRouter02 has no deadline field)
        if (block.timestamp > intent.deadline) revert DEADLINE_EXPIRED();

        // 3. Quote freshness
        if (block.number - intent.quoteBlock > _policy.maxQuoteAgeBlocks) revert QUOTE_STALE();

        // 4. Nonce replay
        if (usedNonce[intent.nonce]) revert NONCE_REPLAY();

        // 5. Cooldown
        if (block.timestamp < lastTradeTime + _policy.cooldownSeconds) revert COOLDOWN();

        // 6. Per-trade size cap
        if (intent.amountIn == 0) revert AMOUNT_TOO_LARGE();
        uint256 balance = IERC20(intent.tokenIn).balanceOf(address(this));
        uint256 maxAllowed = balance * _policy.maxTradeBps / 10_000;
        if (intent.amountIn > maxAllowed) revert AMOUNT_TOO_LARGE();

        // 7. Daily cap (approximate: convert amountIn to quote if trading base→quote)
        uint256 notionalQuote = _approxNotionalInQuote(intent.tokenIn, intent.amountIn);
        uint256 today = block.timestamp / 1 days;
        if (dayVolume[today] + notionalQuote > _policy.dailyCapQuote) revert DAILY_CAP_EXCEEDED();

        // 8. Min out non-zero
        if (intent.amountOutMin == 0) revert MIN_OUT_ZERO();

        // 9. On-chain floor check
        uint256 idealOut = idealOutAtSpot(intent.tokenIn, intent.amountIn);
        // floor = idealOut * (10000 - feeBps - maxImpactBps - maxSlippageBps) / 10000
        uint256 floorBps = 10_000
            - uint256(_policy.feeBps)
            - uint256(_policy.maxImpactBps)
            - uint256(_policy.maxSlippageBps);
        uint256 floor = idealOut * floorBps / 10_000;
        if (intent.amountOutMin < floor) revert MIN_OUT_TOO_LOW();

        // 10. Execute
        bytes32 iHash = _intentHash(intent);
        usedNonce[intent.nonce] = true;

        uint256 outBefore = IERC20(intent.tokenOut).balanceOf(address(this));

        IERC20(intent.tokenIn).forceApprove(router, intent.amountIn);

        ISwapRouter02(router).exactInputSingle(
            ISwapRouter02.ExactInputSingleParams({
                tokenIn:           intent.tokenIn,
                tokenOut:          intent.tokenOut,
                fee:               feeTier,
                recipient:         address(this),
                amountIn:          intent.amountIn,
                amountOutMinimum:  intent.amountOutMin,
                sqrtPriceLimitX96: 0
            })
        );

        // Reset approval immediately
        IERC20(intent.tokenIn).forceApprove(router, 0);

        uint256 amountOut = IERC20(intent.tokenOut).balanceOf(address(this)) - outBefore;
        if (amountOut < intent.amountOutMin) revert SWAP_INSUFFICIENT_OUTPUT();

        // Update state
        lastTradeTime = block.timestamp;
        dayVolume[today] += notionalQuote;

        emit TradeExecuted(
            iHash,
            intent.tokenIn,
            intent.tokenOut,
            intent.amountIn,
            amountOut,
            intent.quotedAmountOut,
            intent.amountOutMin,
            intent.reasonCode,
            intent.rationaleHash,
            block.number
        );
    }

    /**
     * @notice Record a refusal decision on-chain. No token movement.
     *         Operator only (proof that the agent rejected the trade).
     */
    function recordRefusal(
        bytes32 intentHash,
        uint8   reasonCode,
        address tokenIn,
        address tokenOut,
        uint256 requestedAmountIn,
        uint256 maxSafeAmountIn,
        uint256 impactBpsAtRequested,
        uint256 quoteBlock,
        bytes32 rationaleHash
    ) external onlyOperator {
        emit TradeRejected(
            intentHash,
            reasonCode,
            tokenIn,
            tokenOut,
            requestedAmountIn,
            maxSafeAmountIn,
            impactBpsAtRequested,
            quoteBlock,
            rationaleHash
        );
    }

    // ─── Views ────────────────────────────────────────────────────────────────

    /**
     * @notice Compute the "ideal" output if there were zero price impact and no fee.
     *         Uses the pool's current sqrtPriceX96 (slot0).
     *
     *         In Uniswap V3:
     *           sqrtPriceX96 = sqrt(token1_raw / token0_raw) * 2^96
     *         The raw price P_raw = (sqrtPriceX96)^2 / 2^192 already converts between
     *         token0 raw units and token1 raw units.
     *         Token decimals (e.g. WHSK 18 vs USDT 6) are inherently captured in the pool's
     *         raw reserves and sqrtPriceX96, so no manual 10^12 scaling is applied to raw swaps.
     *
     *         Live Mainnet read (Pool 0x4ff515761864e7838b0adb8b5b2b8b7a068905dc):
     *           token0: WHSK (18 dec)
     *           token1: USDT (6 dec)
     *           slot0.sqrtPriceX96 = 23440559369646041157550
     *           Human price = 0.087534 USDT / WHSK
     *           amountIn = 1 WHSK (1e18) -> idealOut = 87,534 micro-USDT (0.087534 USDT)
     */
    function idealOutAtSpot(address tokenIn, uint256 amountIn)
        public view returns (uint256 idealOut)
    {
        (uint160 sqrtPriceX96,,,,,,) = IUniswapV3Pool(pool).slot0();
        require(sqrtPriceX96 > 0, "pool not initialized");

        address token0 = IUniswapV3Pool(pool).token0();

        if (tokenIn == baseToken) {
            // Selling base -> get quote
            if (token0 == baseToken) {
                // token0=base, token1=quote: idealOut = amountIn * sqrtP^2 / 2^192
                idealOut = _mulDivQ96(amountIn, uint256(sqrtPriceX96));
            } else {
                // token0=quote, token1=base: idealOut = amountIn * 2^192 / sqrtP^2
                idealOut = _mulDivQ96Inv(amountIn, uint256(sqrtPriceX96));
            }
        } else {
            // Selling quote -> get base
            if (token0 == baseToken) {
                // token0=base, token1=quote: idealOut = amountIn * 2^192 / sqrtP^2
                idealOut = _mulDivQ96Inv(amountIn, uint256(sqrtPriceX96));
            } else {
                // token0=quote, token1=base: idealOut = amountIn * sqrtP^2 / 2^192
                idealOut = _mulDivQ96(amountIn, uint256(sqrtPriceX96));
            }
        }
    }

    function getPolicy() external view returns (Policy memory) {
        return _policy;
    }

    // ─── Internal helpers ────────────────────────────────────────────────────

    /// @dev Computes amountIn * sqrtP^2 / 2^192 in full 512-bit precision.
    function _mulDivQ96(uint256 amountIn, uint256 sqrtP)
        internal pure returns (uint256)
    {
        uint256 mid = mulDiv(amountIn, sqrtP, 1 << 96);
        return mulDiv(mid, sqrtP, 1 << 96);
    }

    /// @dev Computes amountIn * 2^192 / sqrtP^2 in full 512-bit precision.
    function _mulDivQ96Inv(uint256 amountIn, uint256 sqrtP)
        internal pure returns (uint256)
    {
        uint256 num = (1 << 96);
        uint256 step1 = mulDiv(num, num, sqrtP); // 2^192 / sqrtP
        return mulDiv(amountIn, step1, sqrtP);
    }

    /// @dev 512-bit safe mulDiv (Uniswap-style).
    function mulDiv(uint256 a, uint256 b, uint256 denominator)
        internal pure returns (uint256 result)
    {
        require(denominator > 0, "div by zero");
        uint256 prod0 = a * b;
        uint256 prod1;
        assembly {
            let mm := mulmod(a, b, not(0))
            prod1 := sub(sub(mm, prod0), lt(mm, prod0))
        }
        if (prod1 == 0) {
            result = prod0 / denominator;
            return result;
        }
        require(prod1 < denominator, "overflow");
        uint256 remainder;
        assembly { remainder := mulmod(a, b, denominator) }
        assembly { prod1 := sub(prod1, gt(remainder, prod0)) }
        assembly { prod0 := sub(prod0, remainder) }
        uint256 twos = (0 - denominator) & denominator;
        assembly { denominator := div(denominator, twos) }
        assembly { prod0 := div(prod0, twos) }
        assembly {
            twos := add(div(sub(0, twos), twos), 1)
        }
        prod0 |= prod1 * twos;
        uint256 inv = (3 * denominator) ^ 2;
        inv *= 2 - denominator * inv;
        inv *= 2 - denominator * inv;
        inv *= 2 - denominator * inv;
        inv *= 2 - denominator * inv;
        inv *= 2 - denominator * inv;
        inv *= 2 - denominator * inv;
        result = prod0 * inv;
    }

    /// @dev Approximate quote notional for daily cap check.
    ///      If selling base, notional ≈ amountIn converted at spot.
    ///      If selling quote, notional = amountIn (already in quote units).
    function _approxNotionalInQuote(address tokenIn, uint256 amountIn)
        internal view returns (uint256)
    {
        if (tokenIn == quoteToken) return amountIn;
        // tokenIn == baseToken: convert at spot
        return idealOutAtSpot(tokenIn, amountIn);
    }

    function _intentHash(Intent calldata intent) internal view returns (bytes32) {
        return keccak256(abi.encode(
            block.chainid,
            address(this),
            intent.nonce,
            intent.tokenIn,
            intent.tokenOut,
            intent.amountIn,
            intent.quotedAmountOut,
            intent.amountOutMin,
            intent.quoteBlock,
            intent.deadline
        ));
    }

    function _validatePolicy(Policy memory p) internal pure {
        if (p.maxImpactBps > MAX_IMPACT_BPS_CEILING)   revert ABOVE_CEILING();
        if (p.maxSlippageBps > MAX_SLIPPAGE_BPS_CEILING) revert ABOVE_CEILING();
        if (p.maxTradeBps > MAX_TRADE_BPS_CEILING)     revert ABOVE_CEILING();
    }
}
