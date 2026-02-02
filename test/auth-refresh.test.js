const request = require('supertest');
const jwt = require('jsonwebtoken');
const User = require('../src/models/User');

// Ensure ALLOWED_ORIGINS includes the test origin
process.env.ALLOWED_ORIGINS = 'http://localhost:5173';
// Provide JWT secrets for token creation during tests
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret';
process.env.JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'test-jwt-refresh-secret';

const app = require('../src/app');

describe('Auth refresh flow (unit-style, no DB required)', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('POST /api/auth/refresh — accepts refresh cookie and returns new access token + cookie', async () => {
    const fakeRefreshToken = 'fake-refresh-token-value';
    const decoded = { id: 'user-id-123', type: 'refresh' };

    // Mock jwt.verify to accept our fake token and return decoded payload
    jest.spyOn(jwt, 'verify').mockImplementation((token, secret) => {
      if (token === fakeRefreshToken) return decoded;
      throw new Error('invalid token');
    });

    // Mock a user that matches the refresh token and is not expired
    const mockUser = {
      _id: decoded.id,
      refreshToken: fakeRefreshToken,
      refreshTokenExpires: new Date(Date.now() + 1000 * 60 * 60),
      save: jest.fn().mockResolvedValue(true),
    };

    jest.spyOn(User, 'findById').mockImplementation(() => ({ select: jest.fn().mockResolvedValue(mockUser) }));

    const agent = request.agent(app);

    const res = await agent
      .post('/api/auth/refresh')
      .set('Origin', 'http://localhost:5173')
      .set('Cookie', [`refreshToken=${fakeRefreshToken}`]);

    if (res.status === 500) {
      // print server error for diagnostics
      // eslint-disable-next-line no-console
      console.error('SERVER ERROR BODY:', res.body || res.text);
    }

    expect([200, 201]).toContain(res.status);
    expect(res.body).toHaveProperty('accessToken');

    const setCookie = res.headers['set-cookie'] || [];
    const hasAccessCookie = setCookie.some((c) => c.startsWith('accessToken='));
    expect(hasAccessCookie).toBe(true);
  });

  test('POST /api/auth/refresh — invalid token -> 401', async () => {
    jest.spyOn(jwt, 'verify').mockImplementation(() => { throw Object.assign(new Error('invalid'), { name: 'JsonWebTokenError' }); });

    const res = await request(app)
      .post('/api/auth/refresh')
      .set('Origin', 'http://localhost:5173')
      .set('Cookie', ['refreshToken=garbage']);

    expect(res.status).toBe(401);
  });
});
