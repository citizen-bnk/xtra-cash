import { Controller, Get, Headers, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { timingSafeEqual } from 'crypto';
import { and, eq, isNotNull, lt } from 'drizzle-orm';
import { Public } from '../common/auth';
import { InjectDb } from '../common/db.module';
import { Db } from '../db/client';
import { marketingDeliveries, marketingDevices, marketingMembers, marketingReceipts } from '../db/schema';
@Public() @Controller('jobs')
export class MarketingJobsController {
  constructor(@InjectDb() private db: Db) {}
  @Get('marketing') async run(@Headers('authorization') auth?: string) {
    if (!process.env.CRON_SECRET) throw new NotFoundException();
    const a = Buffer.from(auth || ''), b = Buffer.from(`Bearer ${process.env.CRON_SECRET}`);
    if (a.length !== b.length || !timingSafeEqual(a, b)) throw new UnauthorizedException();
    await this.db.update(marketingMembers).set({ locationEncrypted: null, locatedAt: null }).where(lt(marketingMembers.locatedAt, new Date(Date.now() - 24 * 3600000)));
    await this.db.update(marketingDeliveries).set({ status: 'UNCERTAIN' }).where(and(eq(marketingDeliveries.status, 'RESERVED'), lt(marketingDeliveries.createdAt, new Date(Date.now() - 5 * 60000))));
    const tickets = await this.db.select().from(marketingReceipts).where(and(eq(marketingReceipts.status, 'ACCEPTED'), isNotNull(marketingReceipts.ticketId), lt(marketingReceipts.createdAt, new Date(Date.now() - 15 * 60000)))).limit(100);
    if (tickets.length) {
      const r = await fetch('https://exp.host/--/api/v2/push/getReceipts', { method: 'POST', headers: { 'content-type': 'application/json', ...(process.env.EXPO_ACCESS_TOKEN ? { Authorization: `Bearer ${process.env.EXPO_ACCESS_TOKEN}` } : {}) }, body: JSON.stringify({ ids: tickets.map(t => t.ticketId) }), signal: AbortSignal.timeout(10000) });
      if (r.ok) { const data = (await r.json() as any).data || {}; for (const t of tickets) {
        const receipt = data[t.ticketId!];
        if (!receipt) continue;
        await this.db.update(marketingReceipts).set({ status: receipt.status === 'ok' ? 'PROVIDER_CONFIRMED' : 'FAILED' }).where(eq(marketingReceipts.id, t.id));
        if (receipt.details?.error === 'DeviceNotRegistered') await this.db.update(marketingDevices).set({ active: false }).where(eq(marketingDevices.id, t.deviceId));
      } }
    }
    return { ok: true, receiptsChecked: tickets.length };
  }
}
