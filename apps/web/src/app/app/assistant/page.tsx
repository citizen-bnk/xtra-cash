'use client';
import Link from 'next/link';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { ArrowLeft, CheckCheck, FileText, MapPin, MoreVertical, Paperclip, Plus, Send, X } from 'lucide-react';
import { Logo, useAuth } from '@xtra/ui';

type VaultType = 'BANK_STATEMENT' | 'ID_DOCUMENT' | 'PROOF_OF_INCOME' | 'PROOF_OF_ADDRESS';
type Entry = { id: string; role: 'assistant' | 'user'; text: string; at: string; fileName?: string; location?: string };
const documentTypes: { type: VaultType; label: string }[] = [
  { type: 'BANK_STATEMENT', label: 'Bank statements' },
  { type: 'ID_DOCUMENT', label: 'ID document' },
  { type: 'PROOF_OF_INCOME', label: 'Proof of income' },
  { type: 'PROOF_OF_ADDRESS', label: 'Proof of address' },
];
const entry = (role: Entry['role'], text: string, extra: Partial<Entry> = {}): Entry => ({ id: crypto.randomUUID(), role, text, at: new Date().toISOString(), ...extra });

export default function AssistantPage() {
  const { me, client } = useAuth();
  const [messages, setMessages] = useState<Entry[]>([]);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [attachmentsOpen, setAttachmentsOpen] = useState(false);
  const [optionsOpen, setOptionsOpen] = useState(false);
  const [error, setError] = useState('');
  const [ready, setReady] = useState(false);
  const bottom = useRef<HTMLDivElement>(null);
  const name = me?.firstName?.trim() || 'there';

  useEffect(() => {
    if (!me?.id) return;
    try {
      const saved = JSON.parse(sessionStorage.getItem(`xc-assistant-${me.id}`) || '[]') as Entry[];
      if (Array.isArray(saved) && saved.length) setMessages(saved.filter(m => m && (m.role === 'user' || m.role === 'assistant') && typeof m.text === 'string').slice(-40));
      else setMessages([entry('assistant', `Hi ${name}! 👋 How can I help you today?`)]);
    } catch { setMessages([entry('assistant', `Hi ${name}! 👋 How can I help you today?`)]); }
    setReady(true);
  }, [me?.id, name]);
  useEffect(() => { if (ready && me?.id) sessionStorage.setItem(`xc-assistant-${me.id}`, JSON.stringify(messages.slice(-40))); }, [messages, me?.id, ready]);
  useEffect(() => { bottom.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }); }, [messages, busy]);

  async function ask(text: string, extra: Partial<Entry> = {}) {
    const trimmed = text.trim();
    if (!trimmed || busy) return;
    const next = [...messages, entry('user', trimmed, extra)];
    setMessages(next);
    setDraft(''); setError(''); setBusy(true);
    try {
      const recent = next.slice(-16).map(({ role, text: content }) => ({ role, content }));
      const answer = await client.consumer.assistantReply(recent);
      setMessages(all => [...all, entry('assistant', answer.message)]);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'The assistant could not reply. Please try again.'); }
    finally { setBusy(false); }
  }
  function send(event: FormEvent) { event.preventDefault(); void ask(draft); }
  async function upload(type: VaultType, file?: File) {
    setAttachmentsOpen(false);
    if (!file) return;
    if (file.size > 10_000_000) { setError('Choose a file smaller than 10 MB.'); return; }
    setError(''); setBusy(true);
    try {
      await client.consumer.uploadVaultDocument(type, file);
      const label = documentTypes.find(item => item.type === type)?.label || 'document';
      setMessages(all => [...all, entry('user', `I uploaded ${label.toLowerCase()} to my secure profile vault.`, { fileName: file.name }), entry('assistant', 'Your file is in your profile vault. Processing can continue in the background; check My Documents for its status. You can keep chatting here.')]);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not upload the document.'); }
    finally { setBusy(false); }
  }
  function shareLocation() {
    setAttachmentsOpen(false); setError('');
    if (!navigator.geolocation) { setError('Location is not available on this device.'); return; }
    navigator.geolocation.getCurrentPosition(position => {
      const location = `${position.coords.latitude.toFixed(4)}, ${position.coords.longitude.toFixed(4)}`;
      setMessages(all => [...all, entry('user', 'I shared my current location once in this chat.', { location }), entry('assistant', 'Location received for this conversation. You can explore nearby stores from the app. This did not turn on background location monitoring.')]);
    }, () => setError('Location was not shared. Allow location access and try again if you want to.'), { enableHighAccuracy: false, timeout: 12000, maximumAge: 60000 });
  }
  function clearChat() { setMessages([entry('assistant', `Hi ${name}! 👋 How can I help you today?`)]); setOptionsOpen(false); }

  return <div className="flex h-[100dvh] flex-col bg-[#eae3f0] text-[#1b1030]">
    <header className="safe-pt z-10 shrink-0 bg-gradient-to-r from-[#1b1030] via-[#5c2394] to-[#8c24a3] text-white shadow-md">
      <div className="mx-auto flex h-16 max-w-[760px] items-center gap-3 px-3">
        <Link href="/app" aria-label="Back to Home" className="grid h-10 w-8 place-items-center"><ArrowLeft className="h-6 w-6" /></Link>
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full border-2 border-white/80 bg-gradient-to-br from-[#5c2394] to-[#d91f63]"><Logo light markOnly size={32} /></span>
        <div className="min-w-0 flex-1"><h1 className="truncate text-base font-bold text-white">XTRA-CASH Assistant</h1><p className="flex items-center gap-1 text-xs text-white/80"><span className="h-2 w-2 rounded-full bg-[#4ade80]" /> Here to help</p></div>
        <button type="button" aria-label="Conversation options" aria-expanded={optionsOpen} onClick={() => setOptionsOpen(!optionsOpen)} className="grid h-10 w-10 place-items-center rounded-full hover:bg-white/10"><MoreVertical className="h-5 w-5" /></button>
      </div>
      {optionsOpen && <div className="absolute right-3 top-14 z-20 rounded-xl bg-white p-1 text-[#1b1030] shadow-xl"><button type="button" onClick={clearChat} className="block rounded-lg px-4 py-2 text-sm hover:bg-[#f3e7f8]">Clear this chat</button><Link href="/app/profile" className="block rounded-lg px-4 py-2 text-sm hover:bg-[#f3e7f8]">My profile</Link></div>}
    </header>
    <div role="log" aria-label="Assistant conversation" aria-live="polite" className="min-h-0 flex-1 overflow-y-auto bg-[radial-gradient(circle_at_1px_1px,rgba(92,35,148,.07)_1px,transparent_0)] bg-[length:24px_24px]">
      <div className="mx-auto flex min-h-full max-w-[760px] flex-col gap-3 px-3 py-5 sm:px-5">
        {messages.map(message => <div key={message.id} className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}><div className={`max-w-[86%] rounded-2xl px-3.5 py-2.5 shadow-sm sm:max-w-[72%] ${message.role === 'user' ? 'rounded-br-sm bg-[#e7d2f6]' : 'rounded-bl-sm bg-white'}`}><p className="whitespace-pre-wrap break-words text-sm leading-relaxed">{message.text}</p>{message.fileName && <p className="mt-2 flex items-center gap-1 rounded-lg bg-white/70 px-2 py-1 text-xs"><FileText className="h-4 w-4" /> <span className="truncate">{message.fileName}</span></p>}{message.location && <p className="mt-2 flex items-center gap-1 rounded-lg bg-white/70 px-2 py-1 text-xs"><MapPin className="h-4 w-4" /> {message.location}</p>}<p className="mt-1 flex items-center justify-end gap-1 text-[10px] text-[#6b6180]">{new Date(message.at).toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit' })}{message.role === 'user' && <CheckCheck className="h-3.5 w-3.5 text-[#5c2394]" />}</p></div></div>)}
        {busy && <div className="self-start rounded-2xl rounded-bl-sm bg-white px-4 py-2 text-sm text-[#6b6180] shadow-sm" aria-label="Assistant is responding">● ● ●</div>}
        <div ref={bottom} />
      </div>
    </div>
    <div className="safe-pb relative shrink-0 border-t border-[#d8cbe2] bg-[#f5f0f8] px-3 py-2 shadow-[0_-4px_20px_rgba(27,16,48,.1)]">
      <div className="mx-auto max-w-[760px]">
        {error && <div role="alert" className="mb-2 flex items-start justify-between gap-2 rounded-xl bg-red-50 px-3 py-2 text-xs text-red-700">{error}<button type="button" aria-label="Dismiss error" onClick={() => setError('')}><X className="h-4 w-4" /></button></div>}
        {attachmentsOpen && <div className="absolute bottom-[calc(100%+8px)] left-3 right-3 mx-auto max-w-[740px] rounded-2xl border border-[#e0d1eb] bg-white p-3 shadow-2xl"><div className="mb-2 flex items-center justify-between"><p className="text-sm font-bold">Add to chat</p><button type="button" aria-label="Close attachments" onClick={() => setAttachmentsOpen(false)}><X className="h-5 w-5" /></button></div><div className="grid grid-cols-2 gap-2">{documentTypes.map(item => <label key={item.type} className="flex min-h-12 cursor-pointer items-center gap-2 rounded-xl bg-[#f7f0fb] px-3 text-xs font-semibold text-[#5c2394]"><Paperclip className="h-4 w-4" />{item.label}<input type="file" accept="application/pdf,image/jpeg,image/png" className="sr-only" disabled={busy} onChange={event => { void upload(item.type, event.target.files?.[0]); event.currentTarget.value = ''; }} /></label>)}<button type="button" onClick={shareLocation} className="col-span-2 flex min-h-12 items-center gap-2 rounded-xl bg-[#f7f0fb] px-3 text-left text-xs font-semibold text-[#5c2394]"><MapPin className="h-4 w-4" /> Share location once</button></div><p className="mt-2 text-[11px] text-[#6b6180]">Files save to your profile vault. Location stays in this chat.</p></div>}
        <form onSubmit={send} className="flex items-end gap-2"><button type="button" aria-label="Add attachment or location" aria-expanded={attachmentsOpen} onClick={() => setAttachmentsOpen(!attachmentsOpen)} className="mb-0.5 grid h-10 w-10 shrink-0 place-items-center rounded-full bg-white text-[#5c2394] shadow-sm"><Plus className="h-6 w-6" /></button><textarea value={draft} onChange={event => setDraft(event.target.value.slice(0, 1200))} onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); void ask(draft); } }} rows={1} aria-label="Message XTRA-CASH Assistant" placeholder="Message XTRA-CASH…" className="max-h-28 min-h-11 min-w-0 flex-1 resize-none rounded-[22px] border border-[#e0d1eb] bg-white px-4 py-3 text-sm outline-none focus:border-[#8c00cf]" /><button type="submit" aria-label="Send message" disabled={!draft.trim() || busy} className="mb-0.5 grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[#5c2394] text-white disabled:opacity-50"><Send className="h-5 w-5" /></button></form>
      </div>
    </div>
  </div>;
}
