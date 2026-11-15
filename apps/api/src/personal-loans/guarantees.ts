import { BadRequestException, Body, ConflictException, Controller, Get, NotFoundException, Param, Post, UnauthorizedException } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { compare } from 'bcryptjs';
import { createHash } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { z } from 'zod';
import { formatZAR } from '@xtra/shared';
import { AuditService } from '../common/audit.service';
import { CurrentUser, Roles, type AuthUser } from '../common/auth';
import { InjectDb } from '../common/db.module';
import type { Db } from '../db/client';
import { parse } from '../payday/payday.dto';

const ref = z.string().trim().min(3).max(200);
const requestInput = z.object({
  applicationId: ref, email: z.string().trim().email().max(254), kind: z.enum(['FAMILY', 'EMPLOYER']),
}).strict();
const approvalInput = z.object({
  lenderId: ref, employerId: ref.optional(), authorityReference: ref,
  terms: z.string().trim().min(80).max(16000),
}).strict();
const signInput = z.object({
  digest: z.string().regex(/^[a-f0-9]{64}$/), password: z.string().min(1).max(128),
}).strict();
const reviewStates = sql`('SUBMITTED','REFERRED','UNDER_REVIEW','ACTION_REQUIRED')`;

@Controller('personal-guarantees')
export class PersonalGuaranteesController {
  constructor(@InjectDb() private db: Db, private audit: AuditService) {}

  @Get()
  @Roles('CONSUMER', 'LENDER', 'ADMIN', 'SUPER_ADMIN')
  async mine(@CurrentUser() actor: AuthUser) {
    const { rows } = await this.db.execute(sql`
      SELECT g.id,g.application_id,g.kind,g.status,g.principal_cents,g.term_months,g.expires_at,
        g.applicant_id = ${actor.id} AS applicant,
        g.signer_id = ${actor.id} AS signer,
        l.name AS lender_name,e.legal_name AS employer_name,
        CASE WHEN g.status IN ('READY','SIGNED') THEN g.terms END AS terms,
        g.digest
      FROM personal_guarantees g LEFT JOIN lender_orgs l ON l.id=g.lender_id
      LEFT JOIN payday_employers e ON e.id=g.employer_id
      WHERE g.applicant_id=${actor.id} OR g.signer_id=${actor.id}
      ORDER BY g.created_at DESC LIMIT 50
    `);
    return rows;
  }

  @Get('review')
  @Roles('ADMIN', 'SUPER_ADMIN')
  async review() {
    const { rows } = await this.db.execute(sql`
      SELECT g.id,g.application_id,g.kind,g.status,g.principal_cents,g.term_months,
        concat_ws(' ',a.first_name,a.last_name) AS applicant_name,
        concat_ws(' ',s.first_name,s.last_name) AS signer_name,g.signed_at
      FROM personal_guarantees g JOIN users a ON a.id=g.applicant_id JOIN users s ON s.id=g.signer_id
      ORDER BY CASE WHEN g.status='REVIEW' THEN 0 ELSE 1 END,g.created_at DESC LIMIT 100
    `);
    return rows;
  }

  @Post()
  @Roles('CONSUMER')
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  async request(@CurrentUser() actor: AuthUser, @Body() body: unknown) {
    const input = parse(requestInput, body);
    return this.db.transaction(async tx => {
      const application = await tx.execute<{ id: string; amount_cents: number; term_months: number }>(sql`
        SELECT id,amount_cents,term_months FROM personal_loan_applications
        WHERE id=${input.applicationId} AND user_id=${actor.id} AND status IN ${reviewStates} FOR UPDATE
      `);
      const current = application.rows[0];
      if (!current) throw new NotFoundException('No open application was found.');
      const signer = await tx.execute<{ id: string }>(sql`
        SELECT id FROM users WHERE email=${input.email.toLowerCase()} AND status='ACTIVE' AND id<>${actor.id}
      `);
      if (!signer.rows[0]) throw new BadRequestException('Enter the address for an existing XTRA-CASH account.');
      const created = await tx.execute<{ id: string }>(sql`
        INSERT INTO personal_guarantees (application_id,applicant_id,signer_id,kind,principal_cents,term_months)
        VALUES (${current.id},${actor.id},${signer.rows[0].id},${input.kind},${current.amount_cents},${current.term_months})
        ON CONFLICT DO NOTHING RETURNING id
      `);
      if (!created.rows[0]) throw new ConflictException('This application already has a guarantee request.');
      await this.audit.log(actor, 'guarantee.requested', 'personal_guarantee', created.rows[0].id, { kind: input.kind }, tx);
      return created.rows[0];
    });
  }

