// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title VulnerableVault
/// @notice Fixture contract written for Tendril's own test/demo purposes
/// only — not copied from any specific protocol. It's built to exercise
/// every edge type in Tendril's graph schema (CALLS, READS, WRITES,
/// GUARDED_BY, MOVES_FUNDS) across two distinct structural risk shapes:
///  1. withdraw(): a classic unguarded call-before-state-update pattern.
///  2. redeemAtPrice(): a public, unguarded function whose payout depends
///     on state written by an oracle-role function — the shape
///     Tendril's oracle_dependent_state query is built to surface.
/// sweep() is included as a correctly-guarded control case: a fund-moving
/// function that Tendril's risk-path query should NOT flag as unguarded.
contract VulnerableVault {
    mapping(address => uint256) public balances;
    address public owner;

    /// @notice address allowed to call updatePrice — a minimal stand-in
    /// for an oracle role, not a real price feed integration.
    address public priceOracle;

    /// @notice last price reported by priceOracle, 1e8-scaled to mirror
    /// common oracle feed conventions (e.g. Chainlink).
    uint256 public price;

    event Deposited(address indexed account, uint256 amount);
    event Withdrawn(address indexed account, uint256 amount);
    event Swept(address indexed owner, uint256 amount);
    event PriceUpdated(address indexed oracle, uint256 price);

    constructor(address _priceOracle) {
        owner = msg.sender;
        priceOracle = _priceOracle;
    }

    modifier onlyOwner() {
        require(msg.sender == owner, "not owner");
        _;
    }

    modifier onlyOracle() {
        require(msg.sender == priceOracle, "not oracle");
        _;
    }

    function deposit() external payable {
        balances[msg.sender] += msg.value;
        emit Deposited(msg.sender, msg.value);
    }

    /// @notice public, no modifier guarding it, calls out to msg.sender
    /// before balances[msg.sender] is decremented.
    function withdraw(uint256 amount) external {
        require(balances[msg.sender] >= amount, "insufficient");
        (bool ok, ) = msg.sender.call{value: amount}("");
        require(ok, "transfer failed");
        balances[msg.sender] -= amount;
        emit Withdrawn(msg.sender, amount);
    }

    function sweep() external onlyOwner {
        uint256 bal = address(this).balance;
        payable(owner).transfer(bal);
        emit Swept(owner, bal);
    }

    /// @notice called by the configured oracle to report a new price.
    function updatePrice(uint256 newPrice) external onlyOracle {
        price = newPrice;
        emit PriceUpdated(msg.sender, newPrice);
    }

    /// @notice public, unguarded: pays out an amount scaled by the last
    /// reported price, with no role check on the caller. This is the
    /// "public entry reaches a fund move through oracle-linked state"
    /// shape — price is WRITEs by updatePrice() and READs here.
    function redeemAtPrice(uint256 amount) external {
        require(balances[msg.sender] >= amount, "insufficient");
        balances[msg.sender] -= amount;
        uint256 payout = (amount * price) / 1e8;
        (bool ok, ) = msg.sender.call{value: payout}("");
        require(ok, "transfer failed");
        emit Withdrawn(msg.sender, payout);
    }
}
