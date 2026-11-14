'use client';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { ArrowLeft, Bell, Camera, Check, ChevronRight, CircleHelp, CreditCard, FileText, Fingerprint, House, IdCard, KeyRound, Landmark, Languages, Link2, LockKeyhole, LogOut, Mail, MapPin, Pencil, Phone, Settings2, ShieldCheck, UserRound, Wallet } from 'lucide-react';
import { formatZAR } from '@xtra/shared';
import { Alert, Button, Field, Input, LoanActionCentre, Logo, SecuritySettings, useApi, useAuth, useToast } from '@xtra/ui';
import PhotoCrop from './PhotoCrop';
import { CustomerProfileLink } from '@/components/CustomerProfileLink';

type Screen = 'overview' | 'personal' | 'documents' | 'security' | 'linked' | 'notifications' | 'help' | 'logout' | 'saved';
type DocumentType = 'ID_DOCUMENT' | 'PROOF_OF_ADDRESS' | 'PROOF_OF_INCOME' | 'BANK_STATEMENT';
type Preferences = { marketing: boolean; locationEnabled: boolean };
type ServiceProfile = { address?: string; identityNumber?: string; dateOfBirth?: string };
const gradient = 'bg-gradient-to-r from-[#9500dc] to-[#6700b8] text-white shadow-[0_6px_16px_rgba(126,0,184,.25)]';
const documentRows: { type: DocumentType; key: string; label: string; icon: typeof FileText }[] = [
  { type: 'ID_DOCUMENT', key: 'identity', label: 'ID Copy', icon: IdCard },
  { type: 'PROOF_OF_ADDRESS', key: 'address', label: 'Proof of Residence', icon: House },
  { type: 'PROOF_OF_INCOME', key: 'income', label: 'Payslip', icon: FileText },
  { type: 'BANK_STATEMENT', key: 'bank', label: 'Bank Statements', icon: Landmark },
];
const tiles: { screen: Screen; label: string; icon: typeof FileText }[] = [
  { screen: 'personal', label: 'Personal Details', icon: UserRound },
  { screen: 'documents', label: 'My Documents', icon: FileText },
  { screen: 'security', label: 'Security', icon: ShieldCheck },
  { screen: 'linked', label: 'Linked Accounts', icon: Link2 },
  { screen: 'notifications', label: 'Notifications', icon: Bell },
  { screen: 'help', label: 'Help & Support', icon: CircleHelp },
];

