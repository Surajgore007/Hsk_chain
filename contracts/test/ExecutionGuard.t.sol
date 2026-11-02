// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "../src/ExecutionGuard.sol";
import "../src/mocks/MockUSDT.sol";
import "../src/mocks/MockRouter.sol";
import "../src/mocks/MockPool.sol";

/**
 * ExecutionGuardTest — comprehensive test suite for ExecutionGuard.sol
 *
 * LABEL: LOCAL MOCK (not HSK) — uses mock router/pool/tokens.
 * Each test that calls executeSwap must handle the cooldown (30 s).
 * Use `_skipCooldown()` before any second swap in the same test.
 */
contract ExecutionGuardTest is Test {
    ExecutionGuard public guard;
    MockRouter     public mockRouter;
    MockPool       public pool;
    MockUSDT       public base;  // WHSK mock (18 dec)
    MockUSDT       public quote; // tUSDT mock (6 dec)

    address public owner    = address(0x1000);
    address public operator = address(0x2000);
    address public stranger = address(0x3000);

    // Real live HSK Mainnet snapshot (Pool 0x4ff5... slot0.sqrtPriceX96):
    // sqrtPriceX96 = 23440559369646041157550
    // token0 = WHSK (18 dec), token1 = USDT (6 dec)
    // Human price = 0.087534 USDT per WHSK
    // 1 WHSK (1e18) -> 87,534 micro-USDT (0.087534 USDT)
    uint160 constant SQRT_PRICE = 23440559369646041157550;

    // Router output ratio: 1e18 WHSK -> 87,534 micro-USDT
    uint256 constant ROUTER_OUTPUT_RATIO = 87_534;

    ExecutionGuard.Policy public pol;

    function setUp() public {
        vm.startPrank(owner);

        base  = new MockUSDT("Wrapped HSK", "WHSK", 18);
        quote = new MockUSDT("Mock USDT", "tUSDT", 6);

        pool = new MockPool(address(base), address(quote), 3000);
        pool.setSqrtPrice(SQRT_PRICE);
        pool.setLiquidity(1_000_000e18);

        // Router returns exactly ROUTER_OUTPUT_RATIO * amountIn / 1e18 of output token
        mockRouter = new MockRouter(ROUTER_OUTPUT_RATIO);

        // Fund router with quote tokens (for base→quote swaps)
        // 1 WHSK → 1e6 tUSDT, we'll swap up to 250 WHSK → 250e6 tUSDT
        quote.mint(address(mockRouter), 1_000_000e6);
        base.mint(address(mockRouter),  1_000_000e18);

        pol = ExecutionGuard.Policy({
            maxTradeBps:      2500,     // 25% per trade
            dailyCapQuote:    100_000e6, // 100k tUSDT/day
            maxImpactBps:     60,
            maxSlippageBps:   50,
            feeBps:           30,
            maxQuoteAgeBlocks: 5,
            cooldownSeconds:  30
        });

        guard = new ExecutionGuard(
            address(mockRouter),
            address(pool),
            address(base),
            address(quote),
            3000,
            operator,
            pol
        );

        // Fund the guard with initial balances
        base.mint(address(guard),  1000e18);
        quote.mint(address(guard), 1000e6);

        vm.stopPrank();

        // Ensure block.number is reasonable to avoid underflow in stale check
        vm.roll(100);
        vm.warp(100_000);
    }

    // ─── Helpers ──────────────────────────────────────────────────────────────

    function _skipCooldown() internal {
        vm.warp(block.timestamp + 31);
    }

    /// Build a valid intent. Uses the guard's idealOutAtSpot to compute amountOutMin
    /// exactly at the floor (so it always passes the floor check if pool is consistent).
    function _makeIntent(
        uint256 nonce,
        address tokenIn,
        address tokenOut,
        uint256 amountIn
    ) internal view returns (ExecutionGuard.Intent memory) {
        uint256 idealOut_ = guard.idealOutAtSpot(tokenIn, amountIn);
        ExecutionGuard.Policy memory p = guard.getPolicy();
        uint256 floorBps = 10_000 - uint256(p.feeBps) - uint256(p.maxImpactBps) - uint256(p.maxSlippageBps);
        uint256 amountOutMin = idealOut_ * floorBps / 10_000;

        return ExecutionGuard.Intent({
            nonce:           nonce,
            tokenIn:         tokenIn,
            tokenOut:        tokenOut,
            amountIn:        amountIn,
            quotedAmountOut: idealOut_,
            amountOutMin:    amountOutMin,
            quoteBlock:      uint256(vm.getBlockNumber()),
            deadline:        vm.getBlockTimestamp() + 300,
            reasonCode:      0,
            rationaleHash:   bytes32(0)
        });
    }

    // ─── Policy: owner can set ────────────────────────────────────────────────

    function test_OwnerCanSetPolicy() public {
        vm.prank(owner);
        ExecutionGuard.Policy memory newPol = pol;
        newPol.maxTradeBps = 1000;
        guard.setPolicy(newPol);
        assertEq(guard.getPolicy().maxTradeBps, 1000);
    }

    function test_NonOwnerCannotSetPolicy() public {
        vm.prank(stranger);
        vm.expectRevert();
        guard.setPolicy(pol);
    }

    function test_AboveCeilingImpactReverts() public {
        vm.prank(owner);
        ExecutionGuard.Policy memory p = pol;
        p.maxImpactBps = 200; // > 150 ceiling
        vm.expectRevert(ExecutionGuard.ABOVE_CEILING.selector);
        guard.setPolicy(p);
    }

    function test_AboveCeilingSlippageReverts() public {
        vm.prank(owner);
        ExecutionGuard.Policy memory p = pol;
        p.maxSlippageBps = 150; // > 100 ceiling
        vm.expectRevert(ExecutionGuard.ABOVE_CEILING.selector);
        guard.setPolicy(p);
    }

    function test_AboveCeilingTradeBpsReverts() public {
        vm.prank(owner);
        ExecutionGuard.Policy memory p = pol;
        p.maxTradeBps = 6000; // > 5000 ceiling
        vm.expectRevert(ExecutionGuard.ABOVE_CEILING.selector);
        guard.setPolicy(p);
    }

    // ─── Access control ───────────────────────────────────────────────────────

    function test_StrangerCannotExecuteSwap() public {
        ExecutionGuard.Intent memory intent = _makeIntent(1, address(base), address(quote), 10e18);
        vm.prank(stranger);
        vm.expectRevert(ExecutionGuard.NOT_OPERATOR.selector);
        guard.executeSwap(intent);
    }

    function test_OperatorCannotWithdraw() public {
        vm.prank(operator);
        vm.expectRevert();
        guard.ownerWithdraw(address(base), operator, 1e18);
    }

    function test_OwnerCanWithdrawWhilePaused() public {
        vm.prank(owner);
        guard.pause();
        uint256 balBefore = base.balanceOf(owner);
        vm.prank(owner);
        guard.ownerWithdraw(address(base), owner, 10e18);
        assertEq(base.balanceOf(owner), balBefore + 10e18);
    }

    // ─── Pause ────────────────────────────────────────────────────────────────

    function test_PausedRevertsExecuteSwap() public {
        vm.prank(owner);
        guard.pause();
        ExecutionGuard.Intent memory intent = _makeIntent(1, address(base), address(quote), 10e18);
        vm.prank(operator);
        vm.expectRevert(abi.encodeWithSelector(Pausable.EnforcedPause.selector));
        guard.executeSwap(intent);
    }

    function test_OperatorCanPause() public {
        vm.prank(operator);
        guard.pause();
        assertTrue(guard.paused());
    }

    function test_OnlyOwnerCanUnpause() public {
        vm.prank(owner);
        guard.pause();
        vm.prank(operator);
        vm.expectRevert();
        guard.unpause();
        vm.prank(owner);
        guard.unpause();
        assertFalse(guard.paused());
    }

    // ─── Pair check ───────────────────────────────────────────────────────────

    function test_WrongPairReverts() public {
        address fakeToken = address(new MockUSDT("Fake", "FK", 18));
        ExecutionGuard.Intent memory intent = _makeIntent(1, fakeToken, address(quote), 10e18);
        vm.prank(operator);
        vm.expectRevert(ExecutionGuard.PAIR_NOT_ALLOWED.selector);
        guard.executeSwap(intent);
    }

    // ─── Deadline ─────────────────────────────────────────────────────────────

    function test_ExpiredDeadlineReverts() public {
        ExecutionGuard.Intent memory intent = _makeIntent(1, address(base), address(quote), 10e18);
        intent.deadline = vm.getBlockTimestamp() - 1;
        vm.prank(operator);
        vm.expectRevert(ExecutionGuard.DEADLINE_EXPIRED.selector);
        guard.executeSwap(intent);
    }

    // ─── Stale quote ──────────────────────────────────────────────────────────

    function test_StaleQuoteReverts() public {
        ExecutionGuard.Intent memory intent = _makeIntent(1, address(base), address(quote), 10e18);
        // quoteBlock is several blocks old
        intent.quoteBlock = vm.getBlockNumber() - 10;
        vm.prank(operator);
        vm.expectRevert(ExecutionGuard.QUOTE_STALE.selector);
        guard.executeSwap(intent);
    }

    // ─── Nonce replay ─────────────────────────────────────────────────────────

    function test_NonceReplayReverts() public {
        ExecutionGuard.Intent memory intent = _makeIntent(42, address(base), address(quote), 1e18);
        vm.prank(operator);
        guard.executeSwap(intent);

        _skipCooldown();
        // Re-sign with same nonce
        intent.quoteBlock = uint256(vm.getBlockNumber());
        intent.deadline   = vm.getBlockTimestamp() + 300;
        vm.prank(operator);
        vm.expectRevert(ExecutionGuard.NONCE_REPLAY.selector);
        guard.executeSwap(intent);
    }

    // ─── Cooldown ────────────────────────────────────────────────────────────

    function test_CooldownReverts() public {
        ExecutionGuard.Intent memory intent1 = _makeIntent(1, address(base), address(quote), 1e18);
        vm.prank(operator);
        guard.executeSwap(intent1);

        // Immediately try again (within cooldown)
        ExecutionGuard.Intent memory intent2 = _makeIntent(2, address(base), address(quote), 1e18);
        vm.prank(operator);
        vm.expectRevert(ExecutionGuard.COOLDOWN.selector);
        guard.executeSwap(intent2);
    }

    function test_CooldownPassesAfterTime() public {
        ExecutionGuard.Intent memory intent1 = _makeIntent(1, address(base), address(quote), 1e18);
        vm.prank(operator);
        guard.executeSwap(intent1);
        _skipCooldown();
        ExecutionGuard.Intent memory intent2 = _makeIntent(2, address(base), address(quote), 1e18);
        vm.prank(operator);
        guard.executeSwap(intent2);
    }

    // ─── Per-trade cap ────────────────────────────────────────────────────────

    function test_AmountTooLargeReverts() public {
        // balance = 1000e18; 25% = 250e18; try 300e18 → should revert
        ExecutionGuard.Intent memory intent = _makeIntent(1, address(base), address(quote), 300e18);
        vm.prank(operator);
        vm.expectRevert(ExecutionGuard.AMOUNT_TOO_LARGE.selector);
        guard.executeSwap(intent);
    }

    function test_AmountExactlyAtCapSucceeds() public {
        // 25% of 1000e18 = 250e18 — exactly at cap
        ExecutionGuard.Intent memory intent = _makeIntent(1, address(base), address(quote), 250e18);
        vm.prank(operator);
        guard.executeSwap(intent);
    }

    // ─── Min out zero ─────────────────────────────────────────────────────────

    function test_MinOutZeroReverts() public {
        ExecutionGuard.Intent memory intent = _makeIntent(1, address(base), address(quote), 10e18);
        intent.amountOutMin = 0;
        vm.prank(operator);
        vm.expectRevert(ExecutionGuard.MIN_OUT_ZERO.selector);
        guard.executeSwap(intent);
    }

    // ─── Floor violation ─────────────────────────────────────────────────────

    function test_MinOutTooLowReverts() public {
        ExecutionGuard.Intent memory intent = _makeIntent(1, address(base), address(quote), 10e18);
        intent.amountOutMin = 1; // absurdly low but non-zero
        vm.prank(operator);
        vm.expectRevert(ExecutionGuard.MIN_OUT_TOO_LOW.selector);
        guard.executeSwap(intent);
    }

    function test_FloorExactBoundarySucceeds() public {
        // amountOutMin exactly at floor → should pass guard check
        // (Router returns ROUTER_OUTPUT_RATIO * amountIn / 1e18 which may or may not be ≥ floor)
        uint256 amountIn = 10e18;
        uint256 idealOut_ = guard.idealOutAtSpot(address(base), amountIn);
        uint256 floorBps  = 10_000 - 30 - 60 - 50; // 9860
        uint256 floorAmt  = idealOut_ * floorBps / 10_000;

        ExecutionGuard.Intent memory intent = ExecutionGuard.Intent({
            nonce:           99,
            tokenIn:         address(base),
            tokenOut:        address(quote),
            amountIn:        amountIn,
            quotedAmountOut: idealOut_,
            amountOutMin:    floorAmt,
            quoteBlock:      uint256(vm.getBlockNumber()),
            deadline:        vm.getBlockTimestamp() + 300,
            reasonCode:      0,
            rationaleHash:   bytes32(0)
        });

        // The router returns 10e18 * 1e6 / 1e18 = 1e6 tUSDT.
        // The floor = 1e6 * 9860 / 10000 = 986000.
        // Router output = 1e6 >= floor (986000) ✓
        vm.prank(operator);
        guard.executeSwap(intent);
    }

    // ─── Success path ─────────────────────────────────────────────────────────

    function test_SuccessEmitsTradeExecuted() public {
        ExecutionGuard.Intent memory intent = _makeIntent(1, address(base), address(quote), 10e18);
        vm.recordLogs();
        vm.prank(operator);
        guard.executeSwap(intent);

        Vm.Log[] memory logs = vm.getRecordedLogs();
        bool found = false;
        for (uint i = 0; i < logs.length; i++) {
            // TradeExecuted(bytes32 indexed intentHash, ...)
            if (logs[i].topics[0] == keccak256("TradeExecuted(bytes32,address,address,uint256,uint256,uint256,uint256,uint8,bytes32,uint256)")) {
                found = true;
                break;
            }
        }
        assertTrue(found, "TradeExecuted event not emitted");
    }

    function test_NoTokenMovementOnRefusal() public {
        uint256 baseBefore  = base.balanceOf(address(guard));
        uint256 quoteBefore = quote.balanceOf(address(guard));

        vm.prank(operator);
        guard.recordRefusal(
            bytes32(uint256(1)), 9,
            address(base), address(quote),
            100e18, 40e18, 184, vm.getBlockNumber(), bytes32(0)
        );

        assertEq(base.balanceOf(address(guard)),  baseBefore);
        assertEq(quote.balanceOf(address(guard)), quoteBefore);
    }

    function test_RecordRefusalEmitsTradeRejected() public {
        vm.recordLogs();
        vm.prank(operator);
        guard.recordRefusal(
            bytes32(uint256(1)), 9,
            address(base), address(quote),
            100e18, 40e18, 184, vm.getBlockNumber(), bytes32(0)
        );
        Vm.Log[] memory logs = vm.getRecordedLogs();
        bool found = false;
        for (uint i = 0; i < logs.length; i++) {
            if (logs[i].topics[0] == keccak256("TradeRejected(bytes32,uint8,address,address,uint256,uint256,uint256,uint256,bytes32)")) {
                found = true;
                break;
            }
        }
        assertTrue(found, "TradeRejected event not emitted");
    }

    function test_SuccessfulTradeDecreasesBaseBalance() public {
        uint256 amountIn = 10e18;
        uint256 baseBefore = base.balanceOf(address(guard));
        ExecutionGuard.Intent memory intent = _makeIntent(1, address(base), address(quote), amountIn);
        vm.prank(operator);
        guard.executeSwap(intent);
        // Guard lost exactly amountIn of base
        assertEq(base.balanceOf(address(guard)), baseBefore - amountIn);
    }

    function test_UsedNonceSetAfterTrade() public {
        uint256 nonce = 77;
        ExecutionGuard.Intent memory intent = _makeIntent(nonce, address(base), address(quote), 1e18);
        vm.prank(operator);
        guard.executeSwap(intent);
        assertTrue(guard.usedNonce(nonce));
    }

    function test_LastTradeTimeUpdated() public {
        assertEq(guard.lastTradeTime(), 0);
        ExecutionGuard.Intent memory intent = _makeIntent(1, address(base), address(quote), 1e18);
        vm.prank(operator);
        guard.executeSwap(intent);
        assertEq(guard.lastTradeTime(), vm.getBlockTimestamp());
    }

    // ─── idealOutAtSpot math check ────────────────────────────────────────────

    function test_IdealOutAtSpotConsistency() public view {
        // With real HSK Mainnet SQRT_PRICE = 23440559369646041157550:
        // Human price = 0.087534 USDT / WHSK
        // 1 WHSK (1e18) -> 87,534 micro-USDT (0.087534 USDT, 6 decimals)
        uint256 amountIn = 1e18;
        uint256 out = guard.idealOutAtSpot(address(base), amountIn);
        assertEq(out, 87_534, "1 WHSK should yield 87534 micro-USDT (~0.0875 USDT)");
    }

    // ─── Fuzz: failed check never moves tokens ────────────────────────────────

    function testFuzz_FailedCheckNeverMovesTokens(uint256 amountIn, uint256 nonceRaw) public {
        amountIn = bound(amountIn, 1, 1000e18);
        nonceRaw = bound(nonceRaw, 10000, type(uint128).max);

        uint256 baseBefore  = base.balanceOf(address(guard));
        uint256 quoteBefore = quote.balanceOf(address(guard));

        ExecutionGuard.Intent memory intent = _makeIntent(nonceRaw, address(base), address(quote), amountIn);
        intent.deadline = vm.getBlockTimestamp() - 1; // force DEADLINE_EXPIRED

        vm.prank(operator);
        try guard.executeSwap(intent) {} catch {}

        assertEq(base.balanceOf(address(guard)),  baseBefore,  "base moved on failure");
        assertEq(quote.balanceOf(address(guard)), quoteBefore, "quote moved on failure");
    }

    // ─── Fuzz: nonce never executes twice ─────────────────────────────────────

    function testFuzz_NonceNeverExecutesTwice(uint256 nonce) public {
        nonce = bound(nonce, 50000, type(uint64).max);
        ExecutionGuard.Intent memory intent = _makeIntent(nonce, address(base), address(quote), 1e18);

        vm.prank(operator);
        guard.executeSwap(intent);
        assertTrue(guard.usedNonce(nonce));

        _skipCooldown();
        intent.quoteBlock = uint256(vm.getBlockNumber());
        intent.deadline   = vm.getBlockTimestamp() + 300;

        vm.prank(operator);
        vm.expectRevert(ExecutionGuard.NONCE_REPLAY.selector);
        guard.executeSwap(intent);
    }

    // ─── Fuzz: successful trade amount ≤ cap ──────────────────────────────────

    function testFuzz_SuccessfulTradeRespectsPerTradeCap(uint256 amountIn) public {
        // At most 25% of 1000e18 = 250e18
        amountIn = bound(amountIn, 1e15, 250e18);
        uint256 nonce = uint256(keccak256(abi.encode(amountIn)));

        uint256 baseBefore = base.balanceOf(address(guard));
        ExecutionGuard.Intent memory intent = _makeIntent(nonce, address(base), address(quote), amountIn);
        vm.prank(operator);
        guard.executeSwap(intent);
        // Guard lost exactly amountIn
        assertEq(base.balanceOf(address(guard)), baseBefore - amountIn);
    }
}
