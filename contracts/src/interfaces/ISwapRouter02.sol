// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Minimal interface for HSKSwap SwapRouter02 (Uniswap V3 fork).
/// @dev    SwapRouter02 does NOT have a `deadline` field in ExactInputSingleParams.
///         Deadline is enforced by ExecutionGuard before calling this.
interface ISwapRouter02 {
    struct ExactInputSingleParams {
        address tokenIn;
        address tokenOut;
        uint24  fee;
        address recipient;
        uint256 amountIn;
        uint256 amountOutMinimum;
        uint160 sqrtPriceLimitX96;
    }

    function exactInputSingle(ExactInputSingleParams calldata params)
        external payable returns (uint256 amountOut);

    function factory() external view returns (address);
}

