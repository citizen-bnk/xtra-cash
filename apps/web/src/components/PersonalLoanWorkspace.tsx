'use client';
import {useState} from 'react';
import {formatZAR} from '@xtra/shared';
import {Alert,Button,Card,Loading,Modal,PageHeader,PersonalSettlementView,RecordLine,useApi} from '@xtra/ui';
import {SimpleLoanRequest} from './SimpleLoanRequest';
import {ApplicantDataVault} from './ApplicantDataVault';
const actions: Record<string,string>={ACTION_REQUIRED:'Respond now',OFFERED:'Review and accept offer',ACCEPTED:'View payment status',FUNDING_PENDING:'View payment status',DISBURSED:'View payment and repayments',DECLINED:'View decision',CANCELLED:'View details',FUNDING_FAILED:'View payment update'};
const shortActions: Record<string,string>={ACTION_REQUIRED:'Respond',OFFERED:'Review offer',ACCEPTED:'Payment',FUNDING_PENDING:'Payment',DISBURSED:'Repayments',DECLINED:'Decision',CANCELLED:'Details',FUNDING_FAILED:'Payment'};
function progress(status:string){if(status==='SUBMITTED')return 15;if(status==='REFERRED')return 25;if(status==='UNDER_REVIEW'||status==='ACTION_REQUIRED')return 50;if(status==='OFFERED')return 75;if(status==='ACCEPTED'||status==='FUNDING_PENDING')return 90;if(status==='DISBURSED')return 100;return 0;}
export function PersonalLoanWorkspace({title='Your personal-loan applications'}:{title?:string}){
 const applications=useApi(c=>c.consumer.personalApplications());
 const vault=useApi(c=>c.consumer.applicantVault());
 const [creating,setCreating]=useState(false),[vaultOpen,setVaultOpen]=useState(false),[active,setActive]=useState<string|null>(null);
 const close=()=>{setCreating(false);setActive(null);applications.reload();};
 const getLoan=()=>setCreating(true);
 return <section className="space-y-4">
 <PageHeader title={title} subtitle="Track your requests, respond to updates and review lender offers." actions={applications.data?.length ? <Button onClick={getLoan}>Get a new loan</Button> : undefined}/>
 {vault.data&&!vault.data.eligible&&<Alert tone="amber">Your loan probation period is still active. You can wait {vault.data.probation.daysRemaining} day{vault.data.probation.daysRemaining===1?'':'s'} or complete your data vault to fast-track eligibility. <Button variant="secondary" onClick={()=>setVaultOpen(true)}>Fast-track now</Button></Alert>}
 {applications.error && <Alert tone="red">{applications.error}<Button variant="secondary" onClick={applications.reload}>Try again</Button></Alert>}
 {applications.loading && !applications.data ? <Loading/> : !applications.error && !applications.data?.length ? <Card className="space-y-3 text-center"><h2 className="text-lg font-bold">Your first loan starts here</h2><p className="text-sm text-muted">Submit a request and receive an offer from a lender. Your applications will appear here.</p><Button onClick={getLoan}>Take your first loan</Button></Card> : <div className="overflow-hidden rounded-2xl border border-line bg-white">{applications.data?.map(app=><div key={app.id} className="border-b border-line last:border-0"><RecordLine title={`${formatZAR(app.amountCents)} · ${app.termMonths} months`} description={`${app.purpose} · ${new Date(app.createdAt).toLocaleDateString('en-ZA')}`} status={app.status} progress={progress(app.status)} actions={<Button size="sm" variant={['ACTION_REQUIRED','OFFERED'].includes(app.status)?'primary':'secondary'} aria-label={actions[app.status]??'Track request'} onClick={()=>setActive(app.id)}>{shortActions[app.status]??'Track'}</Button>}/>{app.reviewNotes&&<details className="px-4 pb-3 text-xs text-muted"><summary className="cursor-pointer font-semibold text-brand-purple">Latest update</summary><p className="mt-1">{app.reviewNotes}</p></details>}</div>)}</div>}
 <Modal open={creating} title="Get a new loan" onClose={close}>{creating && <SimpleLoanRequest onSubmitted={close}/>}</Modal>
 <Modal open={vaultOpen} title="Fast-track loan eligibility" onClose={()=>setVaultOpen(false)}>{vaultOpen&&<ApplicantDataVault onReady={()=>{vault.reload();setVaultOpen(false);setCreating(true);}}/>}</Modal>
 <Modal open={!!active} title="Your loan application" onClose={close}>{active && <PersonalSettlementView key={active} applicationId={active}/>}</Modal>
 </section>;
}
