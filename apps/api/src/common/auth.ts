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

export interface AuthUser {
  id: string;
  email: string;
  roles: Role[];
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
  constructor(private jwt: JwtService, private reflector: Reflector) {}

  canActivate(ctx: ExecutionContext): boolean {
    const targets = [ctx.getHandler(), ctx.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, targets)) return true;

    const req = ctx.switchToHttp().getRequest();
    const header: string | undefined = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) throw new UnauthorizedException('Missing access token');
    try {
      const payload = this.jwt.verify(header.slice(7));
      req.user = { id: payload.sub, email: payload.email, roles: payload.roles } satisfies AuthUser;
    } catch {
      throw new UnauthorizedException('Invalid or expired access token');
    }

    const required = this.reflector.getAllAndOverride<Role[]>(ROLES, targets);
    if (required?.length) {
      const roles: Role[] = req.user.roles ?? [];
      if (!required.some((r) => roles.includes(r))) throw new ForbiddenException('You do not have access to this resource');
    }
    return true;
  }
}
