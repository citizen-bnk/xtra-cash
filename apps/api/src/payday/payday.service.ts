import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { and, arrayContains, count, desc, eq, inArray, ne, or, ilike, sql } from 'drizzle-orm';
import { createHash, randomUUID } from 'crypto';
import { compare, hash } from 'bcryptjs';
import { PAYDAY_POLICY, type PaydayRecovery } from '@xtra/shared';
import { InjectDb } from '../common/db.module';
import { Db, DbOrTx } from '../db/client';
import { AuditService } from '../common/audit.service';
import { AuthUser } from '../common/auth';
import { users, refreshTokens, lenderOrgs, paydayEmployees as employees, paydayEmployers as employers, paydayVisits as visits, paydayEntries as entries, paydayAwards as awards, paydayKit as kit, paydayTraining as training, paydayCompletions as completions, paydayStatements as statements, paydayStatementAwards as statementAwards } from '../db/schema';
import * as dto from './payday.dto';
import type { z } from 'zod';
const isAdmin = (a: AuthUser) => a.roles.some(r => r === 'ADMIN' || r === 'SUPER_ADMIN');
const digest = (data: unknown) => createHash('sha256').update(JSON.stringify(data)).digest('hex');
const ref = (s: string) => s.trim().toUpperCase();
type Employer = typeof employers.$inferSelect;
const totals = () => ({ credits: sql<string>`coalesce(sum(case when ${entries.amountCents}>0 and ${entries.verifiedBy} is not null and ${entries.rejectedAt} is null then ${entries.amountCents} else 0 end),0)`, debits: sql<string>`coalesce(sum(case when ${entries.amountCents}<0 then -${entries.amountCents} else 0 end),0)`, pending: sql<string>`count(*) filter (where ${entries.amountCents}>0 and ${entries.verifiedBy} is null and ${entries.rejectedAt} is null)` });
function recoveryResult(e:Employer,r:{credits:string;debits:string;pending:string},award:typeof awards.$inferSelect|undefined):PaydayRecovery {
  const contributionCents=Number(r.credits)-Number(r.debits)-e.onboardingCents,thresholdCents=e.commissionCents+e.bufferCents;
  const onboardingReady=e.stage==='ACTIVE'&&!!e.agreementReference&&!!e.lenderReference&&!!e.payrollReference;
  return {receiptsCents:Number(r.credits),additionalCostsCents:Number(r.debits),contributionCents,thresholdCents,remainingCents:Math.max(0,thresholdCents-contributionCents),ready:onboardingReady&&contributionCents>=thresholdCents&&Number(r.pending)===0,onboardingReady,unverifiedReceipts:Number(r.pending),exposureCents:award?Math.max(0,award.amountCents+e.bufferCents-contributionCents):0};
}
function presentEmployer(e: Employer) { const { clientKey, requestHash, createdBy, ...safe } = e; return safe; }
function past(s: string) { const d = new Date(s); if (d.getTime() > Date.now() + 60000) throw new BadRequestException('Settlement date cannot be in the future'); return d; }

