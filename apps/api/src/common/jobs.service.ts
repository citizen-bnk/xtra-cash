import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { LoansService } from '../consumer/loans.service';

@Injectable()
export class JobsService {
  private log = new Logger(JobsService.name);
  constructor(private loans: LoansService) {}

  /** 01:05 SAST daily: flag missed installments. */
  @Cron('5 1 * * *', { timeZone: 'Africa/Johannesburg' })
  async arrears() {
    const r = await this.loans.runArrears();
    this.log.log(`Arrears job: ${r.overdueInstallments} installments overdue, ${r.loansInArrears} loans flagged`);
  }
}
