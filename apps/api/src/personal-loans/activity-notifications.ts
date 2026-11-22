import { BadRequestException, Body, CallHandler, Controller, Delete, ExecutionContext, Get, Headers, Inject, Injectable, Module, NestInterceptor, Post, UnauthorizedException } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { createHash, timingSafeEqual } from 'crypto';
import { Pool } from 'pg';
import { mergeMap } from 'rxjs/operators';
import { z } from 'zod';
import * as webpush from 'web-push';
import { PG_POOL } from '../common/db.module';
import { CurrentUser, Public, Roles, type AuthUser } from '../common/auth';
import { decryptIdentity, encryptIdentity } from '../auth/identity-crypto';
import { parse } from '../payday/payday.dto';

export function notificationUrl(path: string) {
  if (!/^\/(?:app\/(?:applications\/[A-Za-z0-9-]+|pay|wallet)|lender\/applications\/[A-Za-z0-9-]+|applications\/[A-Za-z0-9-]+|money)$/.test(path))
    throw new BadRequestException('Notification destination unavailable.');
  const admin = path === '/money' || path.startsWith('/applications/');
  const origin = admin ? process.env.ADMIN_APP_URL || 'https://xtra-cash-admin.vercel.app'
    : process.env.CUSTOMER_APP_URL || 'https://xtra-cash.vercel.app';
  return new URL(path, origin).toString();
}
@Injectable()
export class ActivityNotifications {
  constructor(@Inject(PG_POOL) private pool: Pool) {}
  configuration() {
    return { email: !!(process.env.RESEND_API_KEY && process.env.NOTIFICATION_FROM_EMAIL),
      push: !!(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY),
      vapidPublicKey: process.env.VAPID_PUBLIC_KEY || null };
  }
  async inbox(userId: string) {
    const { rows } = await this.pool.query('SELECT * FROM activity_notifications WHERE user_id=$1 ORDER BY created_at DESC LIMIT 100', [userId]);
    return rows.map(n => ({ key: 'activity:' + n.id, applicationId: n.application_id ?? 'wallet',
      title: n.title, description: n.body, cta: n.cta, owner: n.owner, read: !!n.read_at,
      kind: 'ACTIVITY', path: n.path, url: notificationUrl(n.path) }));
  }
  async read(userId: string, key: string) {
    const result = await this.pool.query('UPDATE activity_notifications SET read_at=COALESCE(read_at,now()) WHERE id=$1 AND user_id=$2 RETURNING id', [key.replace(/^activity:/, ''), userId]);
    return { ok: !!result.rows.length };
  }
  async device(userId: string, body: unknown) {
    if (!this.configuration().push) throw new BadRequestException('Device notifications await activation.');
    const input = parse(z.object({ endpoint: z.string().url().max(2000),
      keys: z.object({ p256dh: z.string().regex(/^[\w-]{80,100}$/), auth: z.string().regex(/^[\w-]{20,30}$/) }).strict(),
    }).strict(), body);
    const url = new URL(input.endpoint), host = url.hostname;
    if (url.protocol !== 'https:' || url.port || url.username || url.password
      || !(host === 'fcm.googleapis.com' || host === 'web.push.apple.com' || host === 'updates.push.services.mozilla.com'
        || host.endsWith('.push.services.mozilla.com') || host.endsWith('.notify.windows.com')))
      throw new BadRequestException('Unsupported push subscription.');
    const hash = createHash('sha256').update(input.endpoint).digest('hex');
    await this.pool.query('INSERT INTO notification_devices(user_id,endpoint_hash,payload_encrypted) VALUES($1,$2,$3) ON CONFLICT(endpoint_hash) DO UPDATE SET user_id=excluded.user_id,payload_encrypted=excluded.payload_encrypted,active=true',
      [userId,hash,encryptIdentity(JSON.stringify(input))]);
    return { ok: true };
  }
  async remove(userId: string, body: unknown) {
    const input = parse(z.object({ endpoint: z.string().url().max(2000) }).strict(), body);
    await this.pool.query('UPDATE notification_devices SET active=false WHERE user_id=$1 AND endpoint_hash=$2',
      [userId, createHash('sha256').update(input.endpoint).digest('hex')]);
    return { ok: true };
  }
  async delivery() {
    const result = await this.pool.query('SELECT channel,status,error_code,count(*)::int AS count FROM notification_deliveries GROUP BY channel,status,error_code');
    return { configuration: this.configuration(), counts: result.rows };
  }
  async process(limit = 8) {
    const config = this.configuration();
    if (!config.email && !config.push) return { processed: 0 };
    const leased = await this.pool.query(
      "UPDATE notification_deliveries SET status='SENDING',lease_until=now()+interval '2 minutes',attempts=attempts+1 WHERE id IN (SELECT id FROM notification_deliveries WHERE (status IN ('QUEUED','FAILED','UNAVAILABLE') OR (status='SENDING' AND lease_until<now())) AND next_attempt<=now() AND attempts<8 AND ((channel='EMAIL' AND $1) OR (channel='PUSH' AND $2)) ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT $3) RETURNING id",
      [config.email,config.push,limit]);
    await Promise.all(leased.rows.map(async job => {
      const result = await this.pool.query('SELECT d.*,n.title,n.body,n.path,n.cta,u.email,s.payload_encrypted,s.active FROM notification_deliveries d JOIN activity_notifications n ON n.id=d.notification_id JOIN users u ON u.id=n.user_id LEFT JOIN notification_devices s ON s.id=d.device_id AND s.user_id=n.user_id WHERE d.id=$1 AND u.status=$2', [job.id,'ACTIVE']);
      const row = result.rows[0];
      if (!row) {
        await this.pool.query("UPDATE notification_deliveries SET status='UNAVAILABLE',attempts=8,error_code='ACCOUNT_UNAVAILABLE',lease_until=NULL WHERE id=$1", [job.id]);
        return;
      }
      let status = 'ACCEPTED', code: string | null = null, reference: string | null = null;
      try {
        const url = notificationUrl(row.path);
        if (row.channel === 'EMAIL') {
          if (!row.email) { status = 'UNAVAILABLE'; code = 'NO_EMAIL'; }
          else {
            const response = await fetch('https://api.resend.com/emails', { method: 'POST',
              headers: { authorization: 'Bearer ' + process.env.RESEND_API_KEY, 'content-type': 'application/json',
                'Idempotency-Key': 'xtra-notification/' + row.id },
              body: JSON.stringify({ from: process.env.NOTIFICATION_FROM_EMAIL, to: [row.email],
                subject: 'XTRA-CASH · ' + row.title, text: row.body + '\n\n' + row.cta + '\n' + url,
                html: '<div style="font-family:Arial,sans-serif;color:#27123b;max-width:560px;margin:auto;padding:24px">'
                  + '<h2 style="color:#7100ad">XTRA-CASH</h2><h3>' + row.title + '</h3><p>' + row.body
                  + '</p><a style="display:inline-block;background:#7100ad;color:white;padding:14px 20px;border-radius:12px;text-decoration:none" href="'
                  + url + '">' + row.cta + '</a><p style="font-size:12px">Sign in to securely view your account.</p></div>' }),
              signal: AbortSignal.timeout(7000) });
            if (!response.ok) throw new Error('EMAIL_HTTP_' + response.status);
            const sent = await response.json() as { id?: string };
            if (!sent.id) throw new Error('EMAIL_RESPONSE');
            reference = sent.id;
          }
        } else if (!row.active || !row.payload_encrypted) {
          status = 'UNAVAILABLE'; code = 'DEVICE_INACTIVE';
        } else {
          await webpush.sendNotification(JSON.parse(decryptIdentity(row.payload_encrypted)),
            JSON.stringify({ type: 'ACCOUNT_ACTIVITY', notificationId: row.notification_id,
              title: 'XTRA-CASH account update', body: 'Open XTRA-CASH to view your loan or wallet update.', url }),
            { TTL: 3600, timeout: 7000, urgency: 'normal', vapidDetails: {
              subject: process.env.VAPID_SUBJECT || 'mailto:support@xtra-cash.co.za',
              publicKey: process.env.VAPID_PUBLIC_KEY!, privateKey: process.env.VAPID_PRIVATE_KEY!,
            } });
        }
      } catch (cause) {
        status = 'FAILED';
        const httpStatus = (cause as { statusCode?: number }).statusCode;
        code = row.channel === 'EMAIL' && cause instanceof Error && /^EMAIL_/.test(cause.message)
          ? cause.message : 'PROVIDER_UNAVAILABLE';
        if (row.device_id && (httpStatus === 404 || httpStatus === 410)) {
          status = 'UNAVAILABLE'; code = 'DEVICE_EXPIRED';
          await this.pool.query('UPDATE notification_devices SET active=false WHERE id=$1',[row.device_id]);
        }
      }
      await this.pool.query("UPDATE notification_deliveries SET status=$1,error_code=$2,provider_reference=$3,lease_until=NULL,next_attempt=now()+($4 * interval '1 minute') WHERE id=$5",
        [status,code,reference,Math.min(60,2 ** row.attempts),row.id]);
    }));
    return { processed: leased.rows.length };
  }
}
@Injectable()
export class NotificationDispatchInterceptor implements NestInterceptor {
  constructor(private notifications: ActivityNotifications) {}
  intercept(context: ExecutionContext, next: CallHandler) {
    const req = context.switchToHttp().getRequest();
    const relevant = req.method !== 'GET' && /personal-loans|loan-operations|wallet\/deposits/.test(req.url);
    return relevant ? next.handle().pipe(mergeMap(async value => {
      try { await this.notifications.process(4); } catch { /* The durable queue retries through the scheduled job. */ }
      return value;
    })) : next.handle();
  }
}
@Controller('notifications')
export class ActivityNotificationController {
  constructor(private service: ActivityNotifications) {}
  @Get('configuration') configuration() { return this.service.configuration(); }
  @Post('devices') device(@CurrentUser() actor: AuthUser, @Body() body: unknown) { return this.service.device(actor.id, body); }
  @Delete('devices') remove(@CurrentUser() actor: AuthUser, @Body() body: unknown) { return this.service.remove(actor.id, body); }
  @Roles('ADMIN','SUPER_ADMIN') @Get('delivery') delivery() { return this.service.delivery(); }
  @Public() @Get('process') async cron(@Headers('authorization') auth = '') {
    const given = Buffer.from(auth), expected = Buffer.from('Bearer ' + (process.env.CRON_SECRET || ''));
    if (!process.env.CRON_SECRET || given.length !== expected.length || !timingSafeEqual(given,expected))
      throw new UnauthorizedException();
    return this.service.process(20);
  }
}
@Module({ controllers: [ActivityNotificationController], providers: [ActivityNotifications,
  { provide: APP_INTERCEPTOR, useClass: NotificationDispatchInterceptor }], exports: [ActivityNotifications] })
export class ActivityNotificationModule {}