@Injectable()
export class PaydayService {
  constructor(@InjectDb() private db: Db, private audit: AuditService) {}
  private async employee(id: string, conn: DbOrTx = this.db) {
    const [e] = await conn.select().from(employees).where(eq(employees.userId, id));
    if (!e) throw new NotFoundException('Employee record not found'); return e;
  }
  private async operational(a: AuthUser) {
    if (isAdmin(a)) return;
    const e = await this.employee(a.id);
    if (e.status !== 'ACTIVE' || e.passwordChangeRequired || !e.onboardingAcknowledgedAt || !(await this.trainingComplete(a.id))) throw new ForbiddenException('Complete onboarding and required training; your manager must activate field access');
  }
  async assertOperational(a: AuthUser) { await this.operational(a); }
  private async trainingComplete(userId: string, conn: DbOrTx = this.db) {
    const [modules, done] = await Promise.all([conn.select().from(training).where(and(eq(training.required, true), eq(training.active, true))), conn.select().from(completions).where(eq(completions.userId, userId))]);
    return modules.length > 0 && modules.every(m => done.some(c => c.moduleId === m.id && c.revision === m.revision));
  }
  private async employer(a: AuthUser, id: string, conn: DbOrTx = this.db, lock = false) {
    if (lock) await conn.execute(sql`select id from payday_employers where id=${id} for update`);
    const [e] = await conn.select().from(employers).where(eq(employers.id, id));
    if (!e || (!isAdmin(a) && e.ownerId !== a.id)) throw new NotFoundException('Employer not found'); return e;
  }
  async recovery(e: Employer, conn: DbOrTx = this.db): Promise<PaydayRecovery> {
    const [r] = await conn.select(totals()).from(entries).where(eq(entries.employerId,e.id));
    const [award] = await conn.select().from(awards).where(eq(awards.employerId, e.id));
    return recoveryResult(e,r,award);
  }
  async list(a: AuthUser, page = 1, search = '') {
    page = Math.max(1, Math.min(10000, Number(page) || 1));
    const where = and(isAdmin(a) ? undefined : eq(employers.ownerId, a.id), search ? or(ilike(employers.legalName, `%${search.slice(0,100)}%`), ilike(employers.registrationNumber, `%${search.slice(0,100)}%`)) : undefined);
    const [rows, [total]] = await Promise.all([this.db.select().from(employers).where(where).orderBy(desc(employers.createdAt)).limit(50).offset((page - 1) * 50), this.db.select({ n: count() }).from(employers).where(where)]);
    const ids=rows.map(e=>e.id);
    const [ledger,earned]=ids.length?await Promise.all([this.db.select({employerId:entries.employerId,...totals()}).from(entries).where(inArray(entries.employerId,ids)).groupBy(entries.employerId),this.db.select().from(awards).where(inArray(awards.employerId,ids))]):[[],[]];
    const byEmployer=new Map(ledger.map(r=>[r.employerId,r])),byAward=new Map(earned.map(a=>[a.employerId,a]));
    const items=rows.map(e=>({ ...presentEmployer(e),recovery:recoveryResult(e,byEmployer.get(e.id)??{credits:'0',debits:'0',pending:'0'},byAward.get(e.id)),award:byAward.get(e.id)??null }));
    return { items, total: total.n, page, totalPages: Math.ceil(total.n / 50) };
  }
  async detail(a: AuthUser, id: string) {
    const e = await this.employer(a, id);
    const [v, ledger, [award], recovery] = await Promise.all([this.db.select().from(visits).where(eq(visits.employerId,id)).orderBy(desc(visits.createdAt)).limit(100), isAdmin(a) ? this.db.select().from(entries).where(eq(entries.employerId,id)).orderBy(desc(entries.createdAt)).limit(200) : Promise.resolve([]), this.db.select().from(awards).where(eq(awards.employerId,id)), this.recovery(e)]);
    return { employer: presentEmployer(e), visits: v.map(({ requestHash, ...safe }) => safe), entries: ledger, award: award ?? null, recovery };
  }
  async create(a: AuthUser, input: z.infer<typeof dto.leadInput>) {
    await this.operational(a);
    if(isAdmin(a)&&!input.ownerId)throw new BadRequestException('Assign an employee to the lead');
    const ownerId = isAdmin(a) ? input.ownerId! : a.id;
    if (ownerId !== a.id || !isAdmin(a)) await this.employee(ownerId);
    const { meetingId, ...fields } = input;
    const value = { ...fields, ownerId, registrationNumber: input.registrationNumber.toUpperCase().replace(/[^A-Z0-9]/g,''), followUpAt: new Date(input.followUpAt), createdBy: a.id, policyVersion: PAYDAY_POLICY.version, commissionCents: PAYDAY_POLICY.commissionCents, bufferCents: PAYDAY_POLICY.bufferCents, onboardingCents: PAYDAY_POLICY.onboardingCents, requestHash: digest(input) };
    if (value.registrationNumber.length < 5) throw new BadRequestException('Enter a valid employer registration identifier');
    return this.db.transaction(async tx => {
      const [row] = await tx.insert(employers).values(value).onConflictDoNothing().returning();
      if (!row) { const [prior] = await tx.select().from(employers).where(and(eq(employers.createdBy,a.id),eq(employers.clientKey,input.clientKey))); if (prior?.requestHash === value.requestHash) return presentEmployer(prior); throw new ConflictException('Business registration or sync key already recorded. Ask operations to review the existing record.'); }
      if (meetingId) {
        const evidence = await tx.execute(sql`UPDATE payday_meeting_evidence SET employer_id=${row.id} WHERE id=${meetingId} AND employee_id=${a.id} AND employer_id IS NULL RETURNING id`);
        if (!evidence.rows.length) throw new ForbiddenException('Recording is unavailable for this lead.');
      }
      await this.audit.log(a,'PAYDAY_LEAD_CREATED','payday_employer',row.id,{},tx); return presentEmployer(row);
    });
  }
  async update(a: AuthUser, id: string, input: z.infer<typeof dto.leadUpdate>) {
    await this.operational(a);
    return this.db.transaction(async tx => {
      const e = await this.employer(a,id,tx,true);
      if (e.version !== input.version) throw new ConflictException('This employer changed. Reload before saving.');
      if (!isAdmin(a) && (['SIGNED','PAYROLL_TESTING','ACTIVE','SUSPENDED'].includes(input.stage) || input.ownerId || input.agreementReference || input.lenderReference || input.payrollReference)) throw new ForbiddenException('Operations manages activation, evidence and assignments');
      if (!isAdmin(a) && ['SIGNED','PAYROLL_TESTING','ACTIVE','SUSPENDED'].includes(e.stage)) throw new ForbiddenException('Ask operations to change an onboarded employer');
      if (input.ownerId && input.ownerId !== e.ownerId) {
        if (e.agreementReference || !['NEW','CONTACTED','QUALIFIED','MEETING','PROPOSAL'].includes(e.stage)) throw new BadRequestException('Attribution is locked after employer signing');
        await this.employee(input.ownerId,tx);
      }
      const { version, ...changes } = input;
      const next = { ...e, ...changes };
      if (['SIGNED','PAYROLL_TESTING','ACTIVE'].includes(next.stage) && (!next.agreementReference || !next.lenderReference)) throw new BadRequestException('Employer agreement and lender commercial evidence are required');
      if (next.stage === 'ACTIVE' && !next.payrollReference) throw new BadRequestException('Payroll reconciliation evidence is required');
      const [row] = await tx.update(employers).set({ ...changes, followUpAt: new Date(input.followUpAt), version: version + 1 }).where(eq(employers.id,id)).returning();
      await this.audit.log(a,'PAYDAY_EMPLOYER_UPDATED','payday_employer',id,{stage:row.stage},tx); return presentEmployer(row);
    });
  }
  async visit(a: AuthUser, input: z.infer<typeof dto.visitInput>) {
    await this.operational(a);
    return this.db.transaction(async tx => {
      await this.employer(a,input.employerId,tx,true);
      const requestHash = digest(input);
      const [row] = await tx.insert(visits).values({ ...input, requestHash, repId:a.id, followUpAt:new Date(input.followUpAt) }).onConflictDoNothing().returning();
      if (!row) { const [old] = await tx.select().from(visits).where(and(eq(visits.repId,a.id),eq(visits.clientKey,input.clientKey))); if (old?.requestHash === requestHash) return { id:old.id }; throw new ConflictException('Visit sync key was reused'); }
      await tx.update(employers).set({nextAction:input.nextAction,followUpAt:new Date(input.followUpAt),version:sql`${employers.version}+1`}).where(eq(employers.id,input.employerId));
      await this.audit.log(a,'PAYDAY_VISIT_RECORDED','payday_employer',input.employerId,{},tx); return {id:row.id};
    });
  }
  async entry(a: AuthUser, id:string, input:z.infer<typeof dto.entryInput>) {
    if (input.kind === 'RECEIPT') { if (!input.lenderId) throw new BadRequestException('Select the paying lender'); const [l] = await this.db.select().from(lenderOrgs).where(eq(lenderOrgs.id,input.lenderId)); if (!l || l.accreditationStatus !== 'ACCREDITED') throw new BadRequestException('An accredited lender is required'); }
    return this.db.transaction(async tx => {
      await this.employer(a,id,tx,true);
      const [row] = await tx.insert(entries).values({employerId:id,kind:input.kind,amountCents:input.amountCents*(input.kind==='COST'?-1:1),reference:ref(input.reference),evidence:input.evidence,lenderId:input.lenderId,createdBy:a.id,settledAt:past(input.settledAt)}).onConflictDoNothing().returning();
      if (!row) throw new ConflictException('This finance reference is already recorded');
      await this.audit.log(a,'PAYDAY_ENTRY_RECORDED','payday_entry',row.id,{kind:row.kind,amountCents:row.amountCents},tx); return row;
    });
  }
  async verifyEntry(a:AuthUser,id:string, approve:boolean) {
    return this.db.transaction(async tx=>{
      const [initial] = await tx.select().from(entries).where(eq(entries.id,id)); if(!initial) throw new NotFoundException();
      await this.employer(a,initial.employerId,tx,true);
      const [e] = await tx.select().from(entries).where(eq(entries.id,id));
      if(e.createdBy===a.id) throw new ForbiddenException('A second administrator must verify incoming revenue');
      if(e.amountCents<=0 || e.verifiedBy || e.rejectedAt) throw new ConflictException('Entry is not awaiting verification');
      const [row]=await tx.update(entries).set(approve?{verifiedBy:a.id}:{rejectedAt:new Date()}).where(eq(entries.id,id)).returning();
      await this.audit.log(a,approve?'PAYDAY_ENTRY_VERIFIED':'PAYDAY_ENTRY_REJECTED','payday_entry',id,{},tx); return row;
    });
  }
  async reverse(a:AuthUser,id:string,input:z.infer<typeof dto.reversalInput>) {
    return this.db.transaction(async tx=>{
      const [old] = await tx.select().from(entries).where(eq(entries.id,id)); if(!old) throw new NotFoundException();
      await this.employer(a,old.employerId,tx,true);
      if(old.kind==='REVERSAL'||old.rejectedAt||(old.amountCents>0&&!old.verifiedBy)) throw new BadRequestException('Only recognised source entries can be reversed; reject pending revenue instead');
      const [row]=await tx.insert(entries).values({employerId:old.employerId,kind:'REVERSAL',amountCents:-old.amountCents,reference:ref(input.reference),evidence:input.evidence,lenderId:old.lenderId,reversesId:old.id,createdBy:a.id,settledAt:past(input.settledAt)}).onConflictDoNothing().returning();
      if(!row) throw new ConflictException('Reversal or reference already recorded');
      await this.audit.log(a,'PAYDAY_ENTRY_REVERSED','payday_entry',row.id,{},tx);return row;
    });
  }
  async qualify(a:AuthUser,id:string) {
    return this.db.transaction(async tx=>{
      const e=await this.employer(a,id,tx,true),r=await this.recovery(e,tx);
      if(!r.ready) throw new BadRequestException('Activation, cleared contribution and independent revenue verification are required');
      const authored=await tx.select().from(entries).where(and(eq(entries.employerId,id),eq(entries.createdBy,a.id),eq(entries.kind,'RECEIPT')));
      if(e.ownerId===a.id||authored.length) throw new ForbiddenException('The representative or revenue recorder cannot approve this commission');
      const [award]=await tx.insert(awards).values({employerId:id,repId:e.ownerId,amountCents:e.commissionCents,approvedBy:a.id}).onConflictDoNothing().returning();
      if(!award) throw new ConflictException('This business already has its acquisition award');
      await this.audit.log(a,'PAYDAY_COMMISSION_EARNED','payday_award',award.id,{},tx);return award;
    });
  }
  async me(a:AuthUser) {
    const e=await this.employee(a.id),[u]=await this.db.select({firstName:users.firstName,lastName:users.lastName,email:users.email,phone:users.phone}).from(users).where(eq(users.id,a.id));
    return {...e,...u,trainingComplete:await this.trainingComplete(a.id),policy:PAYDAY_POLICY};
  }
  async employeeList() { return this.db.select({employee:employees,user:{id:users.id,firstName:users.firstName,lastName:users.lastName,email:users.email}}).from(employees).innerJoin(users,eq(users.id,employees.userId)).orderBy(desc(employees.createdAt)); }
  async provision(a:AuthUser,input:z.infer<typeof dto.employeeInput>) {
    return this.db.transaction(async tx=>{
      let [u]=await tx.select().from(users).where(eq(users.email,input.email)); const isNew=!u;
      if(!u){ if(!input.initialPassword) throw new BadRequestException('New staff need an initial password of at least 12 characters'); [u]=await tx.insert(users).values({email:input.email,phone:input.phone,firstName:input.firstName,lastName:input.lastName,passwordHash:await hash(input.initialPassword,12),roles:['SALES_REP'],referralCode:`PD${randomUUID().replace(/-/g,'').slice(0,16)}`}).returning(); }
      else { if(u.status!=='ACTIVE') throw new BadRequestException('Reactivate the account first'); await tx.update(users).set({roles:Array.from(new Set([...u.roles,'SALES_REP' as const])),...(!u.profileComplete?{firstName:input.firstName,lastName:input.lastName,profileComplete:true}:{})}).where(eq(users.id,u.id)); }
      const [e]=await tx.insert(employees).values({userId:u.id,employeeNumber:ref(input.employeeNumber),territory:input.territory,startDate:input.startDate,employmentReference:input.employmentReference,passwordChangeRequired:isNew}).onConflictDoNothing().returning();
      if(!e) throw new ConflictException('Employee or staff number already exists');
      await this.audit.log(a,'PAYDAY_EMPLOYEE_CREATED','user',u.id,{},tx);return e;
    });
  }
  async manageEmployee(a:AuthUser,id:string,input:z.infer<typeof dto.employeeUpdate>) {
    if(input.basicCents<Math.ceil(input.weeklyHours*52/12*3023))throw new BadRequestException('Contracted basic must cover the current R30.23 ordinary hourly wage floor for the agreed hours; review applicable sector and future rates with HR');
    const e=await this.employee(id);
    if(input.status==='ACTIVE'&&(!e.onboardingAcknowledgedAt||e.passwordChangeRequired||!(await this.trainingComplete(id)))) throw new BadRequestException('Employee must change the initial password, acknowledge onboarding and complete required training');
    return this.db.transaction(async tx=>{const [row]=await tx.update(employees).set(input).where(eq(employees.userId,id)).returning();await this.audit.log(a,'PAYDAY_EMPLOYEE_UPDATED','user',id,{status:input.status},tx);return row;});
  }
  async acknowledge(a:AuthUser) { await this.employee(a.id);return this.db.transaction(async tx=>{const [e]=await tx.update(employees).set({onboardingAcknowledgedAt:new Date()}).where(eq(employees.userId,a.id)).returning();await this.audit.log(a,'PAYDAY_ONBOARDING_ACKNOWLEDGED','user',a.id,{},tx);return e;}); }
  async contact(a:AuthUser,phone:string,emergencyContact:string){await this.employee(a.id);await this.db.transaction(async tx=>{await tx.update(users).set({phone}).where(eq(users.id,a.id));await tx.update(employees).set({emergencyContact}).where(eq(employees.userId,a.id));await this.audit.log(a,'PAYDAY_CONTACT_UPDATED','user',a.id,{},tx);});return {ok:true};}
  async changePassword(a:AuthUser,input:z.infer<typeof dto.passwordInput>) {
    const [u]=await this.db.select().from(users).where(eq(users.id,a.id));
    if(!u.passwordHash||!(await compare(input.currentPassword,u.passwordHash))) throw new BadRequestException('Current password is incorrect');
    if(input.newPassword===input.currentPassword) throw new BadRequestException('Choose a different password');
    await this.db.transaction(async tx=>{await tx.update(users).set({passwordHash:await hash(input.newPassword,12)}).where(eq(users.id,a.id));await tx.update(employees).set({passwordChangeRequired:false}).where(eq(employees.userId,a.id));await tx.update(refreshTokens).set({revokedAt:new Date()}).where(and(eq(refreshTokens.userId,a.id),a.sessionId?ne(refreshTokens.id,a.sessionId):undefined));await this.audit.log(a,'PAYDAY_PASSWORD_CHANGED','user',a.id,{},tx);});return {ok:true};
  }
  async courses(a:AuthUser) { const [modules,done]=await Promise.all([this.db.select().from(training).where(eq(training.active,true)).orderBy(training.createdAt),this.db.select().from(completions).where(eq(completions.userId,a.id))]);return modules.map(m=>({...m,completed:done.some(c=>c.moduleId===m.id&&c.revision===m.revision)})); }
  async createCourse(a:AuthUser,input:z.infer<typeof dto.trainingInput>) {return this.db.transaction(async tx=>{const [m]=await tx.insert(training).values({...input,createdBy:a.id}).returning();await this.audit.log(a,'PAYDAY_TRAINING_PUBLISHED','payday_training',m.id,{},tx);return m;});}
  async archiveCourse(a:AuthUser,id:string){return this.db.transaction(async tx=>{const [m]=await tx.update(training).set({active:false}).where(eq(training.id,id)).returning();if(!m)throw new NotFoundException();await this.audit.log(a,'PAYDAY_TRAINING_ARCHIVED','payday_training',id,{},tx);return m;});}
  async complete(a:AuthUser,id:string,revision:number) {await this.employee(a.id);const [m]=await this.db.select().from(training).where(and(eq(training.id,id),eq(training.active,true)));if(!m||m.revision!==revision) throw new ConflictException('Reload the current training module');await this.db.insert(completions).values({userId:a.id,moduleId:id,revision}).onConflictDoNothing();return {ok:true};}
  async employeeDetail(id:string) {const [employee,done,issued,pay,[user],earned,trainingComplete]=await Promise.all([this.employee(id),this.db.select().from(completions).where(eq(completions.userId,id)),this.db.select().from(kit).where(eq(kit.userId,id)),this.db.select().from(statements).where(eq(statements.userId,id)).orderBy(desc(statements.createdAt)).limit(36),this.db.select({firstName:users.firstName,lastName:users.lastName,email:users.email}).from(users).where(eq(users.id,id)),this.db.select({award:awards,statementId:statementAwards.statementId}).from(awards).leftJoin(statementAwards,eq(statementAwards.awardId,awards.id)).where(eq(awards.repId,id)),this.trainingComplete(id)]);return {employee,user,trainingComplete,completions:done,kit:issued,statements:pay,earnedAwards:earned.map(x=>({...x.award,statementId:x.statementId}))};}
  async myKit(a:AuthUser){return this.db.select().from(kit).where(eq(kit.userId,a.id)).orderBy(desc(kit.issuedAt));}
  async issueKit(a:AuthUser,input:z.infer<typeof dto.kitInput>){await this.employee(input.userId);return this.db.transaction(async tx=>{const [k]=await tx.insert(kit).values({...input,issuedBy:a.id}).returning();await this.audit.log(a,'PAYDAY_KIT_ISSUED','payday_kit',k.id,{},tx);return k;});}
  async kitAction(a:AuthUser,id:string,returned=false){const [k]=await this.db.select().from(kit).where(eq(kit.id,id));if(!k||(!returned&&k.userId!==a.id))throw new NotFoundException();return this.db.transaction(async tx=>{const [row]=await tx.update(kit).set(returned?{returnedAt:new Date()}:{acknowledgedAt:new Date()}).where(eq(kit.id,id)).returning();await this.audit.log(a,returned?'PAYDAY_KIT_RETURNED':'PAYDAY_KIT_ACKNOWLEDGED','payday_kit',id,{},tx);return row;});}
  async myStatements(a:AuthUser){return this.db.select().from(statements).where(and(eq(statements.userId,a.id),inArray(statements.status,['PUBLISHED','PAID']))).orderBy(desc(statements.period)).limit(120);}
  async createStatement(a:AuthUser,input:z.infer<typeof dto.statementInput>){return this.db.transaction(async tx=>{
    await tx.execute(sql`select user_id from payday_employees where user_id=${input.userId} for update`);await this.employee(input.userId,tx);
    const existing=await tx.select().from(statements).where(and(eq(statements.userId,input.userId),eq(statements.period,input.period),ne(statements.status,'CANCELED')));if(existing.length)throw new ConflictException('A statement already exists for this employee and period');
    if(new Set(input.awardIds).size!==input.awardIds.length)throw new BadRequestException('Duplicate commission selection');
    const selected=input.awardIds.length?await tx.select().from(awards).where(inArray(awards.id,input.awardIds)):[];
    if(selected.length!==input.awardIds.length||selected.some(x=>x.repId!==input.userId||x.paidAt))throw new BadRequestException('Select unpaid earned awards for this employee');
    if(input.awardIds.length&&(await tx.select().from(statementAwards).where(inArray(statementAwards.awardId,input.awardIds))).length)throw new ConflictException('Commission already assigned to payroll');
    const commissionCents=selected.reduce((s,x)=>s+x.amountCents,0),netCents=input.basicCents+input.otherCents+commissionCents-input.deductions.reduce((s,x)=>s+x.cents,0);if(netCents<0||netCents>100000000)throw new BadRequestException('Invalid net pay');
    const {awardIds,...data}=input;const [s]=await tx.insert(statements).values({...data,commissionCents,netCents,createdBy:a.id}).returning();
    if(awardIds.length)await tx.insert(statementAwards).values(awardIds.map(awardId=>({statementId:s.id,awardId})));
    await this.audit.log(a,'PAYDAY_STATEMENT_DRAFTED','payday_statement',s.id,{},tx);return s;
  });}
  async statementAction(a:AuthUser,id:string,action:'PUBLISH'|'CANCEL'|'PAY',reference?:string){return this.db.transaction(async tx=>{
    await tx.execute(sql`select id from payday_statements where id=${id} for update`);const [s]=await tx.select().from(statements).where(eq(statements.id,id));if(!s)throw new NotFoundException();
    if(action==='PUBLISH'&&(s.status!=='DRAFT'||s.createdBy===a.id||s.userId===a.id))throw new ForbiddenException('A second administrator must approve the draft payroll statement');
    if(action==='CANCEL'&&s.status!=='DRAFT')throw new ConflictException('Only unpublished drafts may be canceled');
    if(action==='PAY'&&(s.status!=='PUBLISHED'||s.approvedBy===a.id||!reference))throw new ForbiddenException('A different administrator must record a published statement’s payment evidence');
    if(action==='CANCEL')await tx.delete(statementAwards).where(eq(statementAwards.statementId,id));
    if(action==='PAY'){const links=await tx.select().from(statementAwards).where(eq(statementAwards.statementId,id));if(links.length)await tx.update(awards).set({paidBy:a.id,paidAt:new Date(),paymentReference:ref(reference!)}).where(inArray(awards.id,links.map(l=>l.awardId)));}
    const [row]=await tx.update(statements).set(action==='PUBLISH'?{status:'PUBLISHED',approvedBy:a.id,approvedAt:new Date()}:action==='CANCEL'?{status:'CANCELED'}:{status:'PAID',paidBy:a.id,paidAt:new Date(),paymentReference:ref(reference!)}).where(eq(statements.id,id)).returning();
    await this.audit.log(a,`PAYDAY_STATEMENT_${action}`,'payday_statement',id,{},tx);return row;
  });}
}
