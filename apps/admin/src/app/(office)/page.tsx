'use client';
import Link from 'next/link';
import { Activity, ArrowRight, Banknote, Bell, Building2, Check, CircleAlert, CreditCard, FileStack, Layers3, Plus, ShieldCheck, ShoppingCart, Users, Zap } from 'lucide-react';

const stats = [
  { title: 'Total customers', value: '214,890', change: '+5.2%', icon: Users, tone: 'purple' },
  { title: 'Loan applications', value: '12,480', change: '+8.7%', icon: FileStack, tone: 'purple' },
  { title: 'Loans disbursed', value: 'R78.45m', change: '+11.4%', icon: Banknote, tone: 'orange' },
  { title: 'BNPL transactions', value: 'R12.76m', change: '+9.1%', icon: ShoppingCart, tone: 'purple' },
  { title: 'Bill payments', value: 'R9.34m', change: '+6.3%', icon: CreditCard, tone: 'purple' },
  { title: 'Collections rate', value: '96.8%', change: '+1.9 pp', icon: ShieldCheck, tone: 'green' },
];
const actions = [
  ['New loan application', '/applications', Plus], ['Onboard lender', '/lenders', Building2], ['Add employer', '/payday', Users],
  ['Review KYC', '/kyc', ShieldCheck], ['Confirm funding', '/funding', CreditCard], ['View settlements', '/money', Layers3], ['More actions', '/reports', ArrowRight],
] as const;
const activity = [
  ['Loan disbursed · ACC-784921', 'R5,000.00', '2 min ago', Check, 'green'],
  ['New customer registered · Naledi M.', '', '6 min ago', Users, 'purple'],
  ['BNPL purchase · Pick n Pay', 'R1,499.00', '14 min ago', ShoppingCart, 'purple'],
  ['Bill payment · Eskom', 'R860.00', '18 min ago', CreditCard, 'purple'],
  ['Payment missed · ACC-768320', 'R2,500.00', '32 min ago', CircleAlert, 'red'],
] as const;
const alerts = [
  ['46 loans overdue (R1,246,000)', 'Action required', '/loans?status=IN_ARREARS', 'red'],
  ['12 applications require review', 'Review', '/applications', 'orange'],
  ['3 employer payroll files pending', 'Upload', '/payday', 'blue'],
] as const;

