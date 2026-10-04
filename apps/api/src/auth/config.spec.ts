import { JwtService } from '@nestjs/jwt';
import { accessTokenTtl } from './config';

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
