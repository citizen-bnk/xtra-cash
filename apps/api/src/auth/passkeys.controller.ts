import { BadRequestException, Body, Controller, Delete, ForbiddenException, Get, Param, Post, UnauthorizedException } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { IsObject, IsString, MaxLength, MinLength } from 'class-validator';
import { randomBytes, createHash } from 'crypto';
import { and, eq, gt, isNull } from 'drizzle-orm';
import { generateAuthenticationOptions, generateRegistrationOptions, verifyAuthenticationResponse, verifyRegistrationResponse } from '@simplewebauthn/server';
import type { AuthenticationResponseJSON, RegistrationResponseJSON } from '@simplewebauthn/server';
import { CurrentUser, Public, type AuthUser } from '../common/auth';
import { InjectDb } from '../common/db.module';
import type { Db } from '../db/client';
import { authChallenges, passkeys, refreshTokens, users } from '../db/schema';
import { AuthService } from './auth.service';
import { AuditService } from '../common/audit.service';
import { sanitizeUser } from '../common/pagination';

class OriginDto { @IsString() @MaxLength(300) origin: string; }
class FinishDto extends OriginDto {
  @IsString() @MaxLength(80) challengeId: string;
  @IsString() @MinLength(32) @MaxLength(80) binding: string;
  @IsObject() response: RegistrationResponseJSON & AuthenticationResponseJSON;
}
const hash = (v: string) => createHash('sha256').update(v).digest('hex');
export function relyingParty(origin: string) {
  const defaults = ['https://web-tawny-three-22.vercel.app', 'https://xtra-cash-admin.vercel.app'];
  if (process.env.NODE_ENV !== 'production') defaults.push('http://localhost:3000', 'http://localhost:3001');
  const allowed = (process.env.PASSKEY_ORIGINS || defaults.join(',')).split(',').map(x => x.trim());
  if (!allowed.includes(origin)) throw new BadRequestException('Passkeys are available on the main XTRA-CASH website.');
  const url = new URL(origin);
  if (url.origin !== origin || (url.protocol !== 'https:' && url.hostname !== 'localhost')) throw new BadRequestException('Invalid passkey origin');
  return url.hostname;
}
export function requireRecentAuth(u: AuthUser) {
  if (!u.authenticatedAt || Date.now() / 1000 - u.authenticatedAt > 300) throw new ForbiddenException('Sign in again to change your security settings.');
}

@Controller('auth/passkeys')
export class PasskeysController {
  constructor(@InjectDb() private db: Db, private auth: AuthService, private audit: AuditService) {}

