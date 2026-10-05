import { JwtService } from '@nestjs/jwt';
import type { JwtSignOptions } from '@nestjs/jwt';

export function refreshTokenDays(raw = process.env.REFRESH_TTL_DAYS): number {
  const days = Number(raw?.trim() || '30');
  if (!Number.isInteger(days) || days < 1 || days > 90) {
    throw new Error('REFRESH_TTL_DAYS must be an integer between 1 and 90');
  }
  return days;
}

export function accessTokenTtl(raw = process.env.JWT_ACCESS_TTL): JwtSignOptions['expiresIn'] {
  const value = raw?.trim() || '15m';
  const ttl = /^\d+$/.test(value) ? Number(value) : value as JwtSignOptions['expiresIn'];
  try {
    // Validate with the same parser used when issuing real tokens, without a real secret.
    new JwtService({ secret: 'configuration-validation-only' }).sign({}, { expiresIn: ttl });
  } catch {
    throw new Error('JWT_ACCESS_TTL must be seconds or a duration such as 15m');
  }
  return ttl;
}
