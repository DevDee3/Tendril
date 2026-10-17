// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {VulnerableVault} from "../src/VulnerableVault.sol";

/// Legitimate unit tests for every statement/branch in VulnerableVault.
/// These exercise normal and reverting usage only — no attacker contract,
/// no reentrant callback, no sequence that drains funds out of turn.
contract VulnerableVaultTest is Test {
    VulnerableVault vault;

    address owner = address(this);
    address oracle = makeAddr("oracle");
    address alice = makeAddr("alice");
    address bob = makeAddr("bob");

    event Deposited(address indexed account, uint256 amount);
    event Withdrawn(address indexed account, uint256 amount);
    event Swept(address indexed owner, uint256 amount);
    event PriceUpdated(address indexed oracle, uint256 price);

    function setUp() public {
        vault = new VulnerableVault(oracle);
        vm.deal(alice, 10 ether);
        vm.deal(bob, 10 ether);
        // this test contract originates the pranked calls below, so it needs
        // its own balance to cover the ETH value it sends on rejecter's behalf
        vm.deal(address(this), 10 ether);
    }

    // --- constructor ---

    function test_ConstructorSetsOwnerAndOracle() public view {
        assertEq(vault.owner(), owner);
        assertEq(vault.priceOracle(), oracle);
    }

    // --- deposit() ---

    function test_DepositIncreasesBalance() public {
        vm.expectEmit(true, false, false, true, address(vault));
        emit Deposited(alice, 1 ether);

        vm.prank(alice);
        vault.deposit{value: 1 ether}();
        assertEq(vault.balances(alice), 1 ether);
    }

    function test_DepositTwiceAccumulates() public {
        vm.startPrank(alice);
        vault.deposit{value: 1 ether}();
        vault.deposit{value: 2 ether}();
        vm.stopPrank();
        assertEq(vault.balances(alice), 3 ether);
    }

    function test_DepositZeroIsAllowedAndNoOp() public {
        vm.prank(alice);
        vault.deposit{value: 0}();
        assertEq(vault.balances(alice), 0);
    }

    // --- withdraw() ---

    function test_WithdrawSucceedsForOwnBalance() public {
        vm.startPrank(alice);
        vault.deposit{value: 2 ether}();
        uint256 before = alice.balance;

        vm.expectEmit(true, false, false, true, address(vault));
        emit Withdrawn(alice, 1 ether);
        vault.withdraw(1 ether);
        vm.stopPrank();

        assertEq(alice.balance, before + 1 ether);
        assertEq(vault.balances(alice), 1 ether);
    }

    function test_WithdrawFullBalance() public {
        vm.startPrank(alice);
        vault.deposit{value: 1 ether}();
        vault.withdraw(1 ether);
        vm.stopPrank();
        assertEq(vault.balances(alice), 0);
    }

    function test_RevertWhen_WithdrawExceedsBalance() public {
        vm.startPrank(alice);
        vault.deposit{value: 1 ether}();
        vm.expectRevert(bytes("insufficient"));
        vault.withdraw(2 ether);
        vm.stopPrank();
    }

    function test_RevertWhen_WithdrawWithNoDeposit() public {
        vm.prank(bob);
        vm.expectRevert(bytes("insufficient"));
        vault.withdraw(1 wei);
    }

    function test_RevertWhen_WithdrawTransferFails() public {
        // A contract with no receive/fallback can't accept the ETH, so the
        // low-level call inside withdraw() returns ok = false and the
        // require("transfer failed") branch is what we're covering here.
        RejectingReceiver rejecter = new RejectingReceiver();
        vm.deal(address(rejecter), 1 ether);

        vm.prank(address(rejecter));
        vault.deposit{value: 1 ether}();

        vm.prank(address(rejecter));
        vm.expectRevert(bytes("transfer failed"));
        vault.withdraw(1 ether);
    }

    // --- sweep() / onlyOwner ---

    function test_SweepByOwnerSucceeds() public {
        vm.prank(alice);
        vault.deposit{value: 1 ether}();

        uint256 before = owner.balance;

        vm.expectEmit(true, false, false, true, address(vault));
        emit Swept(owner, 1 ether);
        vault.sweep();

        assertEq(owner.balance, before + 1 ether);
        assertEq(address(vault).balance, 0);
    }

    function test_RevertWhen_SweepByNonOwner() public {
        vm.prank(alice);
        vm.expectRevert(bytes("not owner"));
        vault.sweep();
    }

    // --- updatePrice() / onlyOracle ---

    function test_UpdatePriceByOracleSucceeds() public {
        vm.expectEmit(true, false, false, true, address(vault));
        emit PriceUpdated(oracle, 2e8);

        vm.prank(oracle);
        vault.updatePrice(2e8);

        assertEq(vault.price(), 2e8);
    }

    function test_RevertWhen_UpdatePriceByNonOracle() public {
        vm.prank(alice);
        vm.expectRevert(bytes("not oracle"));
        vault.updatePrice(2e8);
    }

    // --- redeemAtPrice() ---

    function test_RedeemAtPriceAtParPrice() public {
        // price defaults to 0 until the oracle sets it; set it to 1e8 (par)
        // so the payout math is easy to check: amount * 1e8 / 1e8 == amount
        vm.prank(oracle);
        vault.updatePrice(1e8);

        vm.startPrank(alice);
        vault.deposit{value: 2 ether}();
        uint256 before = alice.balance;

        vm.expectEmit(true, false, false, true, address(vault));
        emit Withdrawn(alice, 1 ether);
        vault.redeemAtPrice(1 ether);
        vm.stopPrank();

        assertEq(alice.balance, before + 1 ether);
        assertEq(vault.balances(alice), 1 ether);
    }

    function test_RedeemAtPriceScalesPayoutByPrice() public {
        // price at 0.5e8 (half of par): redeeming 1 ether of balance should
        // pay out 0.5 ether, while still debiting the full 1 ether balance
        vm.prank(oracle);
        vault.updatePrice(0.5e8);

        vm.startPrank(alice);
        vault.deposit{value: 1 ether}();
        uint256 before = alice.balance;
        vault.redeemAtPrice(1 ether);
        vm.stopPrank();

        assertEq(alice.balance, before + 0.5 ether);
        assertEq(vault.balances(alice), 0);
    }

    function test_RevertWhen_RedeemAtPriceExceedsBalance() public {
        vm.prank(oracle);
        vault.updatePrice(1e8);

        vm.startPrank(alice);
        vault.deposit{value: 1 ether}();
        vm.expectRevert(bytes("insufficient"));
        vault.redeemAtPrice(2 ether);
        vm.stopPrank();
    }

    function test_RevertWhen_RedeemAtPriceTransferFails() public {
        vm.prank(oracle);
        vault.updatePrice(1e8);

        RejectingReceiver rejecter = new RejectingReceiver();
        vm.deal(address(rejecter), 1 ether);

        vm.prank(address(rejecter));
        vault.deposit{value: 1 ether}();

        vm.prank(address(rejecter));
        vm.expectRevert(bytes("transfer failed"));
        vault.redeemAtPrice(1 ether);
    }

    // sweep() uses owner.transfer(), which requires the recipient to accept
    // plain ETH; the test contract is the owner (deployer), so it needs this.
    receive() external payable {}
}

/// Minimal helper with no receive/fallback, used only to exercise the
/// "transfer failed" revert branch of withdraw()/redeemAtPrice() above.
contract RejectingReceiver {
    function approveSpend() external pure returns (bool) {
        return true;
    }
}
