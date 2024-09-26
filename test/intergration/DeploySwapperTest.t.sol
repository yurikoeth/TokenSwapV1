// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import "forge-std/Test.sol";
import "../../script/DeploySwapper.s.sol";
import "../../src/Swapper.sol";

contract TestDeploySwapper is Test {
    DeploySwapper public deployer;
    Swapper public swapper;
    address public deployerAddress;

    function setUp() public {
        deployer = new DeploySwapper();
        
        uint256 mockPrivateKey = 1;
        vm.setEnv("ANVIL_PRIVATE_KEY", vm.toString(mockPrivateKey));
        
        deployerAddress = vm.addr(mockPrivateKey);
    }

    function testDeployScript() public {
        vm.recordLogs();
        deployer.run();
        
        Vm.Log[] memory entries = vm.getRecordedLogs();
        assertGt(entries.length, 0, "No logs emitted");

        address deployedSwapperAddress;
        for (uint i = 0; i < entries.length; i++) {
            if (entries[i].topics[0] == keccak256("Deployed(address)")) {
                deployedSwapperAddress = address(uint160(uint256(entries[i].topics[1])));
                break;
            }
        }

        assertTrue(deployedSwapperAddress != address(0), "Swapper not deployed");
        
        swapper = Swapper(deployedSwapperAddress);
        assertEq(swapper.owner(), deployerAddress, "Incorrect owner set");
    }
}