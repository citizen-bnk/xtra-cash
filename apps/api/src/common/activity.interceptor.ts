import { CallHandler, ExecutionContext, HttpException, Injectable, NestInterceptor } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { catchError, concatMap, defer, from, mergeMap, throwError } from 'rxjs';
import { AuditService } from './audit.service';
import type { AuthUser } from './auth';

@Injectable()
export class ActivityInterceptor implements NestInterceptor {
  constructor(private audit: AuditService) {}

  intercept(context: ExecutionContext, next: CallHandler) {
    const request = context.switchToHttp().getRequest();
    const actor = request.user as AuthUser | undefined;
    if (!actor?.id) return next.handle();
    const requestId = randomUUID();
    const operation = `${context.getClass().name}.${context.getHandler().name}`;
    const startedAt = Date.now();
    const meta = { requestId, method: request.method, operation, source: 'USER_API' };
    const logOutcome = async (outcome: 'SUCCESS' | 'FAILED', status: number) => {
      try {
        await this.audit.log(actor, 'activity.request_finished', 'api_operation', null, {
          ...meta, outcome, status, durationMs: Date.now() - startedAt,
        });
      } catch {
        console.error(JSON.stringify({ event: 'activity_log_failure', requestId, operation, outcome, status }));
      }
    };
    return defer(() => this.audit.log(actor, 'activity.request_started', 'api_operation', null, meta)).pipe(
      mergeMap(() => next.handle().pipe(
        concatMap(result => from(logOutcome('SUCCESS', context.switchToHttp().getResponse().statusCode)).pipe(mergeMap(() => [result]))),
        catchError(error => from(logOutcome('FAILED', error instanceof HttpException ? error.getStatus() : 500))
          .pipe(mergeMap(() => throwError(() => error)))),
      )),
    );
  }
}
