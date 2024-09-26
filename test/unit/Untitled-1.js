// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test, Vm} from "forge-std/Test.sol";
import "../../src/Swapper.sol";
import "openzeppelin-contracts/contracts/token/ERC20/ERC20.sol";

contract MockERC20 is ERC20 {
    constructor(string memory name, string memory symbol) ERC20(name, symbol) {
        _mint(msg.sender, 1000000 * 10**decimals());
    }
}

contract SwapperTest is Test {
    Swapper public swapper;
    MockERC20 public tokenA;
    MockERC20 public tokenB;
    MockERC20 public tokenC;
    address public owner;
    address public user;

    function setUp() public {
        owner = address(this);
        user = makeAddr("user");
        swapper = new Swapper(owner);
    
        tokenA = new MockERC20("Token A", "TKA");
        tokenB = new MockERC20("Token B", "TKB");
        tokenC = new MockERC20("Token C", "TKC");
    
        swapper.addSupportedToken(address(tokenA));
        swapper.addSupportedToken(address(tokenB));
    
        uint256 userAmount = 1000 * 10**tokenA.decimals();
        tokenA.transfer(user, userAmount);
        tokenB.transfer(user, userAmount);
    
        uint256 liquidityAmount = 1000 * 10**18;
        tokenA.approve(address(swapper), liquidityAmount);
        tokenB.approve(address(swapper), liquidityAmount);
        swapper.addLiquidity(address(tokenA), liquidityAmount);
        swapper.addLiquidity(address(tokenB), liquidityAmount);
    }

    function testAddLiquidity() public {
        uint256 amount = 100 * 10**tokenA.decimals();
        deal(address(tokenA), user, amount);

        vm.startPrank(user);
        tokenA.approve(address(swapper), amount);
        swapper.addLiquidity(address(tokenA), amount);
        vm.stopPrank();
        
        assertEq(swapper.tokenBalances(address(tokenA)), 1100 * 10**tokenA.decimals(), "Swapper balance should be 1100 tokens");
    }

    function testAddLiquidityRevertsWithUnsupportedToken() public {
        uint256 amount = 100 * 10**tokenC.decimals();
        vm.expectRevert("UnsupportedToken");
        swapper.addLiquidity(address(tokenC), amount);
    }

    function testRemoveLiquidity() public {
        uint256 amount = IERC20(tokenA).balanceOf(address(swapper));
        swapper.removeLiquidity(address(tokenA), amount);
        assertEq(IERC20(tokenA).balanceOf(address(swapper)), 0);
    }

    function testRemoveAllLiquidity() public {
        swapper.removeAllLiquidity(address(tokenA));
        assertEq(IERC20(tokenA).balanceOf(address(swapper)), 0);
    }

    function testWithdrawToken() public {
        uint256 amount = 100 * 10**tokenA.decimals();
        uint256 ownerBalanceBefore = tokenA.balanceOf(owner);
        swapper.withdrawToken(address(tokenA), amount);
        assertEq(tokenA.balanceOf(owner) - ownerBalanceBefore, amount);
    }

    function testSwapWithSlippage() public {
        uint256 swapAmount = 100 * 10**18;
        deal(address(tokenA), user, swapAmount);

        uint256 reserveA = swapper.tokenBalances(address(tokenA));
        uint256 reserveB = swapper.tokenBalances(address(tokenB));
        uint256 expectedOutput = (reserveB * swapAmount) / (reserveA + swapAmount);
        uint256 minAmountOut = (expectedOutput * 99) / 100; // 1% slippage

        uint256 balanceBefore = tokenB.balanceOf(user);

        vm.startPrank(user);
        tokenA.approve(address(swapper), swapAmount);
        swapper.swap(address(tokenA), address(tokenB), swapAmount, minAmountOut);
        vm.stopPrank();

        uint256 actualOutput = tokenB.balanceOf(user) - balanceBefore;
        assertGe(actualOutput, minAmountOut, "Received less than minimum amount");
        assertLe(actualOutput, expectedOutput, "Received more than expected");
    }

    function testSwapWithExcessiveSlippage() public {
        uint256 swapAmount = 100 * 10**18;
        uint256 reserveA = swapper.tokenBalances(address(tokenA));
        uint256 reserveB = swapper.tokenBalances(address(tokenB));
        uint256 amountInWithFee = swapAmount * (swapper.FEE_DENOMINATOR() - swapper.feeNumerator()) / swapper.FEE_DENOMINATOR();
        uint256 expectedOutput = (reserveB * amountInWithFee) / (reserveA + amountInWithFee);
        uint256 excessiveMinAmountOut = expectedOutput + 1;

        vm.startPrank(user);
        tokenA.approve(address(swapper), swapAmount);
        vm.expectRevert(abi.encodeWithSelector(Swapper.SlippageExceeded.selector));
        swapper.swap(address(tokenA), address(tokenB), swapAmount, excessiveMinAmountOut);
        vm.stopPrank();
    }

    function testSwapRevertsWithUnsupportedFromToken() public {
        uint256 swapAmount = 100 * 10**18;
        deal(address(tokenC), user, swapAmount);

        vm.startPrank(user);
        tokenC.approve(address(swapper), swapAmount);
        vm.expectRevert(abi.encodeWithSelector(Swapper.UnsupportedToken.selector));
        swapper.swap(address(tokenC), address(tokenA), swapAmount, 0);
        vm.stopPrank();
    }

    function testSwapRevertsWithUnsupportedToToken() public {
        uint256 swapAmount = 100 * 10**18;
        deal(address(tokenA), user, swapAmount);

        vm.startPrank(user);
        tokenA.approve(address(swapper), swapAmount);
        vm.expectRevert(abi.encodeWithSelector(Swapper.UnsupportedToken.selector));
        swapper.swap(address(tokenA), address(tokenC), swapAmount, 0);
        vm.stopPrank();
    }

    function testAddSupportedToken() public {
        assertFalse(swapper.supportedTokens(address(tokenC)));
        swapper.addSupportedToken(address(tokenC));
        assertTrue(swapper.supportedTokens(address(tokenC)));
    }

    function testRemoveSupportedToken() public {
        swapper.removeSupportedToken(address(tokenB));
        assertFalse(swapper.supportedTokens(address(tokenB)));
    }

    function testSwapRevertsWithInsufficientUserBalance() public {
        uint256 userBalance = tokenA.balanceOf(user);
        uint256 swapAmount = userBalance + 1 ether;

        vm.startPrank(user);
        tokenA.approve(address(swapper), swapAmount);
        vm.expectRevert(abi.encodeWithSelector(Swapper.InsufficientUserBalance.selector));
        swapper.swap(address(tokenA), address(tokenB), swapAmount, 0);
        vm.stopPrank();

        assertEq(tokenA.balanceOf(user), userBalance, "User balance should remain unchanged");
    }

    function testSwapWithEmptyToken() public {
        MockERC20 newTokenA = new MockERC20("New Token A", "NTA");
        MockERC20 newTokenB = new MockERC20("New Token B", "NTB");

        swapper.addSupportedToken(address(newTokenA));
        swapper.addSupportedToken(address(newTokenB));

        uint256 userBalance = 1000 * 10**18;
        newTokenA.transfer(user, userBalance);

        uint256 liquidityAmount = 1000 * 10**18;
        deal(address(newTokenA), address(this), liquidityAmount);
        newTokenA.approve(address(swapper), liquidityAmount);
        swapper.addLiquidity(address(newTokenA), liquidityAmount);

        vm.startPrank(user);
        newTokenA.approve(address(swapper), type(uint256).max);
        newTokenB.approve(address(swapper), type(uint256).max);

        uint256 swapAmount = 100 * 10**18;

        vm.expectRevert(abi.encodeWithSelector(Swapper.InsufficientSwapperLiquidity.selector));
        swapper.swap(address(newTokenA), address(newTokenB), swapAmount, 0);
        vm.stopPrank();
    }

    function testRevertsWhenSwappingTheSameTokens() public {
        uint256 swapAmount = 100 * 10**18;
        deal(address(tokenA), user, swapAmount);

        vm.startPrank(user);
        tokenA.approve(address(swapper), swapAmount);
        vm.expectRevert(abi.encodeWithSelector(Swapper.SameTokenSwap.selector));
        swapper.swap(address(tokenA), address(tokenA), swapAmount, 0);
        vm.stopPrank();
    }

    function testSwapWithExcessiveImpact() public {
        uint256 swapAmount = 450 * 10**tokenA.decimals(); // 45% of the initial liquidity
        uint256 minAmountOut = 1;

        vm.startPrank(user);
        tokenA.approve(address(swapper), swapAmount);
        
        vm.expectRevert(abi.encodeWithSignature("ExcessiveSwapImpact()"));
        swapper.swap(address(tokenA), address(tokenB), swapAmount, minAmountOut);
        vm.stopPrank();
    }

    function testPreventPoolDraining() public {
        uint256 INITIAL_LIQUIDITY = IERC20(address(tokenB)).balanceOf(address(swapper));
        uint256 largeSwapAmount = INITIAL_LIQUIDITY * 99 / 100;

        vm.startPrank(user);
        tokenA.approve(address(swapper), largeSwapAmount);
        vm.expectRevert();
        swapper.swap(address(tokenA), address(tokenB), largeSwapAmount, 1);
        vm.stopPrank();

        uint256 FINAL_LIQUIDITY = IERC20(address(tokenB)).balanceOf(address(swapper));
        assertEq(INITIAL_LIQUIDITY, FINAL_LIQUIDITY, "Pool liquidity should not have changed");
    }

    function testWithdrawTokenInsufficientLiquidity() public {
        uint256 currentBalance = tokenA.balanceOf(address(swapper));
        uint256 excessiveWithdrawAmount = currentBalance + 1;

        vm.expectRevert(abi.encodeWithSignature("InsufficientSwapperLiquidity()"));
        swapper.withdrawToken(address(tokenA), excessiveWithdrawAmount);
    }

    function testGetTokenBalance() public {
        uint256 INITIAL_LIQUIDITY_A = tokenA.balanceOf(address(swapper));
        uint256 INITIAL_LIQUIDITY_B = tokenB.balanceOf(address(swapper));
        
        assertEq(swapper.getTokenBalance(address(tokenA)), INITIAL_LIQUIDITY_A, "TokenA balance should match initial liquidity");
        assertEq(swapper.getTokenBalance(address(tokenB)), INITIAL_LIQUIDITY_B, "TokenB balance should match initial liquidity");

        address unsupportedToken = makeAddr("unsupportedToken");
        assertEq(swapper.getTokenBalance(unsupportedToken), 0, "Unsupported token balance should be zero");
    }

    function testSetFeeSuccess() public {
        uint256 newFee = 30; // 3%
        vm.expectEmit(true, false, false, true);
        emit Swapper.FeeUpdated(newFee);
        swapper.setFee(newFee);
        assertEq(swapper.getFee(), newFee, "Fee should be updated to new value");
    }

    function testSetFeeZero() public {
        uint256 newFee = 0;
        vm.expectEmit(true, false, false, true);
        emit Swapper.FeeUpdated(newFee);
        swapper.setFee(newFee);
        assertEq(swapper.getFee(), newFee, "Fee should be updated to zero");
    }

    function testSetFeeMaxAllowed() public {
        uint256 newFee = 50; // 5%, max allowed
        vm.expectEmit(true, false, false, true);
        emit Swapper.FeeUpdated(newFee);
        swapper.setFee(newFee);
        assertEq(swapper.getFee(), newFee, "Fee should be updated to max allowed value");
    }

    function testSetFeeTooHigh() public {
        uint256 newFee = 51; // Just above max allowed
        vm.expectRevert("Fee too high");
        swapper.setFee(newFee);
    }

    function testSetFeeNotOwner() public {
        vm.prank(user);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, user));
        swapper.setFee(30);
    }

    function testSetFeeMultipleTimes() public {
        uint256[] memory fees = new uint256[](3);
        fees[0] = 10;
        fees[1] = 25;
        fees[2] = 40;

        for (uint i = 0; i < fees.length; i++) {
            vm.expectEmit(true, false, false, true);
            emit Swapper.FeeUpdated(fees[i]);
            swapper.setFee(fees[i]);
            assertEq(swapper.getFee(), fees[i], "Fee should be updated to new value");
        }
    }

    function testAddLiquidityWhenPaused() public {
        swapper.pause();
        
        uint256 amount = 100 * 10**tokenA.decimals();
        deal(address(tokenA), user, amount);

        vm.startPrank(user);
        tokenA.approve(address(swapper), amount);
        
        vm.expectRevert(abi.encodeWithSignature("EnforcedPause()"));
        swapper.addLiquidity(address(tokenA), amount);
        
        vm.stopPrank();
    }

    function testSwapWhenPaused() public {
        swapper.pause();
        
        uint256 swapAmount = 100 * 10**18;
        deal(address(tokenA), user, swapAmount);
    
        vm.startPrank(user);
        tokenA.approve(address(swapper), swapAmount);
        
        vm.expectRevert(abi.encodeWithSignature("EnforcedPause()"));
        swapper.swap(address(tokenA), address(tokenB), swapAmount, 0);
        
        vm.stopPrank();
    }
    
    function testSwapWhenPaused() public {
        swapper.pause();
        
        uint256 swapAmount = 100 * 10**18;
        deal(address(tokenA), user, swapAmount);

        vm.startPrank(user);
        tokenA.approve(address(swapper), swapAmount);
        
        vm.expectRevert(abi.encodeWithSignature("EnforcedPause()"));
        swapper.swap(address(tokenA), address(tokenB), swapAmount, 0);
        
        vm.stopPrank();
    }

    function testRemoveLiquidityWhenPaused() public {
        swapper.pause();
        
        uint256 amount = 100 * 10**tokenA.decimals();
        
        vm.expectRevert(abi.encodeWithSignature("EnforcedPause()"));
        swapper.removeLiquidity(address(tokenA), amount);
    }

    function testUnpauseByOwner() public {
        swapper.pause();
        assertTrue(swapper.paused(), "Contract should be paused");
        
        swapper.unpause();
        assertFalse(swapper.paused(), "Contract should be unpaused");
    }

    function testUnpauseByNonOwner() public {
        swapper.pause();
        assertTrue(swapper.paused(), "Contract should be paused");

        vm.prank(user);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, user));
        swapper.unpause();

        assertTrue(swapper.paused(), "Contract should still be paused");
    }

    function testFunctionCallAfterUnpause() public {
        swapper.pause();
        swapper.unpause();

        uint256 amount = 100 * 10**tokenA.decimals();
        deal(address(tokenA), user, amount);

        vm.startPrank(user);
        tokenA.approve(address(swapper), amount);
        
        // This should not revert
        swapper.addLiquidity(address(tokenA), amount);
        
        vm.stopPrank();

        assertEq(swapper.tokenBalances(address(tokenA)), 1100 * 10**tokenA.decimals(), "Liquidity should be added after unpausing");
    }

    function testGetTWAP() public {
        uint256 initialLiquidity = swapper.getTokenBalance(address(tokenA));

        // Simulate price updates over time
        uint256[] memory prices = new uint256[](5);
        prices[0] = 1 * 10**18;  // Starting price: 1 token A = 1 token B
        prices[1] = 11 * 10**17; // 1.1 token A = 1 token B
        prices[2] = 105 * 10**16; // 1.05 token A = 1 token B
        prices[3] = 115 * 10**16; // 1.15 token A = 1 token B
        prices[4] = 12 * 10**17; // 1.2 token A = 1 token B

        for (uint i = 0; i < prices.length; i++) {
            vm.warp(block.timestamp + 1 hours);

            uint256 newLiquidity = (100 * 10**18 * 10**18) / prices[i];
            
            swapper.removeAllLiquidity(address(tokenA));
            
            tokenA.approve(address(swapper), newLiquidity);
            swapper.addLiquidity(address(tokenA), newLiquidity);
        }

        uint256 expectedTWAP = (prices[0] + prices[1] + prices[2] + prices[3]) / 4;

        (uint256 actualTWAP, bool isValid) = swapper.getTWAP(address(tokenA));

        uint256 lowerBound = (expectedTWAP * 99) / 100;
        uint256 upperBound = (expectedTWAP * 101) / 100;

        assertGe(actualTWAP, lowerBound, "TWAP is lower than expected");
        assertLe(actualTWAP, upperBound, "TWAP is higher than expected");
        assertTrue(isValid, "TWAP should be valid");
    }

    function testGetTWAPInvalidToken() public {
        (uint256 twap, bool isValid) = swapper.getTWAP(address(tokenC));
        assertEq(twap, 0, "TWAP for invalid token should be 0");
        assertFalse(isValid, "TWAP for invalid token should not be valid");
    }

    function testGetTWAPInsufficientData() public {
        // Remove all existing price data
        swapper.removeAllLiquidity(address(tokenA));
        swapper.removeAllLiquidity(address(tokenB));

        // Add new liquidity to create only one price point
        uint256 newLiquidity = 100 * 10**18;
        tokenA.approve(address(swapper), newLiquidity);
        tokenB.approve(address(swapper), newLiquidity);
        swapper.addLiquidity(address(tokenA), newLiquidity);
        swapper.addLiquidity(address(tokenB), newLiquidity);

        (uint256 twap, bool isValid) = swapper.getTWAP(address(tokenA));
        assertEq(twap, 1 * 10**18, "TWAP should be 1 with only one price point");
        assertFalse(isValid, "TWAP should not be valid with insufficient data");
    }

    function testSyncBalance() public {
        uint256 initialBalance = swapper.tokenBalances(address(tokenA));
        uint256 additionalBalance = 500 * 10**18;

        // Simulate external transfer to swapper (not through addLiquidity)
        deal(address(tokenA), address(swapper), initialBalance + additionalBalance);

        // Verify balance discrepancy
        assertEq(tokenA.balanceOf(address(swapper)), initialBalance + additionalBalance, "External transfer failed");
        assertEq(swapper.tokenBalances(address(tokenA)), initialBalance, "Balance should not have updated yet");

        // Call syncBalance
        swapper.syncBalance(address(tokenA));

        // Verify balance has been synced
        assertEq(swapper.tokenBalances(address(tokenA)), initialBalance + additionalBalance, "Balance not synced correctly");
    }

    function testSyncBalanceUnsupportedToken() public {
        vm.expectRevert("Unsupported token");
        swapper.syncBalance(address(tokenC));
    }

    function testAddSupportedTokenByNonOwner() public {
        vm.prank(user);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, user));
        swapper.addSupportedToken(address(tokenC));
    }

    function testRemoveSupportedTokenByNonOwner() public {
        vm.prank(user);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, user));
        swapper.removeSupportedToken(address(tokenA));
    }

    function testAddAlreadySupportedToken() public {
        vm.expectRevert("Token already supported");
        swapper.addSupportedToken(address(tokenA));
    }

    function testRemoveNonSupportedToken() public {
        vm.expectRevert("Token not supported");
        swapper.removeSupportedToken(address(tokenC));
    }

    function testPauseByNonOwner() public {
        vm.prank(user);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, user));
        swapper.pause();
    }

    function testPauseWhenAlreadyPaused() public {
        swapper.pause();
        vm.expectRevert("Pausable: paused");
        swapper.pause();
    }

    function testUnpauseWhenNotPaused() public {
        vm.expectRevert("Pausable: not paused");
        swapper.unpause();
    }
}