// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Placeholder — tick math used for TWAP (P1). Not called in P0.
library TickMathLib {
    // Uniswap TickMath constants
    int24 internal constant MIN_TICK = -887272;
    int24 internal constant MAX_TICK =  887272;

    /// @dev Returns the sqrtPriceX96 for a given tick.
    ///      Simplified stub — the full TickMath library from v3-core is imported via remappings.
    function getSqrtRatioAtTick(int24 /*tick*/) internal pure returns (uint160) {
        // Real implementation from @uniswap/v3-core/contracts/libraries/TickMath.sol
        revert("use v3-core TickMath");
    }
}

