import React, { useState } from 'react';
import { ethers } from 'ethers';
import { Container, Typography, TextField, Button, Box } from '@mui/material';
import axios from 'axios';

function App() {
  const [fromToken, setFromToken] = useState('');
  const [toToken, setToToken] = useState('');
  const [amount, setAmount] = useState('');
  const [swapResult, setSwapResult] = useState(null);

  const handleSwap = async () => {
    try {
      const response = await axios.post('http://localhost:3000/swap', {
        fromToken,
        toToken,
        amount
      });
      setSwapResult(response.data);
    } catch (error) {
      console.error('Swap error:', error);
      setSwapResult({ error: error.message });
    }
  };

  return (
    <Container maxWidth="sm">
      <Typography variant="h4" component="h1" gutterBottom>
        ERC-20 Token Swap
      </Typography>
      <Box component="form" noValidate autoComplete="off">
        <TextField
          fullWidth
          label="From Token Address"
          value={fromToken}
          onChange={(e) => setFromToken(e.target.value)}
          margin="normal"
        />
        <TextField
          fullWidth
          label="To Token Address"
          value={toToken}
          onChange={(e) => setToToken(e.target.value)}
          margin="normal"
        />
        <TextField
          fullWidth
          label="Amount"
          type="number"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          margin="normal"
        />
        <Button variant="contained" color="primary" onClick={handleSwap}>
          Swap Tokens
        </Button>
      </Box>
      {swapResult && (
        <Box mt={2}>
          <Typography variant="h6">Swap Result:</Typography>
          <pre>{JSON.stringify(swapResult, null, 2)}</pre>
        </Box>
      )}
    </Container>
  );
}

export default App;