export default function Dashboard() {
  return <div className="space-y-3 text-[#211335]">
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-gradient-to-r from-[#4a0085] via-[#9300d5] to-[#d6009b] px-5 py-4 text-white shadow-sm sm:px-7">
      <div className="min-w-0"><div className="text-xs font-bold uppercase tracking-[.16em] text-white/70">Operations · Lending · Payments · Merchants · Collections · Compliance</div><h1 className="mt-1 text-2xl font-extrabold sm:text-3xl">XTRA-CASH <span className="font-medium italic">Back Office</span></h1><p className="mt-1 max-w-2xl text-sm text-white/85">Manage lending, payments, BNPL, merchants, payroll and collections in one unified platform.</p></div>
      <div className="flex items-center gap-2 rounded-xl border border-white/25 bg-white/10 px-3 py-2 text-sm"><span className="h-2 w-2 rounded-full bg-emerald-300"/>This month <span className="text-white/75">· 01–30 Nov 2026</span></div>
    </div>
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-950"><span><strong>UI preview data</strong> · Sample figures for interface review only; not live financial or operational records.</span><span className="font-semibold">Updated 12 Nov 2026</span></div>

    <section aria-label="Platform summary" className="grid grid-cols-2 gap-2 sm:grid-cols-3 2xl:grid-cols-6">
      {stats.map(({ title, value, change, icon: Icon, tone }) => <div key={title} className="rounded-xl border border-[#e2d8f0] bg-white p-3 shadow-[0_2px_8px_#32104c12] sm:p-3.5"><div className="flex items-center gap-2"><span className={`grid h-9 w-9 place-items-center rounded-xl ${tone === 'orange' ? 'bg-orange-500' : tone === 'green' ? 'bg-emerald-500' : 'bg-gradient-to-br from-[#b500ff] to-[#6900b6]'} text-white`}><Icon className="h-5 w-5"/></span><span className="text-xs font-semibold leading-tight text-slate-700">{title}</span></div><div className="mt-2 text-xl font-extrabold tabular-nums sm:text-2xl">{value}</div><div className="mt-0.5 text-xs font-bold text-green-700">▲ {change} <span className="font-normal text-slate-500">vs last month</span></div></div>)}
    </section>

    <section aria-label="Quick actions"><h2 className="mb-2 text-base font-extrabold text-[#4a0085]">Quick actions</h2><div className="grid grid-cols-2 gap-2 sm:grid-cols-4 2xl:grid-cols-7">{actions.map(([label, href, Icon]) => <Link key={label} href={href} className="flex min-h-12 items-center gap-2 rounded-xl border border-[#e2d8f0] bg-white px-3 py-2 text-xs font-bold shadow-sm transition hover:border-[#a600ef] hover:text-[#7300bd] focus-visible:outline-2 focus-visible:outline-[#8b00cf]"><span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[#f4e5ff] text-[#8b00cf]"><Icon className="h-4 w-4"/></span><span>{label}</span></Link>)}</div></section>

    <section className="grid gap-3 xl:grid-cols-3">
      <Panel title="Portfolio overview" icon={Layers3} link="/loans" linkText="View details"><div className="flex items-center gap-4 py-2"><div className="relative grid h-32 w-32 shrink-0 place-items-center rounded-full" style={{background:'conic-gradient(#8500d7 0 72%, #ff9700 72% 84%, #e6007e 84% 92%, #8a8ca6 92% 97%, #cca5ed 97% 100%)'}}><div className="grid h-24 w-24 place-items-center rounded-full bg-white text-center"><span><b className="block text-lg">R455.6m</b><span className="text-[10px] text-slate-500">Total portfolio</span></span></div></div><div className="min-w-0 flex-1 space-y-1.5 text-xs">{[['Active loans','72.4%','#8500d7'],['BNPL','12.6%','#ff9700'],['Overdue','8.1%','#e6007e'],['Restructured','4.7%','#8a8ca6'],['Written off','2.2%','#cca5ed']].map(([n,v,c])=><div className="flex items-center gap-2" key={n}><span className="h-2.5 w-2.5 rounded-sm" style={{background:c}}/><span className="flex-1">{n}</span><b>{v}</b></div>)}</div></div></Panel>
      <Panel title="Disbursements & collections" icon={Activity} link="/reports" linkText="View report"><div className="flex h-36 items-end gap-2 border-b border-l border-slate-200 px-2 pb-1 pt-3">{[['Jun',36],['Jul',48],['Aug',53],['Sep',64],['Oct',70],['Nov',82]].map(([m,h])=><div key={m} className="flex h-full flex-1 flex-col items-center justify-end gap-1"><div className="w-full max-w-10 rounded-t bg-gradient-to-t from-[#8500d7] to-[#df47ff]" style={{height:`${h}%`}}/><span className="text-[10px] text-slate-500">{m}</span></div>)}</div><div className="mt-2 flex justify-center gap-4 text-[10px] text-slate-600"><span>■ Disbursements</span><span className="text-orange-600">━● Collections</span></div></Panel>
      <Panel title="Application pipeline" icon={Layers3} link="/applications" linkText="View details"><div className="space-y-2 py-1">{[['12,480','Applications','100%','#7900c7'],['9,860','In assessment','79%','#d90098'],['8,420','Approved','68%','#ff7800'],['7,995','Disbursed','64%','#ffb000']].map(([n,label,w,c])=><div key={label} className="flex items-center gap-2 text-xs"><div className="min-w-0 flex-1"><div className="flex justify-between"><b>{n}</b><span>{label}</span></div><div className="mt-1 h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full" style={{width:w,background:c}}/></div></div></div>)}</div><div className="mt-3 border-t pt-2 text-xs">Approval rate <b className="float-right text-lg">68.8%</b></div></Panel>
    </section>

    <section className="grid gap-3 xl:grid-cols-3">
      <Panel title="Recent activity" icon={Activity} link="/audit" linkText="View all"><div className="divide-y divide-slate-100">{activity.map(([name, amount, when, Icon, tone])=><div key={name} className="flex items-center gap-2 py-2 text-xs"><Icon className={`h-4 w-4 shrink-0 ${tone==='green'?'text-green-600':tone==='red'?'text-red-500':'text-[#8b00cf]'}`}/><span className="min-w-0 flex-1 truncate font-semibold">{name}</span>{amount&&<b>{amount}</b>}<span className="whitespace-nowrap text-slate-500">{when}</span></div>)}</div></Panel>
      <Panel title="Alerts & actions" icon={Bell} link="/applications" linkText="View all"><div className="divide-y divide-slate-100">{alerts.map(([text,cta,href,tone])=><div key={text} className="flex items-center gap-2 py-2 text-xs"><CircleAlert className={`h-4 w-4 shrink-0 ${tone==='red'?'text-red-500':tone==='orange'?'text-orange-500':'text-blue-500'}`}/><span className="min-w-0 flex-1 font-semibold">{text}</span><Link href={href} className="rounded-lg border border-[#d9c9ee] px-2 py-1 font-bold text-[#7400bd]">{cta}</Link></div>)}</div></Panel>
      <Panel title="System health" icon={Zap} link="/settings" linkText="View all"><div className="grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-2 2xl:grid-cols-4">{[['Payments','Online'],['Integrations','Online'],['Credit bureau','Online'],['Uptime','99.9%']].map(([label,status])=><div key={label} className="rounded-xl border border-slate-200 bg-slate-50 px-2 py-3 text-center"><Check className="mx-auto h-6 w-6 rounded-full bg-green-500 p-1 text-white"/><b className="mt-1 block text-xs">{label}</b><span className="text-[10px] font-bold text-green-700">{status}</span></div>)}</div><p className="mt-2 text-[10px] text-slate-500">Sample status indicators for layout preview.</p></Panel>
    </section>
  </div>;
}

function Panel({ title, icon: Icon, link, linkText, children }: { title: string; icon: typeof Layers3; link: string; linkText: string; children: React.ReactNode }) {
  return <section className="min-w-0 rounded-2xl border border-[#e2d8f0] bg-white p-3 shadow-[0_2px_8px_#32104c12] sm:p-4"><div className="mb-2 flex items-center gap-2"><Icon className="h-5 w-5 shrink-0 text-[#8b00cf]"/><h2 className="min-w-0 flex-1 truncate text-sm font-extrabold sm:text-base">{title}</h2><Link href={link} className="whitespace-nowrap text-[10px] font-bold text-[#8500d7] sm:text-xs">{linkText} <ArrowRight className="inline h-3 w-3"/></Link></div>{children}</section>;
}
