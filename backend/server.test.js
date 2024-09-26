// File: server.test.js

const request = require('supertest');
const app = require('./src/server'); // Make sure to export app from server.js

describe('API Endpoints', () => {
  test('GET / should return welcome message', async () => {
    const res = await request(app).get('/');
    expect(res.statusCode).toBe(200);
    expect(res.body).toHaveProperty('message', 'Welcome to the ERC-20 Swap API');
  });

  test('POST /swap should return swap details', async () => {
    const swapData = {
      fromToken: '0x123...',
      toToken: '0x456...',
      amount: '100'
    };
    const res = await request(app)
      .post('/swap')
      .send(swapData);
    expect(res.statusCode).toBe(200);
    expect(res.body).toHaveProperty('message', 'Swap request received');
    expect(res.body).toHaveProperty('fromToken', swapData.fromToken);
    expect(res.body).toHaveProperty('toToken', swapData.toToken);
    expect(res.body).toHaveProperty('amount', swapData.amount);
    expect(res.body).toHaveProperty('status', 'pending');
  });
});