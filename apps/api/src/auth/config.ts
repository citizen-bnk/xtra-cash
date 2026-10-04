import { JwtService } from '@nestjs/jwt';
import type { JwtSignOptions } from '@nestjs/jwt';

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
