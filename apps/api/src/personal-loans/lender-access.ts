import { Body, Controller, Get, Injectable, NotFoundException, BadRequestException, Param, Post } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { CurrentUser, Roles, type AuthUser } from '../common/auth';
import { InjectDb } from '../common/db.module';
import { Db } from '../db/client';
import { lenderOrgs, personalLoanApplications, users } from '../db/schema';
import { applicationLenderAccess } from './lender-ai.schema';
import { AuditService } from '../common/audit.service';
import { parse } from '../payday/payday.dto';
const accessInput=z.object({lenderId:z.string().min(1).max(100),active:z.boolean(),authorityReference:z.string().trim().min(5).max(500),confirmed:z.literal(true)}).strict();
@Injectable()
export class LenderAccessService {
 constructor(@InjectDb() private db:Db,private audit:AuditService){}
 async list(id:string){
  const app=await this.db.query.personalLoanApplications.findFirst({where:eq(personalLoanApplications.id,id)});
  if(!app)throw new NotFoundException();
  const lenders=await this.db.select({id:lenderOrgs.id,name:lenderOrgs.name}).from(lenderOrgs).innerJoin(users,eq(users.id,lenderOrgs.ownerUserId)).where(and(eq(lenderOrgs.accreditationStatus,'ACCREDITED'),eq(users.status,'ACTIVE')));
  const access=await this.db.select().from(applicationLenderAccess).where(eq(applicationLenderAccess.applicationId,id));
  return {selectedLenderId:app.lenderId,lenders,access};
 }
 async save(actor:AuthUser,id:string,input:z.infer<typeof accessInput>){
  return this.db.transaction(async tx=>{
   const [app]=await tx.select().from(personalLoanApplications).where(eq(personalLoanApplications.id,id)).for('update');
   if(!app)throw new NotFoundException();
   if(app.lenderId===input.lenderId)throw new BadRequestException('The applicant-selected lender already has access.');
   if(input.active){
    const [l]=await tx.select({id:lenderOrgs.id,roles:users.roles}).from(lenderOrgs).innerJoin(users,eq(users.id,lenderOrgs.ownerUserId)).where(and(eq(lenderOrgs.id,input.lenderId),eq(lenderOrgs.accreditationStatus,'ACCREDITED'),eq(users.status,'ACTIVE')));
    if(!l||!l.roles.includes('LENDER'))throw new BadRequestException('Choose an active accredited lender.');
   }
   const values={applicationId:id,lenderId:input.lenderId,grantedBy:actor.id,authorityReference:input.authorityReference,active:input.active?1:0,updatedAt:new Date()};
   await tx.insert(applicationLenderAccess).values(values).onConflictDoUpdate({target:[applicationLenderAccess.applicationId,applicationLenderAccess.lenderId],set:values});
   await this.audit.log(actor,input.active?'personal_loan.lender_access_granted':'personal_loan.lender_access_revoked','personal_loan_application',id,{lenderId:input.lenderId,authorityReference:input.authorityReference,permission:'VIEW_REQUEST_ONLY'},tx);
   return {ok:true};
  });
 }
}
@Roles('ADMIN','SUPER_ADMIN')
@Controller('personal-loans/applications')
export class LenderAccessController {
 constructor(private service:LenderAccessService){}
 @Get(':id/lender-access') list(@Param('id') id:string){return this.service.list(id);}
 @Post(':id/lender-access') save(@CurrentUser() a:AuthUser,@Param('id') id:string,@Body() body:unknown){return this.service.save(a,id,parse(accessInput,body));}
}
