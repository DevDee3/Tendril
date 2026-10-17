// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Script, console} from "forge-std/Script.sol";
import {VulnerableVault} from "../src/VulnerableVault.sol";

/// Deploys the VulnerableVault fixture so it has a real address to point
/// the Solidity -> graph ingestion at. This does not interact with the
/// contract beyond deployment — no deposit/withdraw/sweep calls here.
contract DeployVulnerableVault is Script {
    function run() external returns (VulnerableVault vault) {
        uint256 deployerKey = vm.envOr("PRIVATE_KEY", uint256(0));

        // Resolve the deployer's address BEFORE broadcasting: vm.startBroadcast
        // only changes who the next external call/create is attributed to,
        // it does not change what `msg.sender` reads as inside this script's
        // own code. vm.addr() is the reliable way to get it from a key.
        address deployerAddr = deployerKey != 0 ? vm.addr(deployerKey) : msg.sender;

        // deployer doubles as the price oracle for this fixture deployment;
        // pass a different address via ORACLE_ADDRESS if you want to split
        // that role out
        address oracle = vm.envOr("ORACLE_ADDRESS", deployerAddr);

        if (deployerKey != 0) {
            vm.startBroadcast(deployerKey);
        } else {
            // no PRIVATE_KEY set: assume a local chain (e.g. `anvil`) where
            // forge can use its default unlocked sender for a dry run
            vm.startBroadcast();
        }

        vault = new VulnerableVault(oracle);

        vm.stopBroadcast();

        console.log("VulnerableVault deployed at:", address(vault));
        console.log("Price oracle set to:", oracle);
    }
}