  @Post(':id/prepare')
  @Roles('ADMIN', 'SUPER_ADMIN')
  async prepare(@CurrentUser() actor: AuthUser, @Param('id') id: string, @Body() body: unknown) {
    const input = parse(approvalInput, body);
    return this.db.transaction(async tx => {
      const request = await tx.execute<{ application_id: string; principal_cents: number; term_months: number }>(sql`
        SELECT application_id,principal_cents,term_months FROM personal_guarantees WHERE id=${id} AND status='REVIEW'
      `);
      const pending = request.rows[0];
      if (!pending) throw new NotFoundException('This guarantee is no longer waiting for review.');
      const terms = [
        `Loan application ${pending.application_id}`,
        `Maximum guarantee liability: ${formatZAR(pending.principal_cents)}`,
        `Loan term: ${pending.term_months} months`,
        'This guarantee applies only to this application. The maximum liability above governs this guarantee.',
        input.terms,
      ].join('\n\n');
      const hash = createHash('sha256').update(JSON.stringify([id, input.lenderId, input.employerId, terms])).digest('hex');
      const updated = await tx.execute(sql`
        UPDATE personal_guarantees g SET status='READY', lender_id=${input.lenderId},
          employer_id=${input.employerId ?? null}, authority_reference=${input.authorityReference},
          terms=${terms}, digest=${hash}, expires_at=now()+interval '7 days'
        FROM personal_loan_applications a, lender_orgs l, lender_capacity c
        WHERE g.id=${id} AND g.status='REVIEW' AND a.id=g.application_id AND a.status IN ${reviewStates}
          AND a.amount_cents=g.principal_cents AND a.term_months=g.term_months
          AND (a.lender_id IS NULL OR a.lender_id=${input.lenderId})
          AND l.id=${input.lenderId} AND l.accreditation_status='ACCREDITED' AND c.lender_id=l.id
          AND c.guarantee_limit>=g.principal_cents
          AND EXISTS (SELECT 1 FROM kyc_profiles k WHERE k.user_id=g.signer_id AND k.status='VERIFIED')
          AND ((g.kind='FAMILY' AND ${input.employerId ?? null}::text IS NULL)
            OR (g.kind='EMPLOYER' AND EXISTS (SELECT 1 FROM payday_employers e WHERE e.id=${input.employerId ?? null}
                AND e.stage='ACTIVE' AND e.payroll_reference IS NOT NULL)))
        RETURNING g.id
      `);
      if (!updated.rows.length)
        throw new ConflictException('Check the application, signer verification, funded guarantee allocation and employer evidence.');
      await this.audit.log(actor, 'guarantee.prepared', 'personal_guarantee', id, {
        digest: hash, lenderId: input.lenderId, employerId: input.employerId, authorityReference: input.authorityReference,
      }, tx);
      return { ok: true };
    });
  }

