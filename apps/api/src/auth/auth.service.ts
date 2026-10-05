import { BadRequestException, ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { createHash, randomBytes } from 'crypto';
import { and, eq, gt, isNull, or } from 'drizzle-orm';
import type { Role } from '@xtra/shared';
import { InjectDb } from '../common/db.module';
import { Db, DbOrTx } from '../db/client';
import { decryptIdentity, encryptIdentity } from './identity-crypto';
import { affiliateProfiles, lenderOrgs, refreshTokens, users } from '../db/schema';
import { sanitizeUser } from '../common/pagination';
import { AuditService } from '../common/audit.service';
import { QuickRegisterDto, RegisterDto } from './auth.dto';
import { isEmail } from 'class-validator';
import { refreshTokenDays } from './config';

const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');
const REF_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function normalisePhone(phone: string) {
  const p = phone.replace(/\s/g, '');
  return p.startsWith('0') ? `+27${p.slice(1)}` : p;
}

@Injectable()
export class AuthService {
  constructor(@InjectDb() private db: Db, private jwt: JwtService, private audit: AuditService) {}

  private newReferralCode() {
    const bytes = randomBytes(6);
    return 'XC' + Array.from(bytes, (b) => REF_ALPHABET[b % REF_ALPHABET.length]).join('');
  }

  async quickRegister(dto: QuickRegisterDto) {
    if (Buffer.byteLength(dto.password, 'utf8') > 72) throw new BadRequestException('Use a password of at most 72 UTF-8 bytes');
    const identifier = dto.identifier.trim();
    const email = isEmail(identifier) ? identifier.toLowerCase() : undefined;
    const phone = /^(\+27|0)[6-8][0-9]{8}$/.test(identifier) ? identifier : undefined;
    if (!email && !phone) throw new BadRequestException('Enter a valid email or South African mobile number');
    if (!dto.consent) throw new BadRequestException('Accept the terms to create your account');
    return this.register({ ...dto, email, phone, firstName: '', lastName: '' } as RegisterDto, true);
  }

  async register(dto: RegisterDto, quick = false) {
    const email = dto.email?.toLowerCase().trim() ?? null;
    const phone = dto.phone ? normalisePhone(dto.phone) : null;
    const existing = await this.db.query.users.findFirst({ where: or(email ? eq(users.email, email) : undefined, phone ? eq(users.phone, phone) : undefined) });
    if (existing) throw new ConflictException('An account with this email or phone already exists');
    if (!quick && dto.accountType === 'LENDER' && !dto.lenderName) throw new BadRequestException('lenderName is required for lender accounts');

    let referredById: string | null = null;
    if (dto.referralCode) {
      const ref = await this.db.query.users.findFirst({ where: eq(users.referralCode, dto.referralCode.toUpperCase().trim()) });
      if (!ref) throw new BadRequestException('Referral code not found');
      referredById = ref.id;
    }

    const roles: Role[] = dto.accountType === 'LENDER' ? ['LENDER'] : dto.accountType === 'AFFILIATE' ? ['AFFILIATE'] : ['CONSUMER'];
    const passwordHash = await bcrypt.hash(dto.password, 12);

    const user = await this.db.transaction(async (tx) => {
      const [u] = await tx
        .insert(users)
        .values({
          email,
          phone,
          passwordHash,
          firstName: dto.firstName.trim(),
          lastName: dto.lastName.trim(),
          profileComplete: !quick,
          roles,
          referralCode: this.newReferralCode(),
          referredById,
        })
        .returning();
      if (dto.accountType === 'LENDER') {
        await tx.insert(lenderOrgs).values({ ownerUserId: u.id, name: dto.lenderName?.trim() || 'My lending business', contactEmail: email ?? '', contactPhone: phone ?? '' });
      }
      if (dto.accountType === 'AFFILIATE') await tx.insert(affiliateProfiles).values({ userId: u.id });
      await this.audit.log({ id: u.id, email, roles }, 'user.registered', 'user', u.id, { accountType: dto.accountType, referredById, ...(quick ? { consentAt: new Date().toISOString(), profileDeferred: true } : {}) }, tx);
      return u;
    });

    return { user: sanitizeUser(user), ...(await this.issueTokens(user)) };
  }

  async login(identifier: string, password: string) {
    const id = identifier.trim().toLowerCase();
    const user = await this.db.query.users.findFirst({
      where: or(eq(users.email, id), eq(users.phone, /^[0+]/.test(id) ? normalisePhone(id) : id)),
    });
    // Constant-ish time: always run bcrypt even when the user is missing.
    const ok = await bcrypt.compare(password, user?.passwordHash ?? '$2a$12$invalidinvalidinvalidinvalidinvalidinvalidinvalidinva');
    if (!user || !ok) throw new UnauthorizedException('Incorrect email/phone or password');
    if (user.status === 'SUSPENDED') throw new UnauthorizedException('This account is suspended. Please contact support.');
    return { user: sanitizeUser(user), ...(await this.issueTokens(user)) };
  }

  async refresh(refreshToken: string) {
    const hash = sha256(refreshToken);
    return this.db.transaction(async tx => {
      const [row] = await tx.select().from(refreshTokens).where(and(eq(refreshTokens.tokenHash, hash), gt(refreshTokens.expiresAt, new Date()))).for('update');
      if (!row) throw new UnauthorizedException('Refresh token is invalid or expired');
      const user = await tx.query.users.findFirst({ where: eq(users.id, row.userId) });
      if (!user || user.status !== 'ACTIVE') throw new UnauthorizedException('Account unavailable');
      // Parallel requests can arrive on different serverless instances. A short,
      // encrypted replay window returns the SAME replacement, never another session.
      if (row.revokedAt) {
        if (row.replacementEncrypted && Date.now() - row.revokedAt.getTime() < 10000) return JSON.parse(decryptIdentity(row.replacementEncrypted)) as { accessToken: string; refreshToken: string };
        throw new UnauthorizedException('Session has ended');
      }
      const tokens = await this.issueTokens(user, row.authenticatedAt, tx);
      await tx.update(refreshTokens).set({ revokedAt: new Date(), replacementEncrypted: encryptIdentity(JSON.stringify(tokens)) }).where(eq(refreshTokens.id, row.id));
      return tokens;
    });
  }

  async logout(refreshToken: string) {
    await this.db.update(refreshTokens).set({ revokedAt: new Date(), replacementEncrypted: null }).where(eq(refreshTokens.tokenHash, sha256(refreshToken)));
    return { ok: true };
  }

  /** Revokes every session for a user (e.g. on suspension or role change). */
  async revokeAll(userId: string) {
    await this.db.update(refreshTokens).set({ revokedAt: new Date(), replacementEncrypted: null }).where(eq(refreshTokens.userId, userId));
  }

  async issueTokens(user: { id: string; email: string | null; roles: Role[] }, authenticatedAt = new Date(), conn: DbOrTx = this.db) {
    const refreshToken = randomBytes(48).toString('base64url');
    const days = refreshTokenDays();
    const [session] = await conn.insert(refreshTokens).values({
      userId: user.id,
      tokenHash: sha256(refreshToken),
      expiresAt: new Date(Date.now() + days * 86_400_000),
      authenticatedAt,
    }).returning({ id: refreshTokens.id });
    const accessToken = this.jwt.sign({ sub: user.id, email: user.email ?? '', roles: user.roles, sid: session.id, auth_time: Math.floor(authenticatedAt.getTime() / 1000) });
    return { accessToken, refreshToken };
  }
}
