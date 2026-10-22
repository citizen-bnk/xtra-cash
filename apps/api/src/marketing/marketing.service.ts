import { BadRequestException, ForbiddenException, Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { createHash } from 'crypto';
import { and, count, desc, eq, gte, isNull, lte, or, sql } from 'drizzle-orm';
import { ineligibilityReason } from '../consumer/credit-engine';
import { InjectDb } from '../common/db.module';
import { Db } from '../db/client';
import { kycProfiles, lenderOrgs, loanOffers, marketingDeliveries, marketingDevices, marketingEvents, marketingMembers, marketingReceipts, offerCampaigns, personalVerifications, users } from '../db/schema';
import { decryptIdentity, encryptIdentity } from '../auth/identity-crypto';
import { AuditService } from '../common/audit.service';
import type { AuthUser } from '../common/auth';
import type { LocationTarget } from '@xtra/shared';
import { CampaignDto, MemberLocationDto, MarketingConsentDto, PushDeviceDto } from './marketing.dto';
import { confidentlyInside, distanceMeters, quietHours, saDay } from './geo';
import { PushService } from './push.service';

@Injectable()
export class MarketingService {
  constructor(@InjectDb() private db: Db, private push: PushService, private audit: AuditService) {}
  async org(userId: string) { const o = await this.db.query.lenderOrgs.findFirst({ where: eq(lenderOrgs.ownerUserId, userId) }); if (!o) throw new NotFoundException(); return o; }
  async list(userId: string) {
    const org = await this.org(userId);
    const rows = await this.db.select().from(offerCampaigns).where(eq(offerCampaigns.lenderId, org.id)).orderBy(desc(offerCampaigns.createdAt));
    return Promise.all(rows.map(async row => {
      const [delivery] = await this.db.select({ accepted: sql<number>`count(*) filter (where ${marketingDeliveries.status} = 'ACCEPTED')::int`, failed: sql<number>`count(*) filter (where ${marketingDeliveries.status} in ('FAILED','UNAVAILABLE','UNCERTAIN'))::int` }).from(marketingDeliveries).where(eq(marketingDeliveries.campaignId, row.id));
      const events = await this.db.select({ kind: marketingEvents.kind, total: count() }).from(marketingEvents).where(eq(marketingEvents.campaignId, row.id)).groupBy(marketingEvents.kind);
      return { ...row, ...delivery, events: Object.fromEntries(events.map(e => [e.kind, e.total])) };
    }));
  }
  async create(user: AuthUser, dto: CampaignDto) {
    const org = await this.org(user.id), offer = await this.db.query.loanOffers.findFirst({ where: and(eq(loanOffers.id, dto.offerId), eq(loanOffers.lenderId, org.id)) });
    if (!offer) throw new NotFoundException('Offer not found');
    if (!offer.locationTarget) throw new BadRequestException('Set a map pin and radius on the offer first');
    const start = new Date(dto.startsAt), end = new Date(dto.endsAt);
    if (end <= start || end <= new Date() || +end - +start > 90 * 86400000) throw new BadRequestException('Choose a future end date, within 90 days of the start');
    const [campaign] = await this.db.insert(offerCampaigns).values({ lenderId: org.id, offerId: offer.id, title: dto.title, message: dto.message, target: offer.locationTarget, startsAt: start, endsAt: end }).returning();
    await this.audit.log(user, 'campaign.created', 'campaign', campaign.id, { offerId: offer.id }); return campaign;
  }
  async status(user: AuthUser, id: string, status: 'DRAFT' | 'ACTIVE' | 'PAUSED') {
    const org = await this.org(user.id), campaign = await this.db.query.offerCampaigns.findFirst({ where: and(eq(offerCampaigns.id, id), eq(offerCampaigns.lenderId, org.id)) });
    if (!campaign) throw new NotFoundException();
    const offer = await this.db.query.loanOffers.findFirst({ where: eq(loanOffers.id, campaign.offerId) });
    if (status === 'ACTIVE' && (org.accreditationStatus !== 'ACCREDITED' || !offer?.active || campaign.endsAt <= new Date())) throw new BadRequestException('An accredited lender, active offer and unexpired campaign are required');
    await this.db.update(offerCampaigns).set({ status }).where(eq(offerCampaigns.id, id));
    await this.audit.log(user, 'campaign.status', 'campaign', id, { status }); return { ok: true };
  }
  async details(id: string) {
    const campaign = await this.db.query.offerCampaigns.findFirst({ where: eq(offerCampaigns.id, id) });
    if (!campaign || campaign.status !== 'ACTIVE' || campaign.startsAt > new Date() || campaign.endsAt <= new Date()) throw new NotFoundException('This campaign is no longer available');
    const [offer, org] = await Promise.all([this.db.query.loanOffers.findFirst({ where: eq(loanOffers.id, campaign.offerId) }), this.db.query.lenderOrgs.findFirst({ where: eq(lenderOrgs.id, campaign.lenderId) })]);
    if (!offer?.active || org?.accreditationStatus !== 'ACCREDITED') throw new NotFoundException('This offer is no longer available');
    // Public share links never reveal named lenders or private eligibility data.
    return { id, title: 'A nearby lending offer', message: 'Explore this offer. Identity checks, affordability verification and lender approval are required.', place: campaign.target.label, radiusMeters: campaign.target.radiusMeters, offerId: offer.id, productType: offer.productType, minAmountCents: offer.minAmountCents, maxAmountCents: offer.maxAmountPerUserCents, termMonths: offer.termMonths };
  }
  async preferences(userId: string) { const member = await this.db.query.marketingMembers.findFirst({ where: eq(marketingMembers.userId, userId) }); const devices = await this.db.select({ id: marketingDevices.id, platform: marketingDevices.platform }).from(marketingDevices).where(and(eq(marketingDevices.userId, userId), eq(marketingDevices.active, true))); return { marketing: member?.marketing ?? false, locationEnabled: member?.locationEnabled ?? false, devices, ...this.push.configuration() }; }
  async memberDetails(userId: string, id: string) {
    const publicOffer = await this.details(id);
    const [campaign, offer, profile, verification] = await Promise.all([
      this.db.query.offerCampaigns.findFirst({ where: eq(offerCampaigns.id, id) }),
      this.db.query.loanOffers.findFirst({ where: eq(loanOffers.id, publicOffer.offerId) }),
      this.db.query.kycProfiles.findFirst({ where: eq(kycProfiles.userId, userId) }),
      this.db.query.personalVerifications.findFirst({ where: eq(personalVerifications.userId, userId) }),
    ]);
    if (!campaign || !offer || profile?.status !== 'VERIFIED' || (offer.productType === 'PERSONAL' && verification?.status !== 'VERIFIED') || ineligibilityReason(profile, offer as any)) return publicOffer;
    return { ...publicOffer, title: campaign.title, message: campaign.message };
  }
  async consent(user: AuthUser, dto: MarketingConsentDto) {
    if (dto.locationEnabled && !dto.marketing) throw new BadRequestException('Enable nearby marketing before sharing location');
    await this.db.transaction(async tx => {
      await tx.execute(sql`select id from users where id = ${user.id} for update`);
      await tx.insert(marketingMembers).values({ userId: user.id, ...dto, consentAt: new Date() }).onConflictDoUpdate({ target: marketingMembers.userId, set: { ...dto, consentAt: new Date(), ...(!dto.locationEnabled ? { locationEncrypted: null, locatedAt: null } : {}) } });
      if (!dto.marketing) await tx.update(marketingDevices).set({ active: false }).where(eq(marketingDevices.userId, user.id));
    });
    await this.audit.log(user, 'marketing.consent', 'user', user.id, { ...dto }); return this.preferences(user.id);
  }
  async device(userId: string, dto: PushDeviceDto) {
    const member = await this.db.query.marketingMembers.findFirst({ where: eq(marketingMembers.userId, userId) });
    if (!member?.marketing) throw new ForbiddenException('Enable marketing notifications first');
    let payload: any, key: string;
    if (dto.platform === 'WEB') {
      if (!this.push.configuration().webPush) throw new ServiceUnavailableException('Web notifications are not configured');
      const { endpoint, keys } = dto.payload as any;
      let url: URL; try { url = new URL(endpoint); } catch { throw new BadRequestException('Invalid push subscription'); }
      // Prevent subscription endpoints from turning the push sender into an SSRF proxy.
      const host = url.hostname;
      if (url.protocol !== 'https:' || url.port || url.username || url.password || !(host === 'fcm.googleapis.com' || host === 'web.push.apple.com' || host === 'updates.push.services.mozilla.com' || host.endsWith('.push.services.mozilla.com') || host.endsWith('.notify.windows.com')) || typeof keys?.p256dh !== 'string' || !/^[\w-]{80,100}$/.test(keys.p256dh) || typeof keys?.auth !== 'string' || !/^[\w-]{20,30}$/.test(keys.auth) || endpoint.length > 2000) throw new BadRequestException('Invalid push subscription');
      payload = { endpoint, keys: { p256dh: keys.p256dh, auth: keys.auth } }; key = endpoint;
    } else {
      if (!this.push.configuration().nativePush) throw new ServiceUnavailableException('Native notifications are not configured');
      if (typeof dto.payload.token !== 'string' || !/^(Expo|Exponent)PushToken\[[A-Za-z0-9_-]{10,200}\]$/.test(dto.payload.token)) throw new BadRequestException('Invalid Expo token');
      payload = { token: dto.payload.token }; key = dto.payload.token;
    }
    const deviceKey = createHash('sha256').update(key).digest('hex');
    return this.db.transaction(async tx => {
      await tx.execute(sql`select id from users where id = ${userId} for update`);
      const consent = await tx.query.marketingMembers.findFirst({ where: eq(marketingMembers.userId, userId) });
      if (!consent?.marketing) throw new ForbiddenException('Enable marketing notifications first');
      const [device] = await tx.insert(marketingDevices).values({ userId, platform: dto.platform, deviceKey, payloadEncrypted: encryptIdentity(JSON.stringify(payload)) }).onConflictDoUpdate({ target: marketingDevices.deviceKey, set: { userId, active: true, payloadEncrypted: encryptIdentity(JSON.stringify(payload)) } }).returning({ id: marketingDevices.id });
      return device;
    });
  }
  async removeDevice(userId: string, id: string) { await this.db.update(marketingDevices).set({ active: false }).where(and(eq(marketingDevices.id, id), eq(marketingDevices.userId, userId))); return { ok: true }; }
  async event(userId: string, campaignId: string, kind: string) { await this.details(campaignId); await this.db.insert(marketingEvents).values({ userId, campaignId, kind }).onConflictDoNothing(); return { ok: true }; }
  async nearby(userId: string, point: MemberLocationDto) {
    const now = new Date(), captured = new Date(point.capturedAt);
    if (+now - +captured > 5 * 60000 || +captured - +now > 30000) throw new BadRequestException('Refresh your location before checking nearby offers');
    const member = await this.db.query.marketingMembers.findFirst({ where: eq(marketingMembers.userId, userId) });
    if (!member?.marketing || !member.locationEnabled) throw new ForbiddenException('Nearby offers need your marketing and location consent');
    const updated = await this.db.update(marketingMembers).set({ locationEncrypted: encryptIdentity(JSON.stringify(point)), locatedAt: captured }).where(and(eq(marketingMembers.userId, userId), eq(marketingMembers.marketing, true), eq(marketingMembers.locationEnabled, true), or(isNull(marketingMembers.locatedAt), lte(marketingMembers.locatedAt, captured)))).returning({ userId: marketingMembers.userId });
    if (!updated.length) return { offers: [], needsVerification: false };
    const [profile, verification, account] = await Promise.all([this.db.query.kycProfiles.findFirst({ where: eq(kycProfiles.userId, userId) }), this.db.query.personalVerifications.findFirst({ where: eq(personalVerifications.userId, userId) }), this.db.query.users.findFirst({ where: eq(users.id, userId) })]);
    if (account?.status !== 'ACTIVE' || profile?.status !== 'VERIFIED') return { offers: [], needsVerification: true };
    const rows = await this.db.select({ campaign: offerCampaigns, offer: loanOffers }).from(offerCampaigns).innerJoin(loanOffers, eq(offerCampaigns.offerId, loanOffers.id)).innerJoin(lenderOrgs, eq(offerCampaigns.lenderId, lenderOrgs.id)).where(and(eq(offerCampaigns.status, 'ACTIVE'), lte(offerCampaigns.startsAt, now), gte(offerCampaigns.endsAt, now), eq(loanOffers.active, true), eq(lenderOrgs.accreditationStatus, 'ACCREDITED'))).limit(500);
    const matches = rows.filter(({ campaign, offer }) => (offer.productType !== 'PERSONAL' || verification?.status === 'VERIFIED') && confidentlyInside(point, campaign.target) && !ineligibilityReason(profile, offer as any, now));
    // Every dispatch is awaited before the serverless request ends; no orphaned background promises.
    for (const row of matches.slice(0, 10)) await this.dispatch(userId, row.campaign.id, row.offer.id, now);
    return { offers: await Promise.all(matches.map(r => this.memberDetails(userId, r.campaign.id))), needsVerification: false };
  }
  private async dispatch(userId: string, campaignId: string, offerId: string, now: Date) {
    if (quietHours(now)) return;
    const reservation = await this.db.transaction(async tx => {
      await tx.execute(sql`select id from users where id = ${userId} for update`);
      const member = await tx.query.marketingMembers.findFirst({ where: eq(marketingMembers.userId, userId) });
      if (!member?.marketing || !member.locationEnabled || !member.locatedAt || +now - +member.locatedAt > 5 * 60000) return null;
      const campaign = await tx.query.offerCampaigns.findFirst({ where: eq(offerCampaigns.id, campaignId) });
      if (!campaign || campaign.status !== 'ACTIVE' || campaign.endsAt <= now || !member.locationEncrypted || !confidentlyInside(JSON.parse(decryptIdentity(member.locationEncrypted)), campaign.target)) return null;
      const devices = await tx.query.marketingDevices.findMany({ where: and(eq(marketingDevices.userId, userId), eq(marketingDevices.active, true)), limit: 5 });
      const ready = devices.filter(d => d.platform === 'WEB' ? this.push.configuration().webPush : this.push.configuration().nativePush);
      if (!ready.length) return null;
      const day = saDay(now), [{ total }] = await tx.select({ total: count() }).from(marketingDeliveries).where(and(eq(marketingDeliveries.userId, userId), eq(marketingDeliveries.day, day)));
      if (total >= 2) return null;
      const [delivery] = await tx.insert(marketingDeliveries).values({ userId, campaignId, offerId, day }).onConflictDoNothing().returning();
      return delivery ? { delivery, devices: ready } : null;
    });
    if (!reservation) return;
    let accepted = false;
    for (const device of reservation.devices) {
      const consent = await this.db.query.marketingMembers.findFirst({ where: eq(marketingMembers.userId, userId) });
      if (!consent?.marketing || !consent.locationEnabled) break;
      const result = await this.push.send(device.platform, JSON.parse(decryptIdentity(device.payloadEncrypted)), campaignId);
      accepted ||= result.status === 'ACCEPTED';
      await this.db.insert(marketingReceipts).values({ deliveryId: reservation.delivery.id, deviceId: device.id, ...result });
      if (result.status === 'EXPIRED') await this.removeDevice(userId, device.id);
    }
    await this.db.update(marketingDeliveries).set({ status: accepted ? 'ACCEPTED' : 'FAILED' }).where(eq(marketingDeliveries.id, reservation.delivery.id));
  }
  async regions(userId: string) {
    const member = await this.db.query.marketingMembers.findFirst({ where: eq(marketingMembers.userId, userId) });
    if (!member?.marketing || !member.locationEnabled) return [];
    const rows = await this.db.select({ id: offerCampaigns.id, target: offerCampaigns.target }).from(offerCampaigns).innerJoin(loanOffers, eq(loanOffers.id, offerCampaigns.offerId)).innerJoin(lenderOrgs, eq(lenderOrgs.id, offerCampaigns.lenderId)).where(and(eq(offerCampaigns.status, 'ACTIVE'), lte(offerCampaigns.startsAt, new Date()), gte(offerCampaigns.endsAt, new Date()), eq(loanOffers.active, true), eq(lenderOrgs.accreditationStatus, 'ACCREDITED'))).limit(100);
    const point = member.locationEncrypted ? JSON.parse(decryptIdentity(member.locationEncrypted)) : null;
    if (!point || !member.locatedAt || Date.now() - +member.locatedAt > 24 * 3600000) return [];
    return rows.sort((a, b) => distanceMeters(point, a.target) - distanceMeters(point, b.target)).slice(0, 20).map(r => ({ identifier: r.id, ...r.target }));
  }
  async places(query: string, latitude?: number, longitude?: number) {
    const key = process.env.GOOGLE_MAPS_API_KEY;
    if (!key) throw new ServiceUnavailableException('Place search is not connected yet. Choose a map pin or use current location.');
    const nearby = !query.trim();
    if (nearby && (!Number.isFinite(latitude) || !Number.isFinite(longitude))) throw new BadRequestException('Choose a location first');
    const url = nearby ? 'https://places.googleapis.com/v1/places:searchNearby' : 'https://places.googleapis.com/v1/places:searchText';
    const body = nearby ? { maxResultCount: 10, includedTypes: ['shopping_mall', 'store', 'restaurant'], locationRestriction: { circle: { center: { latitude, longitude }, radius: 1500 } } } : { textQuery: query.slice(0, 160), pageSize: 8, ...(Number.isFinite(latitude) && Number.isFinite(longitude) ? { locationBias: { circle: { center: { latitude, longitude }, radius: 5000 } } } : {}) };
    const response = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', 'X-Goog-Api-Key': key, 'X-Goog-FieldMask': 'places.id,places.displayName,places.formattedAddress,places.location' }, body: JSON.stringify(body), signal: AbortSignal.timeout(10000) });
    if (!response.ok) throw new ServiceUnavailableException('Place search is unavailable. Choose a map pin instead.');
    const data = await response.json() as any; return (data.places || []).map((p: any) => ({ placeId: p.id, label: `${p.displayName?.text || 'Place'}${p.formattedAddress ? ` · ${p.formattedAddress}` : ''}`.slice(0, 160), latitude: p.location.latitude, longitude: p.location.longitude }));
  }
}
