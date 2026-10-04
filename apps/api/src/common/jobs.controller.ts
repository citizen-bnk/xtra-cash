import { Controller, Get, Headers, HttpCode, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { timingSafeEqual } from 'crypto';
import { Public } from './auth';
import { JobsService } from './jobs.service';

/**
 * Scheduled jobs triggered over HTTP by Vercel Cron (apps/api/vercel.json). On Vercel the API runs as
 * serverless functions, so in-process timers don't fire. Vercel sends `Authorization: Bearer <CRON_SECRET>`.
 */
@Public()
@Controller('jobs')
export class JobsController {
  constructor(private jobs: JobsService) {}

  @Get('arrears')
  @HttpCode(200)
  arrears(@Headers('authorization') auth?: string) {
    const secret = process.env.CRON_SECRET;
    if (!secret) throw new NotFoundException();
    const expected = Buffer.from(`Bearer ${secret}`);
    const given = Buffer.from(auth ?? '');
    if (given.length !== expected.length || !timingSafeEqual(given, expected)) throw new UnauthorizedException();
    return this.jobs.arrears();
  }
}
