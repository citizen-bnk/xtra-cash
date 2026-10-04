import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { LoansService } from '../consumer/loans.service';

@Injectable()
export class JobsService {
  private log = new Logger(JobsService.name);
  constructor(private loans: LoansService) {}

  /**
   * 01:05 SAST daily: flag missed installments. On Vercel, Vercel Cron calls GET /jobs/arrears instead
   * (serverless instances don't stay running for timers); elsewhere this in-process schedule runs it.
   */
  @Cron('5 1 * * *', { timeZone: 'Africa/Johannesburg', disabled: !!process.env.VERCEL })
  async arrears() {
    const r = await this.loans.runArrears();
    this.log.log(`Arrears job: ${r.overdueInstallments} installments overdue, ${r.loansInArrears} loans flagged`);
    return r;
  }
}
