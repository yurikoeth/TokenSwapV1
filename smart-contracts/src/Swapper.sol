// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/**
 * @title Swapper
 * @dev A decentralized exchange contract for swapping ERC20 tokens using a constant product AMM model.
 * Features include liquidity provision, fee collection, TWAP oracle, and owner-only controls.
 */
contract Swapper is Ownable, ReentrancyGuard, Pausable {
    using SafeERC20 for IERC20;

    // Structs
    struct PriceObservation {
        uint256 timestamp;
        uint256 price;
    }

    // State variables
    mapping(address => bool) public supportedTokens;
    mapping(address => uint256) public tokenBalances;
    mapping(address => PriceObservation[]) public priceHistory;

    uint256 public constant OBSERVATION_PERIOD = 1 hours;
    uint256 public constant MIN_OBSERVATIONS = 5;
    uint256 public constant FEE_DENOMINATOR = 1000;
    uint256 public constant MAX_OUTPUT_PERCENTAGE = 30; // 30% of available liquidity
    uint256 public constant MINIMUM_LIQUIDITY = 1000;
    uint256 private constant TWAP_PERIOD = 1 days;
    uint256 public feeNumerator = 3; // 0.3% fee

    // Events
    event TokenSwap(address indexed from, address indexed to, uint256 amountIn, uint256 amountOut);
    event LiquidityAdded(address indexed token, uint256 amount);
    event LiquidityRemoved(address indexed token, uint256 amount);
    event FeeUpdated(uint256 newFeeNumerator);
    event ZeroLiquidityPrice(address indexed token);
    event SupportedTokenAdded(address indexed token);

    // Custom errors
    error UnsupportedToken();
    error InsufficientUserBalance();
    error InsufficientSwapperLiquidity();
    error InsufficientRemainingLiquidity();
    error SameTokenSwap();
    error SlippageExceeded();
    error ExcessiveSwapImpact();

    /**
     * @dev Constructor that sets the owner of the contract
     * @param initialOwner The address that will be set as the owner of the contract
     */
    constructor(address initialOwner) Ownable(initialOwner) {}

    // External functions

    /**
     * @dev Adds a token to the list of supported tokens
     * @param token The address of the token to be added
     */
    function addSupportedToken(address token) external onlyOwner {
        require(token != address(0), "Invalid token address");
        require(!supportedTokens[token], "Token already supported");
        
        supportedTokens[token] = true;
        
        emit SupportedTokenAdded(token);
}


    /**
     * @dev Removes a token from the list of supported tokens
     * @param token The address of the token to be removed
     */
    function removeSupportedToken(address token) external onlyOwner {
        require(token != address(0), "Invalid token address");
        require(supportedTokens[token], "Token not supported");
        supportedTokens[token] = false;
    }

    /**
     * @dev Allows users to add liquidity to the contract for a specific token
     * @param token The address of the token for which liquidity is being added
     * @param amount The amount of tokens to add as liquidity
     */
    function addLiquidity(address token, uint256 amount) external nonReentrant whenNotPaused {
        require(supportedTokens[token], "UnsupportedToken");
        IERC20(token).safeTransferFrom(msg.sender, address(this), amount);
        tokenBalances[token] += amount;
        updatePrice(token);
        emit LiquidityAdded(token, amount);
    }

    /**
     * @dev Allows the owner to remove liquidity from the contract
     * @param token The address of the token to remove
     * @param amount The amount of tokens to remove
     */
    function removeLiquidity(address token, uint256 amount) external onlyOwner nonReentrant whenNotPaused returns (uint256){
        require(supportedTokens[token], "Unsupported token");
        uint256 actualBalance = IERC20(token).balanceOf(address(this));
        require(actualBalance >= amount, "Insufficient liquidity");
        IERC20(token).safeTransfer(msg.sender, amount);
        tokenBalances[token] = actualBalance - amount;
        updatePrice(token);
        emit LiquidityRemoved(token, amount);
        return amount;
    }

    /**
     * @dev Allows the owner to remove all liquidity of a specific token
     * @param token The address of the token to remove all liquidity
     */
    function removeAllLiquidity(address token) external nonReentrant whenNotPaused returns (uint256) {
    require(supportedTokens[token], "Unsupported token");
    uint256 amount = tokenBalances[token];
    require(amount > 0, "No liquidity to remove");
    
    tokenBalances[token] = 0;
    IERC20(token).safeTransfer(msg.sender, amount);
    updatePrice(token);
    emit LiquidityRemoved(token, amount);
    return amount;
}

    /**
     * @dev Synchronizes the contract's internal balance with the actual token balance
     * @param token The address of the token to synchronize
     */
    function syncBalance(address token) public {
        require(supportedTokens[token], "Unsupported token");
        uint256 actualBalance = IERC20(token).balanceOf(address(this));
        tokenBalances[token] = actualBalance;
    }

    /**
     * @dev Performs a token swap between two supported tokens
     * @param fromToken The address of the token to swap from
     * @param toToken The address of the token to swap to
     * @param amountIn The amount of fromToken to swap
     * @param minAmountOut The minimum amount of toToken expected to receive
     */
    function swap(address fromToken, address toToken, uint256 amountIn, uint256 minAmountOut) external nonReentrant whenNotPaused {
        if (!supportedTokens[fromToken] || !supportedTokens[toToken]) revert UnsupportedToken();
        if (fromToken == toToken) revert SameTokenSwap();
        if (IERC20(fromToken).balanceOf(msg.sender) < amountIn) revert InsufficientUserBalance();
        if (tokenBalances[toToken] == 0) revert InsufficientSwapperLiquidity();

        uint256 amountOut = calculateAmountOut(fromToken, toToken, amountIn);

        if (tokenBalances[toToken] - amountOut < MINIMUM_LIQUIDITY) revert InsufficientRemainingLiquidity();
        if (amountOut > tokenBalances[toToken] * MAX_OUTPUT_PERCENTAGE / 100) revert ExcessiveSwapImpact();
        if (amountOut < minAmountOut) revert SlippageExceeded();

        IERC20(fromToken).safeTransferFrom(msg.sender, address(this), amountIn);
        IERC20(toToken).safeTransfer(msg.sender, amountOut);

        tokenBalances[fromToken] += amountIn;
        tokenBalances[toToken] -= amountOut;

        updatePrice(fromToken);
        updatePrice(toToken);

        emit TokenSwap(fromToken, toToken, amountIn, amountOut);
    }

    /**
     * @dev Allows the owner to withdraw tokens from the contract
     * @param token The address of the token to withdraw
     * @param amount The amount of tokens to withdraw
     */
    function withdrawToken(address token, uint256 amount) external onlyOwner nonReentrant {
        if (tokenBalances[token] < amount) revert InsufficientSwapperLiquidity();
        tokenBalances[token] -= amount;
        IERC20(token).safeTransfer(owner(), amount);
    }

    /**
     * @dev Allows the owner to set a new fee rate
     * @param newFeeNumerator The new fee numerator (actual fee = newFeeNumerator / FEE_DENOMINATOR)
     */
    function setFee(uint256 newFeeNumerator) external onlyOwner {
        require(newFeeNumerator <= 50, "Fee too high"); // Max 5% fee
        feeNumerator = newFeeNumerator;
        emit FeeUpdated(newFeeNumerator);
    }

    /**
     * @dev Allows the owner to pause the contract
     */
    function pause() external onlyOwner {
        _pause();
    }

    /**
     * @dev Allows the owner to unpause the contract
     */
    function unpause() external onlyOwner {
        _unpause();
    }

    // Public functions

    /**
     * @dev Returns the current fee rate
     * @return The current fee numerator
     */
    function getFee() public view returns (uint256) {
        return feeNumerator;
    }

    /**
     * @dev Returns the balance of a specific token in the contract
     * @param token The address of the token to check
     * @return The balance of the token
     */
    function getTokenBalance(address token) public view returns (uint256) {
        return tokenBalances[token];
    }

// Updated updatePrice function
function updatePrice(address token) internal {
    (uint256 price, bool valid) = calculateCurrentPrice(token);
    if (!valid) {
        emit ZeroLiquidityPrice(token);
        return;
    }
    PriceObservation[] storage history = priceHistory[token];
    if (history.length == MIN_OBSERVATIONS) {
        for (uint256 i = 0; i < MIN_OBSERVATIONS - 1; i++) {
            history[i] = history[i + 1];
        }
        history[MIN_OBSERVATIONS - 1] = PriceObservation(block.timestamp, price);
    } else {
        history.push(PriceObservation(block.timestamp, price));
    }
}


function getTWAP(address token) public view returns (uint256, bool) {
    require(supportedTokens[token], "Unsupported token");
   
    PriceObservation[] storage history = priceHistory[token];
    if (history.length < MIN_OBSERVATIONS) {
        return (0, false);
    }

    uint256 timeWeightedSum = 0;
    uint256 timeSum = 0;
    uint256 periodStart = block.timestamp - TWAP_PERIOD;
    uint256 lastTimestamp = 0;
    uint256 lastPrice = 0;

    for (uint256 i = 0; i < history.length; i++) {
        uint256 timestamp = history[i].timestamp;
        uint256 price = history[i].price;

        // Skip entries outside the TWAP period
        if (timestamp < periodStart) continue;

        // If this is not the first valid entry, calculate the time-weighted price
        if (lastTimestamp > 0) {
            uint256 timeInterval = timestamp - lastTimestamp;
            timeWeightedSum += lastPrice * timeInterval;
            timeSum += timeInterval;
        }

        lastTimestamp = timestamp;
        lastPrice = price;

        // If we've reached the current time, break the loop
        if (timestamp >= block.timestamp) break;
    }

    // Handle the case where the last observation is before the current time
    if (lastTimestamp < block.timestamp && lastTimestamp > 0) {
        uint256 timeInterval = block.timestamp - lastTimestamp;
        timeWeightedSum += lastPrice * timeInterval;
        timeSum += timeInterval;
    }

    // If no valid time intervals were found, return 0
    if (timeSum == 0) return (0, false);

    // Calculate and return the TWAP
    return ((timeWeightedSum / timeSum), true);
}

function calculateCurrentPrice(address token) internal view returns (uint256, bool) {
    uint256 balance = tokenBalances[token];
    if (balance == 0) return (0, false);
    return (1e36 / balance * 1e2, true);  // Multiply by 1e2 to scale to 1e18
}


    /**
     * @dev Calculates the amount of tokens to be received in a swap
     * @param fromToken The address of the token to swap from
     * @param toToken The address of the token to swap to
     * @param amountIn The amount of fromToken to swap
     * @return The calculated amount of toToken to be received
     */
    function calculateAmountOut(address fromToken, address toToken, uint256 amountIn) internal view returns (uint256) {
        uint256 amountInWithFee = amountIn * (FEE_DENOMINATOR - feeNumerator) / FEE_DENOMINATOR;
        uint256 fromBalance = tokenBalances[fromToken];
        uint256 toBalance = tokenBalances[toToken];
        return (toBalance * amountInWithFee) / (fromBalance + amountInWithFee);
    }
}