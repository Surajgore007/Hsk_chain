// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

// ⚠ TESTNET ONLY — public mint() function. Remove or disable on mainnet.

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract MockUSDT is ERC20, Ownable {
    uint8 private _decimals;

    constructor(string memory name_, string memory symbol_, uint8 decimals_)
        ERC20(name_, symbol_)
        Ownable(msg.sender)
    {
        _decimals = decimals_;
    }

    function decimals() public view override returns (uint8) {
        return _decimals;
    }

    /// @notice TESTNET ONLY — anyone can mint. Loudly flagged.
    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}

