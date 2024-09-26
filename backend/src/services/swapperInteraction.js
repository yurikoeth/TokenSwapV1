// Import ethers library for Ethereum interactions
const { ethers } = require('ethers');

// Load environment variables from .env file
require('dotenv').config();

// Define the ABI (Application Binary Interface) for the Swapper contract
// This includes the function signatures the contract exposes
const SWAPPER_ABI = [
  "function swap(address fromToken, address toToken, uint256 amount) external",
  "function getSwapRate(address fromToken, address toToken) external view returns (uint256)"
];

// Address of the deployed Swapper contract on Sepolia testnet
const SWAPPER_ADDRESS = '0xe4f50A80A19a36077FDDA1Ce1bAAC9A208FAb97d';

// Create a provider to connect to the Sepolia testnet
const provider = new ethers.JsonRpcProvider(process.env.SEPOLIA_RPC_URL);

// Create a signer (wallet) using the private key from environment variables
const signer = new ethers.Wallet(process.env.PRIVATE_KEY, provider);

// Create an instance of the Swapper contract that we can interact with
const swapperContract = new ethers.Contract(SWAPPER_ADDRESS, SWAPPER_ABI, signer);

/**
 * Get the swap rate between two tokens
 * @param {string} fromToken - Address of the token to swap from
 * @param {string} toToken - Address of the token to swap to
 * @returns {Promise<BigNumber>} The swap rate
 */
async function getSwapRate(fromToken, toToken) {
  try {
    // Call the getSwapRate function on the smart contract
    const rate = await swapperContract.getSwapRate(fromToken, toToken);
    return rate;
  } catch (error) {
    console.error('Error getting swap rate:', error);
    throw error; // Re-throw the error for handling in the calling function
  }
}

/**
 * Perform a token swap
 * @param {string} fromToken - Address of the token to swap from
 * @param {string} toToken - Address of the token to swap to
 * @param {BigNumber|string} amount - Amount of tokens to swap
 * @returns {Promise<TransactionReceipt>} The transaction receipt
 */
async function performSwap(fromToken, toToken, amount) {
  try {
    // Call the swap function on the smart contract
    const tx = await swapperContract.swap(fromToken, toToken, amount);
    // Wait for the transaction to be mined and get the receipt
    const receipt = await tx.wait();
    return receipt;
  } catch (error) {
    console.error('Error performing swap:', error);
    throw error; // Re-throw the error for handling in the calling function
  }
}

// Export the functions so they can be used in other parts of the application
module.exports = {
  getSwapRate,
  performSwap
};