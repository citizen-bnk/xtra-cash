import {
  CanActivate,
  createParamDecorator,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  SetMetadata,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import type { Role } from '@xtra/shared';
import { eq } from 'drizzle-orm';
import { InjectDb } from './db.module';
import type { Db } from '../db/client';
import { refreshTokens, users } from '../db/schema';

export interface AuthUser {
  id: string;
  email: string | null;
  roles: Role[];
  authenticatedAt?: number;
  sessionId?: string;
}

export const IS_PUBLIC = 'isPublic';
export const Public = () => SetMetadata(IS_PUBLIC, true);

export const ROLES = 'roles';
/** Restricts a controller/route to users holding at least one of the roles. */
export const Roles = (...roles: Role[]) => SetMetadata(ROLES, roles);

export const CurrentUser = createParamDecorator((_: unknown, ctx: ExecutionContext): AuthUser => {
  return ctx.switchToHttp().getRequest().user;
});

/** Global guard: JWT required unless @Public(); then role check when @Roles() present. */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private jwt: JwtService, private reflector: Reflector, @InjectDb() private db: Db) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const targets = [ctx.getHandler(), ctx.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, targets)) return true;

    const req = ctx.switchToHttp().getRequest();
    const header: string | undefined = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) throw new UnauthorizedException('Missing access token');
    try {
      const payload = this.jwt.verify(header.slice(7));
      req.user = { id: payload.sub, email: payload.email, roles: payload.roles, authenticatedAt: payload.auth_time, sessionId: payload.sid } satisfies AuthUser;
    } catch {
      throw new UnauthorizedException('Invalid or expired access token');
    }
    const account = await this.db.query.users.findFirst({ where: eq(users.id, req.user.id) });
    if (!account || account.status !== 'ACTIVE') throw new UnauthorizedException('Account unavailable');
    req.user.roles = account.roles;
    if (req.user.sessionId) {
      const session = await this.db.query.refreshTokens.findFirst({ where: eq(refreshTokens.id, req.user.sessionId) });
      if (!session || session.userId !== account.id || session.revokedAt || session.expiresAt < new Date()) throw new UnauthorizedException('Session ended. Please sign in again.');
    }
    const profileRoutes = ['/me', '/auth/passwordless/identity', '/auth/passwordless/profile', '/auth/passwordless/profile-prefill', '/auth/logout', '/auth/refresh'];
    const browsing = req.method === 'GET';
    const security = req.path.startsWith('/auth/passkeys') || req.path.startsWith('/auth/sessions');
    if (!account.profileComplete && !browsing && !security && !profileRoutes.includes(req.path)) throw new ForbiddenException('Add your name and surname to continue with this service');

    const required = this.reflector.getAllAndOverride<Role[]>(ROLES, targets);
    if (required?.length) {
      const roles: Role[] = req.user.roles ?? [];
      if (!required.some((r) => roles.includes(r))) throw new ForbiddenException('You do not have access to this resource');
    }
    return true;
  }
}
