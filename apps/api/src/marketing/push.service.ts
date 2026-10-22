import { Injectable } from '@nestjs/common';
import * as webpush from 'web-push';

/** Provider acceptance is recorded separately from app opens and native receipts. */
@Injectable()
export class PushService {
  configuration() { return { webPush: !!(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY), vapidPublicKey: process.env.VAPID_PUBLIC_KEY || null, nativePush: process.env.ENABLE_EXPO_PUSH === 'true', places: !!process.env.GOOGLE_MAPS_API_KEY }; }
  async send(platform: string, payload: any, campaignId: string): Promise<{ status: string; ticketId?: string }> {
    const message = { title: 'A nearby offer is available', body: 'View the offer in XTRA-CASH. Eligibility checks and lender approval apply.', campaignId, url: `/offers/${campaignId}` };
    if (platform === 'WEB') {
      if (!this.configuration().webPush) return { status: 'UNAVAILABLE' };
      try {
        await webpush.sendNotification(payload, JSON.stringify(message), { TTL: 120, urgency: 'normal', vapidDetails: { subject: process.env.VAPID_SUBJECT || 'mailto:support@xtracash.co.za', publicKey: process.env.VAPID_PUBLIC_KEY!, privateKey: process.env.VAPID_PRIVATE_KEY! }, timeout: 10000 });
        return { status: 'ACCEPTED' };
      } catch (e) { return { status: [404, 410].includes((e as { statusCode?: number }).statusCode || 0) ? 'EXPIRED' : 'FAILED' }; }
    }
    if (!this.configuration().nativePush) return { status: 'UNAVAILABLE' };
    try {
      const response = await fetch('https://exp.host/--/api/v2/push/send', { method: 'POST', headers: { 'content-type': 'application/json', ...(process.env.EXPO_ACCESS_TOKEN ? { Authorization: `Bearer ${process.env.EXPO_ACCESS_TOKEN}` } : {}) }, body: JSON.stringify({ to: payload.token, title: message.title, body: message.body, data: { campaignId }, ttl: 120, channelId: 'offers' }), signal: AbortSignal.timeout(10000) });
      if (!response.ok) return { status: 'FAILED' };
      const result = await response.json() as any;
      const ticket = Array.isArray(result.data) ? result.data[0] : result.data;
      return ticket?.status === 'ok' && ticket.id ? { status: 'ACCEPTED', ticketId: ticket.id } : { status: ticket?.details?.error === 'DeviceNotRegistered' ? 'EXPIRED' : 'FAILED' };
    } catch { return { status: 'FAILED' }; }
  }
}
