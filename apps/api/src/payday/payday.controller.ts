import { ArgumentsHost, Body, Catch, Controller, ExceptionFilter, Get, HttpCode, HttpException, Param, Post, Query, UseFilters } from '@nestjs/common';
import { CurrentUser, Roles, type AuthUser } from '../common/auth';
import { PaydayService } from './payday.service';
import * as dto from './payday.dto';
import { z } from 'zod';

@Catch()
class PaydayErrors implements ExceptionFilter {
  catch(error: unknown, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse();
    if (error instanceof HttpException) return response.status(error.getStatus()).json(error.getResponse());
    const code = (error as { code?: string; cause?: { code?: string } })?.cause?.code ?? (error as { code?: string })?.code;
    if (code === '23505') return response.status(409).json({message:'This employee, receipt or payroll reference is already recorded. Reload before retrying.'});
    console.error(JSON.stringify({event:'payday_unexpected_error',code:code??null,name:error instanceof Error?error.name:'Unknown'}));
    return response.status(500).json({message:'Staff operations could not complete the request. Please try again or contact operations.'});
  }
}
const decision = z.object({ approve: z.boolean() }).strict();
@Controller('payday')
@Roles('SALES_REP','ADMIN','SUPER_ADMIN')
@UseFilters(new PaydayErrors())
export class PaydayController {
  constructor(private service: PaydayService) {}
  @Get('me') me(@CurrentUser() a:AuthUser){return this.service.me(a);}
  @Post('me/onboarding') @HttpCode(200) acknowledge(@CurrentUser() a:AuthUser,@Body() body:unknown){dto.parse(z.object({acknowledged:z.literal(true)}).strict(),body);return this.service.acknowledge(a);}
  @Post('me/password') @HttpCode(200) password(@CurrentUser() a:AuthUser,@Body() body:unknown){return this.service.changePassword(a,dto.parse(dto.passwordInput,body));}
  @Post('me/contact') @HttpCode(200) contact(@CurrentUser() a:AuthUser,@Body() body:unknown){const d=dto.parse(z.object({phone:z.string().trim().min(7).max(30),emergencyContact:z.string().trim().min(1).max(200)}).strict(),body);return this.service.contact(a,d.phone,d.emergencyContact);}
  @Get('training') courses(@CurrentUser() a:AuthUser){return this.service.courses(a);}
  @Post('training/:id/complete') @HttpCode(200) complete(@CurrentUser() a:AuthUser,@Param('id') id:string,@Body() body:unknown){const d=dto.parse(dto.completionInput,body);return this.service.complete(a,id,d.revision);}
  @Get('kit') kit(@CurrentUser() a:AuthUser){return this.service.myKit(a);}
  @Post('kit/:id/acknowledge') @HttpCode(200) kitAck(@CurrentUser() a:AuthUser,@Param('id') id:string){return this.service.kitAction(a,id);}
  @Get('statements') statements(@CurrentUser() a:AuthUser){return this.service.myStatements(a);}
  @Get('employers') list(@CurrentUser() a:AuthUser,@Query('page') page?:string,@Query('q') q?:string){return this.service.list(a,Number(page),q);}
  @Get('employers/:id') detail(@CurrentUser() a:AuthUser,@Param('id') id:string){return this.service.detail(a,id);}
  @Post('employers') create(@CurrentUser() a:AuthUser,@Body() body:unknown){return this.service.create(a,dto.parse(dto.leadInput,body));}
  @Post('employers/:id') @HttpCode(200) update(@CurrentUser() a:AuthUser,@Param('id') id:string,@Body() body:unknown){return this.service.update(a,id,dto.parse(dto.leadUpdate,body));}
  @Post('visits') visit(@CurrentUser() a:AuthUser,@Body() body:unknown){return this.service.visit(a,dto.parse(dto.visitInput,body));}
  @Roles('ADMIN','SUPER_ADMIN') @Post('employers/:id/entries') entry(@CurrentUser() a:AuthUser,@Param('id') id:string,@Body() body:unknown){return this.service.entry(a,id,dto.parse(dto.entryInput,body));}
  @Roles('ADMIN','SUPER_ADMIN') @Post('entries/:id/decision') @HttpCode(200) verify(@CurrentUser() a:AuthUser,@Param('id') id:string,@Body() body:unknown){return this.service.verifyEntry(a,id,dto.parse(decision,body).approve);}
  @Roles('ADMIN','SUPER_ADMIN') @Post('entries/:id/reverse') reverse(@CurrentUser() a:AuthUser,@Param('id') id:string,@Body() body:unknown){return this.service.reverse(a,id,dto.parse(dto.reversalInput,body));}
  @Roles('SUPER_ADMIN') @Post('employers/:id/qualify') @HttpCode(200) qualify(@CurrentUser() a:AuthUser,@Param('id') id:string){return this.service.qualify(a,id);}
  @Roles('ADMIN','SUPER_ADMIN') @Get('employees') employees(){return this.service.employeeList();}
  @Roles('SUPER_ADMIN') @Post('employees') provision(@CurrentUser() a:AuthUser,@Body() body:unknown){return this.service.provision(a,dto.parse(dto.employeeInput,body));}
  @Roles('ADMIN','SUPER_ADMIN') @Get('employees/:id') employee(@Param('id') id:string){return this.service.employeeDetail(id);}
  @Roles('SUPER_ADMIN') @Post('employees/:id') @HttpCode(200) manage(@CurrentUser() a:AuthUser,@Param('id') id:string,@Body() body:unknown){return this.service.manageEmployee(a,id,dto.parse(dto.employeeUpdate,body));}
  @Roles('ADMIN','SUPER_ADMIN') @Post('training') training(@CurrentUser() a:AuthUser,@Body() body:unknown){return this.service.createCourse(a,dto.parse(dto.trainingInput,body));}
  @Roles('ADMIN','SUPER_ADMIN') @Post('training/:id/archive') @HttpCode(200) archiveTraining(@CurrentUser() a:AuthUser,@Param('id') id:string){return this.service.archiveCourse(a,id);}
  @Roles('ADMIN','SUPER_ADMIN') @Post('kit') issueKit(@CurrentUser() a:AuthUser,@Body() body:unknown){return this.service.issueKit(a,dto.parse(dto.kitInput,body));}
  @Roles('ADMIN','SUPER_ADMIN') @Post('kit/:id/return') @HttpCode(200) returnKit(@CurrentUser() a:AuthUser,@Param('id') id:string){return this.service.kitAction(a,id,true);}
  @Roles('ADMIN','SUPER_ADMIN') @Post('statements') statement(@CurrentUser() a:AuthUser,@Body() body:unknown){return this.service.createStatement(a,dto.parse(dto.statementInput,body));}
  @Roles('SUPER_ADMIN') @Post('statements/:id/publish') @HttpCode(200) publish(@CurrentUser() a:AuthUser,@Param('id') id:string){return this.service.statementAction(a,id,'PUBLISH');}
  @Roles('ADMIN','SUPER_ADMIN') @Post('statements/:id/cancel') @HttpCode(200) cancel(@CurrentUser() a:AuthUser,@Param('id') id:string){return this.service.statementAction(a,id,'CANCEL');}
  @Roles('ADMIN','SUPER_ADMIN') @Post('statements/:id/pay') @HttpCode(200) pay(@CurrentUser() a:AuthUser,@Param('id') id:string,@Body() body:unknown){return this.service.statementAction(a,id,'PAY',dto.parse(dto.referenceInput,body).reference);}
}
