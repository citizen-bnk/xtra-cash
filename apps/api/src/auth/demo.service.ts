import { Injectable, Logger, NotFoundException, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { eq, inArray } from 'drizzle-orm';
import type { DemoPersona } from '@xtra/shared';
import { InjectDb } from '../common/db.module';
import { Db } from '../db/client';
import { users } from '../db/schema';
import { sanitizeUser } from '../common/pagination';
import { AuditService } from '../common/audit.service';
import { buildDemoData, DEMO_LOGIN_STAFF, SEED_STAFF } from '../db/demo-data';
import { AuthService } from './auth.service';

interface PersonaDef extends DemoPersona {
  /** Accounts to sign in as, in order of preference. */
  emails: string[];
}

const PERSONAS: PersonaDef[] = [
  { key: 'shopper-salaried', app: 'web', group: 'Shoppers', title: 'Naledi · salaried shopper', description: 'Nurse in Gauteng. Has an XTRA-Balance, a virtual card, two active advances and a matched lender offer.', emails: ['naledi@example.com'] },
  { key: 'shopper-gig', app: 'web', group: 'Shoppers', title: 'Sipho · gig worker', description: 'Delivery driver in KZN. One purchase approved, one declined for being over his affordability limit.', emails: ['sipho@example.com'] },
  { key: 'shopper-student', app: 'web', group: 'Shoppers', title: 'Ayanda · student', description: 'Verified, but no lender criteria match yet. See what a shopper without offers experiences.', emails: ['ayanda@example.com'] },
  { key: 'shopper-kyc', app: 'web', group: 'Shoppers', title: 'Kagiso · KYC under review', description: 'Self-employed. Signed up and waiting for XTRA-CASH to review his identity documents.', emails: ['kagiso@example.com'] },
  { key: 'lender-accredited', app: 'web', group: 'Micro-lenders', title: 'Kasi Capital · accredited lender', description: 'Funded Credit Mall stall with two live offers, lending criteria and a loan book.', emails: ['lindiwe@kasicapital.co.za'] },
  { key: 'lender-assisted', app: 'web', group: 'Micro-lenders', title: 'Ubuntu Credit · assisted accreditation', description: 'Accredited with XTRA-CASH’s paid help. Has an EFT top-up waiting for confirmation.', emails: ['bongani@ubuntucredit.co.za'] },
  { key: 'lender-pending', app: 'web', group: 'Micro-lenders', title: 'Mzansi Quick · awaiting review', description: 'Documents submitted. Waiting for XTRA-CASH to accredit the stall before lending.', emails: ['fatima@mzansiquick.co.za'] },
  { key: 'affiliate', app: 'web', group: 'Affiliates', title: 'Thabo · affiliate', description: 'Has referred shoppers and lenders. Commissions earned, pending approval and ready for payout.', emails: ['thabo.affiliate@example.com'] },
  { key: 'staff-superadmin', app: 'admin', group: 'XTRA-CASH staff', title: 'Super-admin', description: 'Full control: dashboard, approvals, platform settings, staff roles and the audit log.', emails: [DEMO_LOGIN_STAFF.superAdmin.email, SEED_STAFF.superAdmin.email] },
  { key: 'staff-ops', app: 'admin', group: 'XTRA-CASH staff', title: 'Operations admin', description: 'Day-to-day queues: KYC reviews, lender accreditation, EFT confirmations and commissions.', emails: [DEMO_LOGIN_STAFF.ops.email, SEED_STAFF.ops.email] },
];

/** One-click demo sign-in. Off unless ENABLE_DEMO_LOGIN=true. */
@Injectable()
export class DemoService {
  private readonly logger = new Logger(DemoService.name);
  private building: Promise<void> | null = null;

  constructor(@InjectDb() private db: Db, private auth: AuthService, private audit: AuditService, private moduleRef: ModuleRef) {}

  get enabled() {
    return process.env.ENABLE_DEMO_LOGIN === 'true';
  }

  personas(): { enabled: boolean; personas: DemoPersona[] } {
    if (!this.enabled) return { enabled: false, personas: [] };
    return { enabled: true, personas: PERSONAS.map(({ emails, ...p }) => p) };
  }

  async login(key: string) {
    if (!this.enabled) throw new NotFoundException('Demo sign-in is switched off');
    const persona = PERSONAS.find((p) => p.key === key);
    if (!persona) throw new NotFoundException('Unknown demo account');

    let user = await this.findUser(persona);
    if (!user) {
      await this.ensureDemoData();
      user = await this.findUser(persona);
    }
    if (!user) throw new ServiceUnavailableException('The demo account is not available. Please try again shortly.');
    if (user.status === 'SUSPENDED') throw new UnauthorizedException('This demo account has been suspended in the back office.');

    await this.audit.log({ id: user.id, email: user.email, roles: user.roles }, 'auth.demo_login', 'user', user.id, { persona: key });
    return { user: sanitizeUser(user), ...(await this.auth.issueTokens(user)) };
  }

  private async findUser(persona: PersonaDef) {
    // The local seed's staff addresses are only used outside production, so a demo tile can never
    // reach a real staff account on the live platform.
    const emails = process.env.NODE_ENV === 'production' ? persona.emails.filter((e) => !Object.values(SEED_STAFF).some((s) => s.email === e)) : persona.emails;
    if (!emails.length) return null;
    const rows = await this.db.query.users.findMany({ where: inArray(users.email, emails) });
    return emails.map((e) => rows.find((r) => r.email === e)).find(Boolean) ?? null;
  }

  /** Builds the demo world once (e.g. on a fresh live database). Concurrent clicks share one build. */
  private ensureDemoData() {
    if (!this.building) {
      this.building = (async () => {
        const marker = await this.db.query.users.findFirst({ where: eq(users.email, 'naledi@example.com') });
        if (marker) return;
        this.logger.log('Building demo accounts for one-click sign-in…');
        await buildDemoData(this.moduleRef, DEMO_LOGIN_STAFF);
        this.logger.log('Demo accounts ready');
      })()
        .catch((e) => {
          this.logger.error(`Could not build demo accounts: ${e?.message ?? e}`);
          throw new ServiceUnavailableException('Could not prepare the demo accounts. Check the API logs.');
        })
        .finally(() => {
          this.building = null;
        });
    }
    return this.building;
  }
}
