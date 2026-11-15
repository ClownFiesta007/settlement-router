// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/// @notice Test token. The `domain` flag picks the behaviour, so one mock can
///         emulate USDT (no EIP-712 domain) or an EIP-2612 token.
contract MockERC20 {
    string public name;
    string public symbol;
    uint8  public immutable decimals;
    bool   public immutable hasDomain;

    uint256 public totalSupply;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;
    mapping(address => uint256) public nonces;

    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);

    constructor(string memory n, string memory s, uint8 d, bool domain_) {
        name = n; symbol = s; decimals = d; hasDomain = domain_;
    }

    function DOMAIN_SEPARATOR() external view returns (bytes32) {
        return keccak256(abi.encode("MOCK_DOMAIN", block.chainid, address(this)));
    }

    function mint(address to, uint256 amt) external {
        totalSupply += amt;
        unchecked { balanceOf[to] += amt; }
        emit Transfer(address(0), to, amt);
    }

    function approve(address sp, uint256 amt) external returns (bool) {
        allowance[msg.sender][sp] = amt;
        emit Approval(msg.sender, sp, amt);
        return true;
    }

    function transfer(address to, uint256 amt) external returns (bool) {
        _move(msg.sender, to, amt);
        return true;
    }

    function transferFrom(address f, address to, uint256 amt) external returns (bool) {
        uint256 a = allowance[f][msg.sender];
        if (a != type(uint256).max) {
            require(a >= amt, "allowance");
            unchecked { allowance[f][msg.sender] = a - amt; }
        }
        _move(f, to, amt);
        return true;
    }

    /// @dev Accepts any signature so routing can be tested without EIP-712 replay.
    function permit(address o, address sp, uint256 val, uint256, uint8, bytes32, bytes32) external {
        allowance[o][sp] = val;
        emit Approval(o, sp, val);
    }

    function _move(address f, address to, uint256 amt) internal {
        uint256 b = balanceOf[f];
        require(b >= amt, "balance");
        unchecked { balanceOf[f] = b - amt; balanceOf[to] += amt; }
        emit Transfer(f, to, amt);
    }
}
