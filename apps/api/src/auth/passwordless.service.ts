import { BadRequestException, ConflictException, Injectable, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { randomBytes, randomInt } from 'crypto';
import { and, eq, gt, isNull, sql } from 'drizzle-orm';
import { z } from 'zod';
import { InjectDb } from '../common/db.module';
import { Db } from '../db/client';
import { affiliateProfiles, authChallenges, lenderOrgs, loginIdentities, users } from '../db/schema';
import { AuditService } from '../common/audit.service';
import type { AuthUser } from '../common/auth';
import { sanitizeUser } from '../common/pagination';
import { validateIdentity } from '../personal-loans/personal.service';
import { AuthService, normalisePhone } from './auth.service';
import { decryptIdentity, encryptIdentity, secretHash } from './identity-crypto';
import { CompleteProfileDto, IdentitySignupDto, OtpFinishDto, OtpStartDto, SocialFinishDto, SocialStartDto } from './passwordless.dto';

const nonce = () => randomBytes(32).toString('base64url');
export function providerConfiguration(env = process.env) {
  return {
    google: !!(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET && env.AUTH_WEB_ORIGIN),
    apple: !!(env.APPLE_CLIENT_ID && env.APPLE_CLIENT_SECRET && env.AUTH_WEB_ORIGIN),
    whatsapp: !!(env.WHATSAPP_ACCESS_TOKEN && env.WHATSAPP_PHONE_NUMBER_ID && env.WHATSAPP_OTP_TEMPLATE && env.WHATSAPP_API_VERSION),
    identity: !!(env.IDENTITY_PROVIDER_URL && env.IDENTITY_PROVIDER_API_KEY),
  };
}

@Injectable()
export class PasswordlessService {
  constructor(@InjectDb() private db: Db, private auth: AuthService, private audit: AuditService) {}
  configuration() { return providerConfiguration(); }
  private origin() {
    const url = new URL(process.env.AUTH_WEB_ORIGIN!);
    if (url.protocol !== 'https:' && url.hostname !== 'localhost') throw new ServiceUnavailableException('Configure a secure sign-in origin');
    return url.origin;
  }
  private payload(dto: IdentitySignupDto) {
    const identity = validateIdentity(dto.identityType, dto.identityNumber);
    return { identityType: dto.identityType, identityNumber: identity.number, accountType: dto.accountType, consentAt: new Date().toISOString() };
  }
  async socialStart(dto: SocialStartDto) {
    if (!this.configuration()[dto.provider]) throw new ServiceUnavailableException(`${dto.provider === 'google' ? 'Google' : 'Apple'} sign-in will be available once its connection is configured. Demo accounts can be used meanwhile.`);
    const state = nonce(), binding = nonce(), verifier = nonce(), oidcNonce = nonce();
    const origin = this.origin(), redirectUri = origin + (dto.provider === 'google' ? '/auth/callback' : '/api/social-callback');
    const payload = { ...this.payload(dto), verifier, oidcNonce, redirectUri };
    await this.db.insert(authChallenges).values({ provider: dto.provider, secretHash: secretHash(state), bindingHash: secretHash(binding), payload: encryptIdentity(JSON.stringify(payload)), expiresAt: new Date(Date.now() + 600000) });
    const url = new URL(dto.provider === 'google' ? 'https://accounts.google.com/o/oauth2/v2/auth' : 'https://appleid.apple.com/auth/authorize');
    url.search = new URLSearchParams({ client_id: process.env[dto.provider === 'google' ? 'GOOGLE_CLIENT_ID' : 'APPLE_CLIENT_ID']!, redirect_uri: redirectUri, response_type: 'code', scope: 'openid email' + (dto.provider === 'google' ? ' profile' : ''), state, nonce: oidcNonce }).toString();
    if (dto.provider === 'google') {
      const { createHash } = await import('crypto');
      url.searchParams.set('code_challenge', createHash('sha256').update(verifier).digest('base64url'));
      url.searchParams.set('code_challenge_method', 'S256');
    } else { url.searchParams.set('scope', 'name email'); url.searchParams.set('response_mode', 'form_post'); }
    return { url: url.toString(), state, binding };
  }
  async socialFinish(dto: SocialFinishDto) {
    const challenge = await this.db.query.authChallenges.findFirst({ where: and(eq(authChallenges.secretHash, secretHash(dto.state)), isNull(authChallenges.consumedAt), gt(authChallenges.expiresAt, new Date())) });
    if (!challenge || challenge.bindingHash !== secretHash(dto.binding) || !['google', 'apple'].includes(challenge.provider)) throw new UnauthorizedException('Sign-in session expired or does not belong to this browser');
    const payload = JSON.parse(decryptIdentity(challenge.payload));
    const google = challenge.provider === 'google';
    const clientId = process.env[google ? 'GOOGLE_CLIENT_ID' : 'APPLE_CLIENT_ID']!;
    const body = new URLSearchParams({ code: dto.code, grant_type: 'authorization_code', client_id: clientId, client_secret: process.env[google ? 'GOOGLE_CLIENT_SECRET' : 'APPLE_CLIENT_SECRET']!, redirect_uri: payload.redirectUri });
    if (google) body.set('code_verifier', payload.verifier);
    const response = await fetch(google ? 'https://oauth2.googleapis.com/token' : 'https://appleid.apple.com/auth/token', { method: 'POST', body, signal: AbortSignal.timeout(15000) });
    if (!response.ok) throw new UnauthorizedException('The identity provider could not complete sign-in. Please start again.');
    const token = await response.json() as { id_token?: string };
    if (!token.id_token) throw new UnauthorizedException();
    const { createRemoteJWKSet, jwtVerify } = await import('jose');
    const { payload: claims } = await jwtVerify(token.id_token, createRemoteJWKSet(new URL(google ? 'https://www.googleapis.com/oauth2/v3/certs' : 'https://appleid.apple.com/auth/keys')), { issuer: google ? ['https://accounts.google.com', 'accounts.google.com'] : 'https://appleid.apple.com', audience: clientId, algorithms: ['RS256'] });
    if (claims.nonce !== payload.oidcNonce || !claims.sub) throw new UnauthorizedException('Invalid sign-in response');
    const consumed = await this.db.update(authChallenges).set({ consumedAt: new Date() }).where(and(eq(authChallenges.id, challenge.id), isNull(authChallenges.consumedAt))).returning({ id: authChallenges.id });
    if (!consumed.length) throw new UnauthorizedException('Sign-in response has already been used');
    const verified = claims.email_verified === true || claims.email_verified === 'true';
    return this.account(challenge.provider, claims.sub, payload, verified && typeof claims.email === 'string' ? claims.email : null, null, typeof claims.given_name === 'string' ? claims.given_name : '', typeof claims.family_name === 'string' ? claims.family_name : '');
  }
  async sendOtp(dto: OtpStartDto) {
    if (!this.configuration().whatsapp) throw new ServiceUnavailableException('WhatsApp verification will be available once its connection is configured. No code has been sent.');
    const mobile = normalisePhone(dto.mobile), code = String(randomInt(1000000)).padStart(6, '0');
    const [challenge] = await this.db.insert(authChallenges).values({ provider: 'whatsapp', secretHash: secretHash(code + ':' + nonce()), bindingHash: secretHash(code), payload: encryptIdentity(JSON.stringify({ ...this.payload(dto), mobile })), expiresAt: new Date(Date.now() + 300000) }).returning({ id: authChallenges.id });
    const version = process.env.WHATSAPP_API_VERSION!;
    if (!/^v\d+\.\d+$/.test(version)) throw new ServiceUnavailableException('WhatsApp connection configuration is invalid');
    const response = await fetch(`https://graph.facebook.com/${version}/${encodeURIComponent(process.env.WHATSAPP_PHONE_NUMBER_ID!)}/messages`, {
      method: 'POST', headers: { Authorization: `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ messaging_product: 'whatsapp', to: mobile.replace('+', ''), type: 'template', template: { name: process.env.WHATSAPP_OTP_TEMPLATE, language: { code: process.env.WHATSAPP_TEMPLATE_LANGUAGE || 'en_US' }, components: [{ type: 'body', parameters: [{ type: 'text', text: code }] }, { type: 'button', sub_type: 'url', index: '0', parameters: [{ type: 'text', text: code }] }] } }), signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) { await this.db.update(authChallenges).set({ consumedAt: new Date() }).where(eq(authChallenges.id, challenge.id)); throw new ServiceUnavailableException('WhatsApp could not send your code. Try again later.'); }
    return { challengeId: challenge.id, expiresInSeconds: 300 };
  }
  async verifyOtp(dto: OtpFinishDto) {
    // Persist each failed attempt before throwing; a rollback must not reset the retry budget.
    const result = await this.db.transaction(async tx => {
      const [c] = await tx.select().from(authChallenges).where(eq(authChallenges.id, dto.challengeId)).for('update');
      if (!c || c.provider !== 'whatsapp' || c.consumedAt || c.expiresAt < new Date() || c.attempts >= 5) return null;
      const ok = c.bindingHash === secretHash(dto.code);
      await tx.update(authChallenges).set({ attempts: c.attempts + 1, consumedAt: ok ? new Date() : null }).where(eq(authChallenges.id, c.id));
      return ok ? JSON.parse(decryptIdentity(c.payload)) : null;
    });
    if (!result) throw new UnauthorizedException('Incorrect, expired or already used code. Request a new code if needed.');
    return this.account('whatsapp', result.mobile, result, null, result.mobile, '', '');
  }
  private async account(provider: string, subject: string, payload: { identityType: 'ID' | 'PASSPORT'; identityNumber: string; accountType: 'CONSUMER' | 'LENDER' | 'AFFILIATE'; consentAt: string }, email: string | null, phone: string | null, firstName: string, lastName: string) {
    const link = await this.db.query.loginIdentities.findFirst({ where: and(eq(loginIdentities.provider, provider), eq(loginIdentities.subject, subject)) });
    const hash = secretHash(payload.identityType + ':' + payload.identityNumber);
    let user = link ? await this.db.query.users.findFirst({ where: eq(users.id, link.userId) }) : null;
    if (user && user.identityHash !== hash) throw new UnauthorizedException('The document does not match this account');
    if (!user) {
      if (await this.db.query.users.findFirst({ where: eq(users.identityHash, hash) })) throw new ConflictException('An account already uses this identity. Sign in with its original method or contact support.');
      if (email && await this.db.query.users.findFirst({ where: eq(users.email, email) })) throw new ConflictException('This email belongs to an existing account. Use its existing sign-in method.');
      if (phone && await this.db.query.users.findFirst({ where: eq(users.phone, phone) })) throw new ConflictException('This mobile number belongs to an existing account. Use its existing sign-in method.');
      user = await this.db.transaction(async tx => {
        const [u] = await tx.insert(users).values({ email, phone, firstName: firstName.slice(0, 80), lastName: lastName.slice(0, 80), profileComplete: false, roles: [payload.accountType], referralCode: 'XC' + randomBytes(6).toString('hex').toUpperCase(), identityType: payload.identityType, identityEncrypted: encryptIdentity(payload.identityNumber), identityHash: hash }).returning();
        await tx.insert(loginIdentities).values({ userId: u.id, provider, subject });
        if (payload.accountType === 'AFFILIATE') await tx.insert(affiliateProfiles).values({ userId: u.id });
        await this.audit.log({ id: u.id, email: u.email ?? '', roles: u.roles }, 'auth.passwordless_registered', 'user', u.id, { provider, consentAt: payload.consentAt }, tx);
        return u;
      });
    }
    if (user.status !== 'ACTIVE') throw new UnauthorizedException('Account unavailable');
    return { user: sanitizeUser(user), ...(await this.auth.issueTokens(user)) };
  }
  async identity(u: AuthUser) {
    const user = await this.db.query.users.findFirst({ where: eq(users.id, u.id) });
    return { identityType: user?.identityType ?? null, identityNumber: user?.identityEncrypted ? decryptIdentity(user.identityEncrypted) : null };
  }
  async prefill(u: AuthUser) {
    if (!this.configuration().identity) return { available: false, message: 'Identity data provider is not connected yet. Enter your name to continue.' };
    const identity = await this.identity(u);
    if (!identity.identityNumber) throw new BadRequestException('No identity document is attached to this account');
    const url = new URL(process.env.IDENTITY_PROVIDER_URL!);
    if (url.protocol !== 'https:') throw new ServiceUnavailableException('Identity provider must use HTTPS');
    // This is XTRA-CASH's adapter contract, not a claimed public HANIS API.
    const response = await fetch(url, { method: 'POST', headers: { Authorization: `Bearer ${process.env.IDENTITY_PROVIDER_API_KEY}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ ...identity, purpose: 'profile_prefill', consent: true }), signal: AbortSignal.timeout(15000) });
    if (!response.ok) throw new ServiceUnavailableException('Identity profile retrieval is unavailable. You can enter your name instead.');
    const profile = z.object({ firstName: z.string().min(1).max(80), lastName: z.string().min(1).max(80), reference: z.string().min(1).max(200) }).safeParse(await response.json());
    if (!profile.success) throw new ServiceUnavailableException('Identity provider returned an unsupported profile');
    await this.audit.log(u, 'identity.profile_prefill', 'user', u.id, { providerReference: profile.data.reference });
    return { available: true, firstName: profile.data.firstName, lastName: profile.data.lastName };
  }
  async completeProfile(u: AuthUser, dto: CompleteProfileDto) {
    if (!dto.firstName.trim() || !dto.lastName.trim()) throw new BadRequestException('Enter your name and surname');
    if (u.roles.includes('LENDER') && !dto.lenderName?.trim()) throw new BadRequestException('Enter your lending business name');
    const current = await this.db.query.users.findFirst({ where: eq(users.id, u.id) });
    if (!current || current.profileComplete) throw new BadRequestException('Profile is already complete');
    await this.db.transaction(async tx => {
      await tx.update(users).set({ firstName: dto.firstName.trim(), lastName: dto.lastName.trim(), profileComplete: true }).where(eq(users.id, u.id));
      if (u.roles.includes('LENDER')) await tx.insert(lenderOrgs).values({ ownerUserId: u.id, name: dto.lenderName!.trim(), contactEmail: current.email ?? '', contactPhone: current.phone ?? '' });
      await this.audit.log(u, 'user.profile_completed', 'user', u.id, {}, tx);
    });
    return { ok: true };
  }
}
