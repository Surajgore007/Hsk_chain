// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IUniswapV3PoolMinimal {
    function token0() external view returns (address);
    function token1() external view returns (address);
    function swap(
        address recipient,
        bool zeroForOne,
        int256 amountSpecified,
        uint160 sqrtPriceLimitX96,
        bytes calldata data
    ) external returns (int256 amount0, int256 amount1);
    function slot0() external view returns (
        uint160 sqrtPriceX96,
        int24 tick,
        uint16 observationIndex,
        uint16 observationCardinality,
        uint16 observationCardinalityNext,
        uint8 feeProtocol,
        bool unlocked
    );
}

interface IUniswapV3FactoryMinimal {
    function getPool(address tokenA, address tokenB, uint24 fee) external view returns (address pool);
}

contract QuoterV2 {
    address public immutable factory;
    address public immutable WETH9;

    struct QuoteExactInputSingleParams {
        address tokenIn;
        address tokenOut;
        uint256 amountIn;
        uint24 fee;
        uint160 sqrtPriceLimitX96;
    }

    constructor(address _factory, address _WETH9) {
        factory = _factory;
        WETH9 = _WETH9;
    }

    function quoteExactInputSingle(QuoteExactInputSingleParams memory params)
        public
        returns (
            uint256 amountOut,
            uint160 sqrtPriceX96After,
            uint32 initializedTicksCrossed,
            uint256 gasEstimate
        )
    {
        bool zeroForOne = params.tokenIn < params.tokenOut;
        address pool = IUniswapV3FactoryMinimal(factory).getPool(params.tokenIn, params.tokenOut, params.fee);
        require(pool != address(0), "Pool not found");

        uint160 sqrtPriceLimitX96 = params.sqrtPriceLimitX96;
        if (sqrtPriceLimitX96 == 0) {
            // MIN_SQRT_RATIO + 1 or MAX_SQRT_RATIO - 1
            sqrtPriceLimitX96 = zeroForOne ? 4295128739 + 1 : 1461446703485210103287273052203988822378723970342 - 1;
        }

        uint256 gasBefore = gasleft();
        try IUniswapV3PoolMinimal(pool).swap(
            address(this),
            zeroForOne,
            int256(params.amountIn),
            sqrtPriceLimitX96,
            abi.encode(params.tokenIn, params.tokenOut, params.fee)
        ) returns (int256 amount0, int256 amount1) {
            int256 amountOutInt = zeroForOne ? -amount1 : -amount0;
            amountOut = amountOutInt > 0 ? uint256(amountOutInt) : 0;
            (sqrtPriceX96After,,,,,,) = IUniswapV3PoolMinimal(pool).slot0();
            gasEstimate = gasBefore - gasleft();
        } catch (bytes memory reason) {
            return parseRevertReason(reason);
        }
    }

    function uniswapV3SwapCallback(
        int256 amount0Delta,
        int256 amount1Delta,
        bytes calldata /* data */
    ) external view {
        (uint160 sqrtPriceX96After,,,,,,) = IUniswapV3PoolMinimal(msg.sender).slot0();
        bool zeroForOne = amount0Delta > 0;
        uint256 amountOut = zeroForOne ? uint256(-amount1Delta) : uint256(-amount0Delta);

        // Revert with output payload to abort swap execution while returning quote
        assembly {
            let ptr := mload(0x40)
            mstore(ptr, amountOut)
            mstore(add(ptr, 0x20), sqrtPriceX96After)
            mstore(add(ptr, 0x40), 0)
            mstore(add(ptr, 0x60), 0)
            revert(ptr, 0x80)
        }
    }

    function parseRevertReason(bytes memory reason)
        internal
        pure
        returns (
            uint256 amountOut,
            uint160 sqrtPriceX96After,
            uint32 initializedTicksCrossed,
            uint256 gasEstimate
        )
    {
        if (reason.length >= 0x80) {
            assembly {
                amountOut := mload(add(reason, 0x20))
                sqrtPriceX96After := mload(add(reason, 0x40))
                initializedTicksCrossed := mload(add(reason, 0x60))
                gasEstimate := mload(add(reason, 0x80))
            }
        } else {
            assembly {
                revert(add(reason, 0x20), mload(reason))
            }
        }
    }
}

