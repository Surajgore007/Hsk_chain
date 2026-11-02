// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "../interfaces/ISwapRouter02.sol";

/// @notice Configurable mock router for testing ExecutionGuard.
contract MockRouter {
    // Configured output ratio: outputAmount = inputAmount * outputRatio / 1e18
    uint256 public outputRatio;
    bool    public shouldReenter;
    address public targetReenter;
    bytes   public reenterCalldata;

    constructor(uint256 _outputRatio) {
        outputRatio = _outputRatio;
    }

    function setOutputRatio(uint256 _outputRatio) external {
        outputRatio = _outputRatio;
    }

    function setReenter(address target, bytes calldata data) external {
        shouldReenter = true;
        targetReenter = target;
        reenterCalldata = data;
    }

    function clearReenter() external {
        shouldReenter = false;
    }

    function exactInputSingle(ISwapRouter02.ExactInputSingleParams calldata params)
        external payable returns (uint256 amountOut)
    {
        // Pull tokenIn from caller
        IERC20(params.tokenIn).transferFrom(msg.sender, address(this), params.amountIn);

        amountOut = params.amountIn * outputRatio / 1e18;

        if (amountOut < params.amountOutMinimum) {
            revert("MockRouter: insufficient output");
        }

        // Mint output token to recipient
        _mintToken(params.tokenOut, params.recipient, amountOut);

        // Reentrancy attack for testing
        if (shouldReenter && targetReenter != address(0)) {
            (bool ok,) = targetReenter.call(reenterCalldata);
            require(ok, "reenter failed");
        }
    }

    /// @dev Simple token minting for mock purposes — give this contract a balance.
    function depositOutput(address token, uint256 amount) external {
        IERC20(token).transferFrom(msg.sender, address(this), amount);
    }

    function _mintToken(address token, address to, uint256 amount) internal {
        // Transfer from our balance
        IERC20(token).transfer(to, amount);
    }

    function factory() external pure returns (address) {
        return address(0);
    }
}

/// @notice Returns less than amountOutMinimum to trigger SWAP_INSUFFICIENT_OUTPUT.
contract MaliciousRouterLow {
    function exactInputSingle(ISwapRouter02.ExactInputSingleParams calldata params)
        external payable returns (uint256 amountOut)
    {
        IERC20(params.tokenIn).transferFrom(msg.sender, address(this), params.amountIn);
        amountOut = params.amountOutMinimum - 1; // always just below minimum
        // Don't transfer anything — simulates a router that lies
    }

    function factory() external pure returns (address) { return address(0); }
}

