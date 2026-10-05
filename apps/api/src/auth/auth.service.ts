import { BadRequestException, ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { createHash, randomBytes } from 'crypto';
import { and, eq, gt, isNull, or } from 'drizzle-orm';
import type { Role } from '@xtra/shared';
import { InjectDb } from '../common/db.module';
import { Db } from '../db/client';
import { affiliateProfiles, lenderOrgs, refreshTokens, users } from '../db/schema';
import { sanitizeUser } from '../common/pagination';
import { AuditService } from '../common/audit.service';
import { RegisterDto } from './auth.dto';

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

  async register(dto: RegisterDto) {
    const email = dto.email.toLowerCase().trim();
    const phone = normalisePhone(dto.phone);
    const existing = await this.db.query.users.findFirst({ where: or(eq(users.email, email), eq(users.phone, phone)) });
    if (existing) throw new ConflictException('An account with this email or phone already exists');
    if (dto.accountType === 'LENDER' && !dto.lenderName) throw new BadRequestException('lenderName is required for lender accounts');

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
          roles,
          referralCode: this.newReferralCode(),
          referredById,
        })
        .returning();
      if (dto.accountType === 'LENDER') {
        await tx.insert(lenderOrgs).values({ ownerUserId: u.id, name: dto.lenderName!.trim(), contactEmail: email, contactPhone: phone });
      }
      if (dto.accountType === 'AFFILIATE') await tx.insert(affiliateProfiles).values({ userId: u.id });
      await this.audit.log({ id: u.id, email, roles }, 'user.registered', 'user', u.id, { accountType: dto.accountType, referredById }, tx);
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
    const row = await this.db.query.refreshTokens.findFirst({
      where: and(eq(refreshTokens.tokenHash, hash), isNull(refreshTokens.revokedAt), gt(refreshTokens.expiresAt, new Date())),
    });
    if (!row) throw new UnauthorizedException('Refresh token is invalid or expired');
    const user = await this.db.query.users.findFirst({ where: eq(users.id, row.userId) });
    if (!user || user.status === 'SUSPENDED') throw new UnauthorizedException('Account unavailable');
    // Rotate: revoke the used token and issue a new pair.
    await this.db.update(refreshTokens).set({ revokedAt: new Date() }).where(eq(refreshTokens.id, row.id));
    return this.issueTokens(user);
  }

  async logout(refreshToken: string) {
    await this.db.update(refreshTokens).set({ revokedAt: new Date() }).where(eq(refreshTokens.tokenHash, sha256(refreshToken)));
    return { ok: true };
  }

  /** Revokes every session for a user (e.g. on suspension or role change). */
  async revokeAll(userId: string) {
    await this.db.update(refreshTokens).set({ revokedAt: new Date() }).where(and(eq(refreshTokens.userId, userId), isNull(refreshTokens.revokedAt)));
  }

  async issueTokens(user: { id: string; email: string | null; roles: Role[] }) {
    const accessToken = this.jwt.sign({ sub: user.id, email: user.email ?? '', roles: user.roles });
    const refreshToken = randomBytes(48).toString('base64url');
    const days = Number(process.env.REFRESH_TTL_DAYS ?? 30);
    await this.db.insert(refreshTokens).values({
      userId: user.id,
      tokenHash: sha256(refreshToken),
      expiresAt: new Date(Date.now() + days * 86_400_000),
    });
    return { accessToken, refreshToken };
  }
}