export default function ProfilePage() {
  const { me, client, refreshMe, logout } = useAuth();
  const router = useRouter(), toast = useToast();
  const vault = useApi(c => c.consumer.applicantVault());
  const profile = useApi(c => c.request<ServiceProfile>('GET', '/me/service-profile'));
  const [screen, setScreen] = useState<Screen>('overview');
  const [firstName, setFirstName] = useState(''), [lastName, setLastName] = useState('');
  const [preferences, setPreferences] = useState<Preferences>({ marketing: false, locationEnabled: false });
  const [busy, setBusy] = useState(false), [uploading, setUploading] = useState<DocumentType | null>(null), [error, setError] = useState('');
  useEffect(() => { if (me) { setFirstName(me.firstName ?? ''); setLastName(me.lastName ?? ''); } }, [me]);
  useEffect(() => { client.request<Preferences>('GET', '/marketing/preferences').then(setPreferences).catch(() => undefined); }, [client]);
  const [photo, setPhoto] = useState('');
  const [photoOpen, setPhotoOpen] = useState(false);
  const [photoVersion, setPhotoVersion] = useState(0);
  const accountId = me?.id;
  useEffect(() => {
    if (!accountId) return;
    let active = true;
    let url = '';
    setPhoto('');
    client.blob('/me/profile-photo').then(blob => {
      if (active) { url = URL.createObjectURL(blob); setPhoto(url); }
    }).catch(() => undefined);
    return () => { active = false; if (url) URL.revokeObjectURL(url); };
  }, [accountId, client, photoVersion]);
  if (!me) return null;
  const name = `${me.firstName || ''} ${me.lastName || ''}`.trim() || 'XTRA-CASH customer';
  const initials = `${me.firstName?.[0] || 'X'}${me.lastName?.[0] || 'C'}`.toUpperCase();
  const identity = me.kyc?.idNumber || profile.data?.identityNumber;
  const supplied = (key: string) => !!vault.data?.fastTrack.required.find(row => row.key === key)?.supplied;
  const completed = documentRows.filter(row => supplied(row.key)).length;
  const completion = [!!name, !!me.phone, !!me.email, !!identity, !!profile.data?.address, supplied('bank')].filter(Boolean).length;

  async function saveName() {
    setBusy(true); setError('');
    try { await client.request('PUT', '/auth/passwordless/profile', { firstName, lastName }); await refreshMe(); setScreen('saved'); }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not save your details.'); }
    finally { setBusy(false); }
  }
  async function upload(type: DocumentType, file?: File) {
    if (!file) return;
    setUploading(type); setError('');
    try { vault.setData(await client.consumer.uploadVaultDocument(type, file)); toast('Document added to your profile.'); }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not upload your document.'); }
    finally { setUploading(null); }
  }
  async function savePreferences() {
    setBusy(true); setError('');
    try { const saved = await client.request<Preferences>('PUT', '/marketing/preferences', preferences); setPreferences(saved); toast('Preferences saved.'); }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not save preferences.'); }
    finally { setBusy(false); }
  }
  const open = (next: Screen) => { setError(''); setScreen(next); };
  const avatar = (size = 'h-16 w-16 text-xl') => photo ? <img src={photo} alt="Profile photo" className={`shrink-0 rounded-full border-[3px] border-white object-cover ${size}`} /> : <span aria-label="Profile initials" className={`grid shrink-0 place-items-center rounded-full border-[3px] border-white bg-gradient-to-br from-[#fb9320] via-[#ee5991] to-[#7100ad] font-black text-white shadow-[0_4px_16px_rgba(75,0,90,.3)] ${size}`}>{initials}</span>;
  const subtitle = { overview: 'Here’s your profile overview.', personal: 'Keep your information up to date.', documents: 'Manage your verification documents.', security: 'Manage your account securely.', linked: 'Your connected accounts.', notifications: 'Choose the alerts you receive.', help: 'We’re here to help.', logout: 'See you again soon.', saved: 'Your changes are saved.' }[screen];
  const detail = (label: string, value: string, Icon: typeof FileText, onEdit?: () => void) => <div className="flex min-h-14 items-center gap-3 border-b border-[#ddc8ee] py-2.5 last:border-0"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#f4e5ff] text-[#8200c8]"><Icon className="h-5 w-5" /></span><span className="min-w-0 flex-1 text-sm font-bold text-[#1b1030] sm:flex-[.65]">{label}</span><span className="min-w-0 flex-[1.3] break-words text-sm text-[#1b1030]">{value}</span>{onEdit && <button type="button" aria-label={`Edit ${label}`} onClick={onEdit} className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[#f4e5ff] text-[#8200c8]"><Pencil className="h-4 w-4" /></button>}</div>;
  const action = (label: string, Icon: typeof FileText, next: Screen) => <button type="button" onClick={() => open(next)} className="flex min-h-20 items-center gap-3 rounded-[22px] border border-white/75 bg-white/95 px-4 text-left text-[#1b1030] shadow-[0_5px_16px_rgba(53,0,92,.18)]"><Icon className="h-8 w-8 shrink-0 text-[#8900d1]" /><b className="min-w-0 flex-1 text-sm">{label}</b><ChevronRight className="h-5 w-5 shrink-0" /></button>;
  const setting = (label: string, description: string, Icon: typeof FileText, onClick?: () => void, trailing?: React.ReactNode) => <button type="button" onClick={onClick} disabled={!onClick} className="flex w-full items-center gap-3 border-b border-[#e0d2ea] py-3 text-left last:border-0 disabled:cursor-default"><span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-[#f2e4fc] text-[#7600bb]"><Icon className="h-6 w-6" /></span><span className="min-w-0 flex-1"><b className="block text-sm">{label}</b><span className="block text-xs text-muted">{description}</span></span>{trailing ?? (onClick ? <ChevronRight className="h-5 w-5 shrink-0" /> : null)}</button>;
  return <div className="relative min-h-[calc(100dvh-5rem)] overflow-hidden bg-[radial-gradient(circle_at_96%_40%,#ff9226_0%,transparent_25%),linear-gradient(155deg,#300050_0%,#62008c_40%,#d40091_100%)] pb-7 text-white">
    <div className="mx-auto w-full max-w-2xl px-4 pb-4 pt-5 sm:px-6">
      <div className="flex items-center justify-between"><button type="button" onClick={() => screen === 'overview' ? router.push('/app') : open('overview')} className="inline-flex h-10 items-center gap-1 rounded-full bg-white/10 px-3 text-sm font-bold text-white"><ArrowLeft className="h-4 w-4" />{screen === 'overview' ? 'Home' : 'Profile'}</button><Logo light size={27} /><div className="flex items-center gap-1"><LoanActionCentre /><CustomerProfileLink /></div></div>
      <div className="mt-5 flex items-center gap-4">{avatar()}<div><h1 className="text-2xl font-black text-white">Hi {me.firstName || 'there'} 👋</h1><p className="text-sm text-white/90">{subtitle}</p></div></div>
      <div className="mt-5 rounded-[30px] border border-white/80 bg-[linear-gradient(145deg,#fff9ff,#f3e8fb_64%,#fff5ff)] p-4 text-[#1b1030] shadow-[0_0_0_3px_rgba(238,0,255,.35),0_12px_28px_rgba(33,0,55,.27)] sm:p-6">
        {screen === 'overview' && <><div className="mb-3 flex items-center justify-end"><button type="button" onClick={() => open('personal')} className="inline-flex items-center gap-2 rounded-full border-2 border-[#9000d2] px-4 py-2 text-sm font-bold text-[#6900a7]"><Pencil className="h-4 w-4" /> Edit Profile</button></div>{detail('Full Name', name, UserRound)}{detail('Mobile Number', me.phone || 'Not added', Phone)}{detail('Email', me.email || 'Not added', Mail)}{detail('Address', profile.data?.address || 'Not added', MapPin)}{detail('ID Number', identity ? `••••••••${identity.slice(-4)}` : 'Not added', IdCard)}</>}
        {screen === 'personal' && <><div className="flex items-center justify-between gap-2"><div><h2 className="text-xl font-black">Personal Details</h2><p className="text-xs text-muted">Keep your information up to date.</p></div><button type="button" onClick={() => void saveName()} disabled={busy} className={`rounded-full px-4 py-2 text-sm font-bold ${gradient}`}>{busy ? 'Saving…' : 'Save Changes'}</button></div><div className="my-5 flex flex-col items-center">{avatar('h-28 w-28 text-3xl')}<button type="button" onClick={() => setPhotoOpen(!photoOpen)} aria-expanded={photoOpen} className="mt-2 inline-flex items-center gap-2 rounded-full border border-[#9000d2] px-4 py-1.5 text-sm font-bold text-[#6900a7]"><Camera className="h-4 w-4" /> Change Photo</button>{photoOpen && <PhotoCrop onSave={async blob => {
    const body = new FormData();
    body.append('file', blob, 'profile.jpg');
    await client.request('POST', '/me/profile-photo', body);
    setPhotoVersion(value => value + 1);
  }} />}</div><div className="grid gap-3 sm:grid-cols-2"><Field label="First name"><Input value={firstName} onChange={e => setFirstName(e.target.value)} /></Field><Field label="Surname"><Input value={lastName} onChange={e => setLastName(e.target.value)} /></Field></div><div className="mt-3">{detail('Mobile Number', me.phone || 'Not added', Phone)}{detail('Email', me.email || 'Not added', Mail)}{detail('Date of Birth', me.kyc?.dateOfBirth ? new Date(me.kyc.dateOfBirth).toLocaleDateString('en-ZA') : 'Not added', FileText)}{detail('ID Number', identity ? `••••••••${identity.slice(-4)}` : 'Not added', IdCard)}{detail('Address', profile.data?.address || 'Not added', MapPin)}</div><p className="mt-3 text-xs text-muted">Identity and contact changes need verification. Contact support if these details are incorrect.</p></>}
        {screen === 'documents' && <><div className="flex items-center gap-3"><FileText className="h-9 w-9 text-[#8000c4]" /><h2 className="text-2xl font-black">My Documents</h2></div><p className="mt-4 text-sm">Documents <b className="text-[#8300c5]">{completed} of {documentRows.length}</b> added</p><div className="mt-2 h-2.5 overflow-hidden rounded-full bg-[#d8c8e5]"><div className="h-full rounded-full bg-gradient-to-r from-[#ad00e5] to-[#7600bf]" style={{ width: `${completed / documentRows.length * 100}%` }} /></div><div className="mt-5 space-y-3">{documentRows.map(row => { const isAdded = supplied(row.key); const Icon = row.icon; return <div key={row.type} className="flex items-center gap-2 rounded-2xl border border-[#dfcbea] bg-white p-3 shadow-sm"><Icon className="h-7 w-7 shrink-0 text-[#8900d1]" /><span className="min-w-0 flex-1 text-sm font-bold">{row.label}</span><span className={`rounded-full px-2 py-1 text-[11px] ${isAdded ? 'bg-green-100 text-green-800' : 'bg-[#eee5f4] text-[#4c3d59]'}`}>{isAdded ? '✓ Added' : 'Not added'}</span><label className="cursor-pointer rounded-full border border-[#8700ca] px-3 py-1.5 text-xs font-bold text-[#7100ad]">{uploading === row.type ? 'Uploading…' : isAdded ? 'Add more' : 'Upload'}<input type="file" className="sr-only" accept="application/pdf,image/jpeg,image/png" disabled={!!uploading} onChange={e => { void upload(row.type, e.target.files?.[0]); e.currentTarget.value = ''; }} /></label></div>; })}</div>{vault.data && vault.data.documents.length > 0 && <p className="mt-4 text-xs text-muted">Files on your profile: {vault.data.documents.map(doc => doc.originalName).join(', ')}</p>}<p className="mt-5 text-center text-xs italic text-muted">Only upload what is requested. You can add more files later.</p></>}
        {screen === 'security' && <><div className="mb-3 flex items-center gap-3"><Settings2 className="h-10 w-10 text-[#7900bc]" /><div><h2 className="text-2xl font-black">Security & Settings</h2><p className="text-sm text-muted">Manage access and preferences.</p></div></div>{setting('Change PIN', 'PIN management is coming later.', LockKeyhole)}{setting('Change Password', 'Contact support to update your password.', KeyRound, () => open('help'))}{setting('Two-Factor Authentication (2FA)', 'Add an extra layer of security.', ShieldCheck, () => open('help'))}{setting('Biometric Login', 'Use a passkey on your own device.', Fingerprint)}{setting('Notification Preferences', 'Choose which alerts you want to receive.', Bell, () => open('notifications'))}{setting('App Notifications', 'Receive account and loan alerts.', Bell, () => open('notifications'))}{setting('Language', 'More app languages are coming later.', Languages)}{setting('Privacy Policy', 'Review data and privacy information.', FileText, () => open('help'))}<details className="mt-4 border-t border-[#e0d2ea] pt-4"><summary className="cursor-pointer text-sm font-bold text-[#7100ad]">Manage passkeys and sessions</summary><div className="mt-3"><SecuritySettings /></div></details></>}
        {screen === 'linked' && <><h2 className="text-2xl font-black">Linked Accounts</h2>{setting('XTRA-CASH Wallet', formatZAR(me.walletBalanceCents), Wallet, () => router.push('/app/wallet'))}{setting('My Card', 'View your card details', CreditCard, () => router.push('/app/card'))}{setting('Bank account', 'Linking will be available after banking integration.', Landmark)}</>}
        {screen === 'notifications' && <><h2 className="text-2xl font-black">Notifications</h2><p className="mt-1 text-sm text-muted">Loan and account alerts remain available in your notification bell.</p>{setting('Offers and promotions', 'Receive product marketing updates', Bell, () => setPreferences(p => ({ ...p, marketing: !p.marketing })), <span role="switch" aria-checked={preferences.marketing} className={`h-6 w-11 rounded-full ${preferences.marketing ? 'bg-[#8b00d1]' : 'bg-[#d1c5da]'}`} />)}<Button className={`mt-5 w-full ${gradient}`} loading={busy} onClick={() => void savePreferences()}>Save preferences</Button></>}
        {screen === 'help' && <><h2 className="text-2xl font-black">Help & Support</h2><p className="mt-2 text-sm text-muted">For changes that need identity verification or for account access help, contact XTRA-CASH support through your existing support channel.</p></>}
        {screen === 'saved' && <div className="py-8 text-center"><span className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-green-100 text-green-700"><Check className="h-9 w-9" /></span><h2 className="mt-3 text-xl font-black">Profile updated</h2><p className="mt-1 text-sm text-muted">Your name has been saved.</p><Button className={`mt-4 ${gradient}`} onClick={() => open('overview')}>Back to profile</Button></div>}
        {screen === 'logout' && <div className="py-6 text-center"><LogOut className="mx-auto h-12 w-12 text-[#8100c2]"/><h2 className="mt-3 text-xl font-black">Log out of your account?</h2><div className="mt-5 flex justify-center gap-2"><Button variant="secondary" onClick={() => open('overview')}>Cancel</Button><Button className={gradient} onClick={async () => { await logout(); router.replace('/'); }}>Log out</Button></div></div>}
        {error && <Alert tone="red">{error}</Alert>}
      </div>
      {screen === 'documents' && <div className="mt-4 rounded-[22px] border border-white/75 bg-white/95 p-3 text-[#1b1030] shadow-lg"><div className="flex items-center gap-3"><Camera className="h-7 w-7 text-[#8900d1]" /><b className="flex-1 text-sm">Selfie</b><span className="rounded-full bg-[#eee5f4] px-3 py-1 text-xs">Available later</span></div><p className="mt-2 text-xs text-muted">Selfie capture will be requested when identity verification is enabled.</p></div>}
      {screen === 'overview' && <><div className="mt-4 rounded-[25px] border border-white/75 bg-white/95 p-4 text-[#1b1030] shadow-lg"><div className="flex items-center gap-2"><ShieldCheck className="h-7 w-7 text-[#8200ca]" /><b className="flex-1 text-sm">Profile {Math.round(completion / 6 * 100)}% complete</b><button type="button" onClick={() => open('documents')} className={`rounded-full px-3 py-2 text-xs font-bold ${gradient}`}>Complete profile</button></div><div className="mt-3 h-2 overflow-hidden rounded-full bg-[#e3d6ed]"><div className="h-full rounded-full bg-[#8e00d1]" style={{ width: `${completion / 6 * 100}%` }} /></div></div><div className="mt-4 grid grid-cols-2 gap-3">{tiles.map(tile => action(tile.label, tile.icon, tile.screen))}</div><button type="button" onClick={() => open('logout')} className="mt-4 flex min-h-16 w-full items-center gap-3 rounded-[22px] border border-white/75 bg-white/95 px-5 text-left font-bold text-[#1b1030] shadow-lg"><LogOut className="h-7 w-7 text-rose-600" /> Logout <ChevronRight className="ml-auto h-5 w-5" /></button></>}
      {screen !== 'overview' && <button type="button" onClick={() => open('overview')} className="mt-5 inline-flex items-center gap-1 text-sm font-bold text-white"><ArrowLeft className="h-4 w-4" /> Back to profile</button>}
    </div>
  </div>;
}
