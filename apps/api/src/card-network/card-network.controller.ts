import { Body, Controller, Headers, HttpCode, Post, Req, UnauthorizedException } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { createHmac, timingSafeEqual } from 'crypto';
import { IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { Public } from '../common/auth';
import { AuthorizationService } from '../consumer/authorization.service';

class NetworkAuthDto {
  @IsString() cardRef: string;
  @IsString() networkTransactionId: string;
  @IsInt() @Min(1) @Max(10_000_000) amountCents: number;
  @IsString() merchantName: string;
  @IsOptional() @IsString() mcc?: string;
  @IsIn(['ONLINE', 'IN_STORE']) channel: 'ONLINE' | 'IN_STORE';
}

export function signPayload(rawBody: string, secret: string) {
  return createHmac('sha256', secret).update(rawBody).digest('hex');
}

/**
 * JIT-funding webhook called by the card issuer-processor for every swipe / online payment.
 * Must answer within the network's timeout (~2s): approve or decline based on the consumer's XTRA-Balance.
 */
@Public()
@SkipThrottle()
@Controller('card-network')
export class CardNetworkController {
  constructor(private authz: AuthorizationService) {}

  @HttpCode(200)
  @Post('authorize')
  async authorize(@Req() req: any, @Headers('x-signature') signature: string, @Body() dto: NetworkAuthDto) {
    const secret = process.env.CARD_NETWORK_SECRET;
    const raw: Buffer | undefined = req.rawBody;
    if (!secret || !raw || !signature) throw new UnauthorizedException('Unsigned request');
    const expected = Buffer.from(signPayload(raw.toString('utf8'), secret));
    const given = Buffer.from(signature);
    if (expected.length !== given.length || !timingSafeEqual(expected, given)) throw new UnauthorizedException('Bad signature');

    const t = await this.authz.authorize({
      processorRef: dto.cardRef,
      amountCents: dto.amountCents,
      merchantName: dto.merchantName,
      merchantCategory: dto.mcc ?? null,
      channel: dto.channel,
      idempotencyKey: `net:${dto.networkTransactionId}`,
      networkRef: dto.networkTransactionId,
    });
    return { approved: t.status === 'APPROVED', declineReason: t.declineReason, transactionId: t.id };
  }
}
