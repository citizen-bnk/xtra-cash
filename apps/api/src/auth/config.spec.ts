import { JwtService } from '@nestjs/jwt';
import { accessTokenTtl, refreshTokenDays } from './config';

describe('refresh token lifetime', () => {
  it('defaults blank configuration to thirty days', () => {
    expect(refreshTokenDays('')).toBe(30);
    expect(refreshTokenDays(' \n')).toBe(30);
    expect(refreshTokenDays(' 30\n')).toBe(30);
  });
  it('rejects expired, non-finite and unbounded lifetimes', () => {
    for (const value of ['0', '-1', 'NaN', 'Infinity', 'invalid', '0.5', '91']) {
      expect(() => refreshTokenDays(value)).toThrow('REFRESH_TTL_DAYS');
    }
  });
});

describe('access token expiry', () => {
  it('defaults empty configuration to fifteen minutes', () => {
    expect(accessTokenTtl('')).toBe('15m');
    expect(accessTokenTtl('  ')).toBe('15m');
  });
  it('normalizes durations and interprets numeric settings as seconds', () => {
    expect(accessTokenTtl(' 15m\n')).toBe('15m');
    const jwt = new JwtService({ secret: 'test-only-secret' });
    const payload = jwt.decode(jwt.sign({}, { expiresIn: accessTokenTtl('900') }));
    expect(payload.exp - payload.iat).toBe(900);
  });
  it('rejects invalid configuration before accounts are created', () => {
    expect(() => accessTokenTtl('invalid')).toThrow('JWT_ACCESS_TTL');
  });
});
