// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "../interfaces/IUniswapV3Pool.sol";

/// @notice Mock pool for unit tests. Configurable sqrtPriceX96.
contract MockPool is IUniswapV3Pool {
    uint160 public sqrtPriceX96;
    address public token0;
    address public token1;
    uint24  public fee;
    uint128 public liquidity;

    constructor(address _token0, address _token1, uint24 _fee) {
        token0 = _token0;
        token1 = _token1;
        fee    = _fee;
    }

    function setSqrtPrice(uint160 _sqrtPriceX96) external {
        sqrtPriceX96 = _sqrtPriceX96;
    }

    function setLiquidity(uint128 _liquidity) external {
        liquidity = _liquidity;
    }

    function slot0() external view returns (
        uint160 _sqrtPriceX96,
        int24   tick,
        uint16  observationIndex,
        uint16  observationCardinality,
        uint16  observationCardinalityNext,
        uint8   feeProtocol,
        bool    unlocked
    ) {
        _sqrtPriceX96         = sqrtPriceX96;
        tick                  = 0;
        observationIndex      = 0;
        observationCardinality = 1;
        observationCardinalityNext = 1;
        feeProtocol           = 0;
        unlocked              = true;
    }

    function increaseObservationCardinalityNext(uint16) external {}
}

