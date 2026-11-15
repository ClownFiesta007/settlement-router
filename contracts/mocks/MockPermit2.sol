// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

interface IERC20b { function transferFrom(address,address,uint256) external returns (bool); }

/// @notice Behavioural stand-in for Permit2 covering the two entry points the
///         router uses: batch permit caching an allowance, then transferFrom.
contract MockPermit2 {
    struct TokenPermissions { address token; uint256 amount; }
    struct PermitBatch { TokenPermissions[] permitted; uint256 nonce; uint256 deadline; }

    mapping(address => mapping(address => uint256)) public allowed;

    function permit(address owner, PermitBatch calldata p, bytes calldata) external {
        require(block.timestamp <= p.deadline, "exp");
        for (uint256 i; i < p.permitted.length; ++i) {
            allowed[owner][p.permitted[i].token] = p.permitted[i].amount;
        }
    }

    function transferFrom(address from, address to, uint160 amount, address token) external {
        uint256 a = allowed[from][token];
        require(a >= amount, "allow");
        unchecked { allowed[from][token] = a - amount; }
        require(IERC20b(token).transferFrom(from, to, amount), "tf");
    }
}
