/**
 * ERC-20 Swap API Server
 * 
 * This server provides endpoints for interacting with an ERC-20 token swap smart contract
 * on the Ethereum blockchain (Sepolia testnet). It allows users to get swap rates and
 * execute token swaps.
 */

const express = require('express');
const cors = require('cors');
const { ethers } = require('ethers');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 3000;

// Setup Ethereum provider and wallet
const provider = new ethers.JsonRpcProvider(process.env.RPC_URL);
const wallet = new ethers.Wallet(process.env.BACKEND_WALLET_PRIVATE_KEY, provider);

// Swapper contract configuration
const SWAPPER_ABI = [
  "function swap(address fromToken, address toToken, uint256 amount) external",
  "function getSwapRate(address fromToken, address toToken) external view returns (uint256)"
];
const SWAPPER_ADDRESS = '0xe4f50A80A19a36077FDDA1Ce1bAAC9A208FAb97d'; // Contract address on Sepolia
const swapperContract = new ethers.Contract(SWAPPER_ADDRESS, SWAPPER_ABI, wallet);

// Middleware
app.use(cors());
app.use(express.json());

// Routes

/**
 * GET /
 * Welcome message for the API
 */
app.get('/', (req, res) => {
  res.json({ message: 'Welcome to the ERC-20 Swap API' });
});

/**
 * POST /swap
 * Execute a token swap
 * @param {string} fromToken - Address of the token to swap from
 * @param {string} toToken - Address of the token to swap to
 * @param {string} amount - Amount of tokens to swap (in token's smallest unit)
 * @returns {Object} Swap result including transaction hash
 */
app.post('/swap', async (req, res) => {
  try {
    const { fromToken, toToken, amount } = req.body;
    
    // Get swap rate
    const rate = await swapperContract.getSwapRate(fromToken, toToken);
    
    // Perform swap
    const tx = await swapperContract.swap(fromToken, toToken, ethers.parseUnits(amount, 18));
    const receipt = await tx.wait();

    res.json({
      message: 'Swap executed',
      fromToken,
      toToken,
      amount,
      rate: rate.toString(),
      transactionHash: receipt.transactionHash,
      status: 'completed'
    });
  } catch (error) {
    console.error('Swap error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /swap-rate
 * Get the current swap rate between two tokens
 * @param {string} fromToken - Address of the token to swap from
 * @param {string} toToken - Address of the token to swap to
 * @returns {Object} Swap rate
 */
app.get('/swap-rate', async (req, res) => {
  try {
    const { fromToken, toToken } = req.query;
    const rate = await swapperContract.getSwapRate(fromToken, toToken);
    res.json({ rate: rate.toString() });
  } catch (error) {
    console.error('Error getting swap rate:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /latest-block
 * Get information about the latest Ethereum block
 * @returns {Object} Latest block information
 */
app.get('/latest-block', async (req, res) => {
  try {
    const block = await provider.getBlock('latest');
    res.json(block);
  } catch (error) {
    console.error('Error getting latest block:', error);
    res.status(500).json({ error: error.message });
  }
});

// Catch-all route for undefined routes
app.use((req, res) => {
  res.status(404).json({ error: 'Not Found' });
});

// Start the server
if (require.main === module) {
  app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
  });
}

module.exports = app;