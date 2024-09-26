// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import "forge-std/Script.sol";
import "../src/Swapper.sol";

contract DeploySwapper is Script {
    event Deployed(address indexed swapperAddress);
   
    function run() external {
        uint256 deployerPrivateKey;
        if (block.chainid == 31337) { // Anvil's chain ID
            deployerPrivateKey = vm.envUint("ANVIL_PRIVATE_KEY");
        } else {
            deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        }
        
        address deployerAddress = vm.addr(deployerPrivateKey);

        vm.startBroadcast(deployerPrivateKey);

        Swapper swapper = new Swapper(deployerAddress);
        
        emit Deployed(address(swapper));
        console.log("Swapper deployed at: ", address(swapper));

        vm.stopBroadcast();
    }
}