  @Post(':id/sign')
  @Roles('CONSUMER', 'LENDER', 'ADMIN', 'SUPER_ADMIN')
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  async sign(@CurrentUser() actor: AuthUser, @Param('id') id: string, @Body() body: unknown) {
    if (actor.supportSessionId) throw new UnauthorizedException('Sign from your own account.');
    const input = parse(signInput, body);
    const credentials = await this.db.execute<{ password_hash: string | null }>(sql`
      SELECT password_hash FROM users WHERE id=${actor.id} AND status='ACTIVE'
    `);
    const passwordHash = credentials.rows[0]?.password_hash;
    if (!passwordHash || !await compare(input.password, passwordHash)) throw new UnauthorizedException('Confirm your current account password.');
    return this.db.transaction(async tx => {
      const request = await tx.execute<{ application_id: string; lender_id: string }>(sql`
        SELECT application_id,lender_id FROM personal_guarantees WHERE id=${id} AND signer_id=${actor.id}
      `);
      const row = request.rows[0];
      if (!row) throw new NotFoundException();
      await tx.execute(sql`SELECT id FROM personal_loan_applications WHERE id=${row.application_id} FOR UPDATE`);
      await tx.execute(sql`SELECT id FROM lender_orgs WHERE id=${row.lender_id} FOR UPDATE`);
      const signed = await tx.execute(sql`
        UPDATE personal_guarantees g SET status='SIGNED',signed_at=now()
        FROM lender_capacity c, personal_loan_applications a
        WHERE g.id=${id} AND g.signer_id=${actor.id} AND g.status='READY'
          AND g.digest=${input.digest} AND g.expires_at>now()
          AND a.id=g.application_id AND a.status IN ${reviewStates}
          AND a.amount_cents=g.principal_cents AND a.term_months=g.term_months
          AND c.lender_id=g.lender_id
          AND EXISTS (SELECT 1 FROM lender_orgs l WHERE l.id=c.lender_id AND l.accreditation_status='ACCREDITED')
          AND EXISTS (SELECT 1 FROM kyc_profiles k WHERE k.user_id=g.signer_id AND k.status='VERIFIED')
          AND (g.kind='FAMILY' OR EXISTS (SELECT 1 FROM payday_employers e WHERE e.id=g.employer_id AND e.stage='ACTIVE' AND e.payroll_reference IS NOT NULL))
          AND g.principal_cents + (
            SELECT COALESCE(SUM(p.principal_cents),0)
            FROM personal_guarantees p JOIN personal_loan_applications pa ON pa.id=p.application_id
            LEFT JOIN personal_agreements ag ON ag.application_id=pa.id
            LEFT JOIN loans loan ON loan.id=ag.loan_id
            WHERE p.lender_id=g.lender_id AND p.status='SIGNED' AND pa.status NOT IN ('CANCELLED','DECLINED')
              AND (loan.id IS NULL OR loan.outstanding_cents > 0)
          ) <= c.guarantee_limit
        RETURNING g.id
      `);
      if (!signed.rows.length) throw new ConflictException('The guarantee expired, changed or no longer has available capacity.');
      await this.audit.log(actor, 'guarantee.signed', 'personal_guarantee', id, { digest: input.digest }, tx);
      return { ok: true };
    });
  }

  @Post(':id/decline')
  @Roles('CONSUMER', 'LENDER', 'ADMIN', 'SUPER_ADMIN')
  async decline(@CurrentUser() actor: AuthUser, @Param('id') id: string) {
    return this.db.transaction(async tx => {
      const declined = await tx.execute(sql`
        UPDATE personal_guarantees SET status='DECLINED'
        WHERE id=${id} AND signer_id=${actor.id} AND status IN ('REVIEW','READY') RETURNING id
      `);
      if (!declined.rows.length) throw new NotFoundException();
      await this.audit.log(actor, 'guarantee.declined', 'personal_guarantee', id, {}, tx);
      return { ok: true };
    });
  }

  @Post(':id/cancel')
  @Roles('CONSUMER', 'ADMIN', 'SUPER_ADMIN')
  async cancel(@CurrentUser() actor: AuthUser, @Param('id') id: string) {
    const office = actor.roles.some(role => role === 'ADMIN' || role === 'SUPER_ADMIN');
    return this.db.transaction(async tx => {
      const cancelled = await tx.execute(sql`
        UPDATE personal_guarantees SET status='CANCELLED'
        WHERE id=${id} AND (applicant_id=${actor.id} OR ${office})
          AND status IN ('REVIEW','READY') RETURNING id
      `);
      if (!cancelled.rows.length) throw new NotFoundException();
      await this.audit.log(actor, 'guarantee.cancelled', 'personal_guarantee', id, {}, tx);
      return { ok: true };
    });
  }
}
