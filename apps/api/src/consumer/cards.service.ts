import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, desc, eq, ne } from 'drizzle-orm';
import { InjectDb } from '../common/db.module';
import { Db, DbOrTx } from '../db/client';
import { cards, users } from '../db/schema';
import { CARD_ISSUER } from '../integrations/integrations.module';
import type { CardIssuer } from '../integrations/card-issuer';

const publicCard = (c: typeof cards.$inferSelect) => {
  const { processorRef: _hidden, userId: _u, ...rest } = c;
  return rest;
};

@Injectable()
export class CardsService {
  constructor(@InjectDb() private db: Db, @Inject(CARD_ISSUER) private issuer: CardIssuer) {}

  async list(userId: string) {
    const rows = await this.db.query.cards.findMany({ where: and(eq(cards.userId, userId), ne(cards.status, 'CANCELLED')), orderBy: desc(cards.createdAt) });
    return rows.map(publicCard);
  }

  /** Issues a virtual XTRA-CASH card if the user has no live card. */
  async ensureCard(userId: string, conn: DbOrTx = this.db) {
    const existing = await conn.query.cards.findFirst({ where: and(eq(cards.userId, userId), ne(cards.status, 'CANCELLED')) });
    if (existing) return publicCard(existing);
    const user = await conn.query.users.findFirst({ where: eq(users.id, userId) });
    if (!user) throw new NotFoundException();
    const issued = await this.issuer.issueVirtualCard({ userId, nameOnCard: `${user.firstName} ${user.lastName}`.toUpperCase() });
    const [card] = await conn.insert(cards).values({ userId, ...issued }).returning();
    return publicCard(card);
  }

  async issue(userId: string) {
    const kyc = await this.db.query.kycProfiles.findFirst({ where: (k, { eq }) => eq(k.userId, userId) });
    if (kyc?.status !== 'VERIFIED') throw new BadRequestException('Verify your profile before requesting a card');
    return this.ensureCard(userId);
  }

  async setFrozen(userId: string, cardId: string, frozen: boolean) {
    const card = await this.db.query.cards.findFirst({ where: and(eq(cards.id, cardId), eq(cards.userId, userId)) });
    if (!card || card.status === 'CANCELLED') throw new NotFoundException('Card not found');
    const status = frozen ? 'FROZEN' : 'ACTIVE';
    await this.issuer.setStatus(card.processorRef, status);
    const [updated] = await this.db.update(cards).set({ status }).where(eq(cards.id, cardId)).returning();
    return publicCard(updated);
  }
}