  private async challenge(provider: string, challenge: string, origin: string, userId?: string) {
    const binding = randomBytes(32).toString('base64url');
    const [row] = await this.db.insert(authChallenges).values({ provider, secretHash: hash(challenge), bindingHash: hash(binding), payload: JSON.stringify({ challenge, origin, userId }), expiresAt: new Date(Date.now() + 300000) }).returning({ id: authChallenges.id });
    return { challengeId: row.id, binding };
  }
  private async consume(dto: FinishDto, provider: string, userId?: string) {
    relyingParty(dto.origin);
    const c = await this.db.query.authChallenges.findFirst({ where: and(eq(authChallenges.id, dto.challengeId), eq(authChallenges.provider, provider), eq(authChallenges.bindingHash, hash(dto.binding)), isNull(authChallenges.consumedAt), gt(authChallenges.expiresAt, new Date())) });
    if (!c) throw new UnauthorizedException('Passkey request expired. Please try again.');
    const payload = JSON.parse(c.payload) as { challenge: string; origin: string; userId?: string };
    if (payload.origin !== dto.origin || payload.userId !== userId) throw new UnauthorizedException('Passkey request does not belong to this session');
    const consumed = await this.db.update(authChallenges).set({ consumedAt: new Date() }).where(and(eq(authChallenges.id, c.id), isNull(authChallenges.consumedAt))).returning({ id: authChallenges.id });
    if (!consumed.length) throw new UnauthorizedException('Passkey request already used');
    return payload;
  }
  @Get()
  async list(@CurrentUser() u: AuthUser) {
    return this.db.select({ id: passkeys.id, name: passkeys.name, rpId: passkeys.rpId, createdAt: passkeys.createdAt, lastUsedAt: passkeys.lastUsedAt }).from(passkeys).where(eq(passkeys.userId, u.id));
  }
  @Post('register/options') @Throttle({ default: { limit: 5, ttl: 60000 } })
  async registerOptions(@CurrentUser() u: AuthUser, @Body() dto: OriginDto) {
    requireRecentAuth(u);
    const rpID = relyingParty(dto.origin);
    const existing = await this.db.select({ id: passkeys.id }).from(passkeys).where(and(eq(passkeys.userId, u.id), eq(passkeys.rpId, rpID)));
    if (existing.length >= 10) throw new BadRequestException('You already have ten passkeys. Remove an unused one first.');
    const options = await generateRegistrationOptions({ rpID, rpName: 'XTRA-CASH', userID: new TextEncoder().encode(u.id), userName: u.email || `XTRA-CASH ${u.id.slice(0, 8)}`, attestationType: 'none', excludeCredentials: existing, authenticatorSelection: { residentKey: 'required', userVerification: 'required' } });
    return { options, ...await this.challenge('passkey-register', options.challenge, dto.origin, u.id) };
  }
  @Post('register/verify') @Throttle({ default: { limit: 5, ttl: 60000 } })
  async registerVerify(@CurrentUser() u: AuthUser, @Body() dto: FinishDto) {
    requireRecentAuth(u);
    const c = await this.consume(dto, 'passkey-register', u.id);
    const rpID = relyingParty(dto.origin);
    try {
      const result = await verifyRegistrationResponse({ response: dto.response, expectedChallenge: c.challenge, expectedOrigin: c.origin, expectedRPID: rpID, requireUserVerification: true });
      if (!result.verified || !result.registrationInfo) throw new Error('Not verified');
      const credential = result.registrationInfo.credential;
      await this.db.insert(passkeys).values({ id: credential.id, userId: u.id, publicKey: Buffer.from(credential.publicKey).toString('base64url'), counter: credential.counter, transports: credential.transports ?? [], rpId: rpID });
      await this.audit.log(u, 'passkey.added', 'user', u.id, { rpId: rpID });
      return { ok: true };
    } catch { throw new BadRequestException('Could not register this passkey. Please try again.'); }
  }
  @Public() @Post('login/options') @Throttle({ default: { limit: 10, ttl: 60000 } })
  async loginOptions(@Body() dto: OriginDto) {
    const options = await generateAuthenticationOptions({ rpID: relyingParty(dto.origin), userVerification: 'required' });
    return { options, ...await this.challenge('passkey-login', options.challenge, dto.origin) };
  }
  @Public() @Post('login/verify') @Throttle({ default: { limit: 10, ttl: 60000 } })
  async loginVerify(@Body() dto: FinishDto) {
    const c = await this.consume(dto, 'passkey-login');
    const rpId = relyingParty(dto.origin);
    const credential = await this.db.query.passkeys.findFirst({ where: and(eq(passkeys.id, String(dto.response.id)), eq(passkeys.rpId, rpId)) });
    if (!credential) throw new UnauthorizedException('Could not sign in with this passkey');
    const user = await this.db.query.users.findFirst({ where: eq(users.id, credential.userId) });
    if (!user || user.status !== 'ACTIVE') throw new UnauthorizedException('Could not sign in with this passkey');
    if (dto.response.response.userHandle !== Buffer.from(user.id).toString('base64url')) throw new UnauthorizedException('Invalid passkey account');
    try {
      const result = await verifyAuthenticationResponse({ response: dto.response, expectedChallenge: c.challenge, expectedOrigin: c.origin, expectedRPID: rpId, requireUserVerification: true, credential: { id: credential.id, publicKey: Buffer.from(credential.publicKey, 'base64url'), counter: credential.counter } });
      if (!result.verified) throw new Error('Not verified');
      const updated = await this.db.update(passkeys).set({ counter: result.authenticationInfo.newCounter, lastUsedAt: new Date() }).where(and(eq(passkeys.id, credential.id), eq(passkeys.counter, credential.counter))).returning({ id: passkeys.id });
      if (!updated.length) throw new Error('Credential changed during verification');
    } catch { throw new UnauthorizedException('Could not verify this passkey. Please try again.'); }
    await this.audit.log({ id: user.id, email: user.email, roles: user.roles }, 'passkey.sign_in', 'user', user.id, { rpId });
    return { user: sanitizeUser(user), ...await this.auth.issueTokens(user) };
  }
  @Delete(':id')
  async remove(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    requireRecentAuth(u);
    // Existing password remains the recovery method until verified providers are connected.
    const user = await this.db.query.users.findFirst({ where: eq(users.id, u.id) });
    const keys = await this.list(u);
    if (!user?.passwordHash && keys.length <= 1) throw new BadRequestException('Add another sign-in method before removing your last passkey.');
    await this.db.delete(passkeys).where(and(eq(passkeys.id, id), eq(passkeys.userId, u.id)));
    await this.audit.log(u, 'passkey.removed', 'user', u.id);
    return { ok: true };
  }
}

@Controller('auth/sessions')
export class SessionsController {
  constructor(@InjectDb() private db: Db) {}
  @Get() async list(@CurrentUser() u: AuthUser) {
    const rows = await this.db.select({ id: refreshTokens.id, createdAt: refreshTokens.createdAt, authenticatedAt: refreshTokens.authenticatedAt }).from(refreshTokens).where(and(eq(refreshTokens.userId, u.id), isNull(refreshTokens.revokedAt), gt(refreshTokens.expiresAt, new Date())));
    return rows.map(r => ({ ...r, current: r.id === u.sessionId }));
  }
  @Delete(':id') async remove(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    requireRecentAuth(u);
    await this.db.update(refreshTokens).set({ revokedAt: new Date(), replacementEncrypted: null }).where(and(eq(refreshTokens.id, id), eq(refreshTokens.userId, u.id)));
    return { ok: true };
  }
}
