'use client';
import Image from 'next/image';
import {useState} from 'react';
import {formatZAR} from '@xtra/shared';
import {Alert,Button,Loading,Modal,PageHeader,PersonalSettlementView,RecordLine,useApi} from '@xtra/ui';
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
 <PageHeader title={title} subtitle="Apply, compare lender offers and manage repayments." actions={applications.data?.length ? <Button className="bg-gradient-to-r from-[#8c00cf] to-[#d91f63] text-white hover:brightness-105" onClick={getLoan}>Get a loan</Button> : undefined}/>
 {vault.data&&!vault.data.eligible&&<Alert tone="amber">Your loan probation period is still active. You can wait {vault.data.probation.daysRemaining} day{vault.data.probation.daysRemaining===1?'':'s'} or complete your data vault to fast-track eligibility. <Button variant="secondary" onClick={()=>setVaultOpen(true)}>Fast-track now</Button></Alert>}
 {applications.error && <Alert tone="red">{applications.error}<Button variant="secondary" onClick={applications.reload}>Try again</Button></Alert>}
 {applications.loading && !applications.data ? <Loading/> : !applications.error && !applications.data?.length ? <section className="relative flex min-h-48 items-center overflow-hidden rounded-[26px] bg-gradient-to-r from-[#32144e] via-[#7511aa] to-[#d91f63] p-5 text-white shadow-[0_12px_30px_rgba(51,17,78,.2)]"><Image src="/brand/ui/illustration_p_lender.png" alt="" aria-hidden width={240} height={170} className="absolute -right-2 bottom-0 h-40 w-40 object-contain object-bottom opacity-90"/><div className="relative z-10 max-w-[66%] space-y-2"><p className="text-[10px] font-bold uppercase tracking-[.16em] text-white/70">Your next step</p><h2 className="text-xl font-bold text-white">Your first loan starts here.</h2><p className="text-xs leading-relaxed text-white/85">Choose an amount and period. Compare real lender offers before accepting.</p><Button className="mt-1 rounded-full bg-[#fb9320] text-[#1b1030] hover:bg-[#ffac45]" onClick={getLoan}>Get your first loan</Button></div></section> : <div className="overflow-hidden rounded-2xl border border-line bg-white">{applications.data?.map(app=><div key={app.id} className="border-b border-line last:border-0"><RecordLine title={`${formatZAR(app.amountCents)} · ${app.termMonths} months`} description={`${app.purpose} · ${new Date(app.createdAt).toLocaleDateString('en-ZA')}`} status={app.status} progress={progress(app.status)} actions={<Button size="sm" variant={['ACTION_REQUIRED','OFFERED'].includes(app.status)?'primary':'secondary'} aria-label={actions[app.status]??'Track request'} onClick={()=>setActive(app.id)}>{shortActions[app.status]??'Track'}</Button>}/>{app.reviewNotes&&<details className="px-4 pb-3 text-xs text-muted"><summary className="cursor-pointer font-semibold text-brand-purple">Latest update</summary><p className="mt-1">{app.reviewNotes}</p></details>}</div>)}</div>}
 <Modal open={creating} title="Get a new loan" onClose={close}>{creating && <SimpleLoanRequest onSubmitted={close}/>}</Modal>
 <Modal open={vaultOpen} title="Fast-track loan eligibility" onClose={()=>setVaultOpen(false)}>{vaultOpen&&<ApplicantDataVault onReady={()=>{vault.reload();setVaultOpen(false);setCreating(true);}}/>}</Modal>
 <Modal open={!!active} title="Your loan application" onClose={close}>{active && <PersonalSettlementView key={active} applicationId={active}/>}</Modal>
 </section>;
}
