'use client';
import {useState} from 'react';
import {formatZAR} from '@xtra/shared';
import {Alert,Button,Card,Loading,Modal,PageHeader,PersonalSettlementView,StatusBadge,useApi} from '@xtra/ui';
import {SimpleLoanRequest} from './SimpleLoanRequest';
import {ApplicantDataVault} from './ApplicantDataVault';
const actions: Record<string,string>={ACTION_REQUIRED:'Respond now',OFFERED:'Review and accept offer',ACCEPTED:'View payment status',FUNDING_PENDING:'View payment status',DISBURSED:'View payment and repayments',DECLINED:'View decision',CANCELLED:'View details',FUNDING_FAILED:'View payment update'};
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
 {applications.loading && !applications.data ? <Loading/> : !applications.error && !applications.data?.length ? <Card className="space-y-3 text-center"><h2 className="text-lg font-bold">Your first loan starts here</h2><p className="text-sm text-muted">Submit a request and receive an offer from a lender. Your applications will appear here.</p><Button onClick={getLoan}>Take your first loan</Button></Card> : <div className="space-y-3">{applications.data?.map(app=><Card key={app.id}><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-bold">{formatZAR(app.amountCents)} · {app.termMonths} months</h2><p className="mt-1 text-sm text-muted">{app.purpose} · {new Date(app.createdAt).toLocaleDateString('en-ZA')}</p></div><StatusBadge status={app.status}/></div>{app.reviewNotes && <p className="mt-3 text-sm">{app.reviewNotes}</p>}<Button className="mt-4" variant={['ACTION_REQUIRED','OFFERED'].includes(app.status)?'primary':'secondary'} onClick={()=>setActive(app.id)}>{actions[app.status]??'Track request'}</Button></Card>)}</div>}
 <Modal open={creating} title="Get a new loan" onClose={close}>{creating && <SimpleLoanRequest onSubmitted={close}/>}</Modal>
 <Modal open={vaultOpen} title="Fast-track loan eligibility" onClose={()=>setVaultOpen(false)}>{vaultOpen&&<ApplicantDataVault onReady={()=>{vault.reload();setVaultOpen(false);setCreating(true);}}/>}</Modal>
 <Modal open={!!active} title="Your loan application" onClose={close}>{active && <PersonalSettlementView key={active} applicationId={active}/>}</Modal>
 </section>;
}
