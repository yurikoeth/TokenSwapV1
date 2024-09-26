import axios from 'axios';

const API_URL = 'http://localhost:3000';

export const swapTokens = async (fromToken, toToken, amount) => {
  const response = await axios.post(`${API_URL}/swap`, { fromToken, toToken, amount });
  return response.data;
};

export const getSwapRate = async (fromToken, toToken) => {
  const response = await axios.get(`${API_URL}/swap-rate`, { params: { fromToken, toToken } });
  return response.data;
};