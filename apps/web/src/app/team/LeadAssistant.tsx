'use client';
import { useEffect, useRef, useState } from 'react';
import { useAuth } from '@xtra/ui';

export type LeadDraft = { legalName: string; registrationNumber: string; contactName: string; contactChannel: string; address: string; headcount: string; permissionReference: string; nextAction: string; followUpAt: string };
type Suggestion = { field: keyof LeadDraft; value: string; sourceQuote: string };
type Reply = { message: string; values: Suggestion[]; meetingNotes: string[]; contractFacts: string[] };
type Meeting = { id: string; sha256: string; transcript: string | null; transcriptionStatus: string; message: string };

export default function LeadAssistant({ onApply, onMeeting, onNotes, onBusy }: { onApply: (values: Partial<LeadDraft>) => void; onMeeting: (id: string) => void; onNotes: (notes: string) => void; onBusy: (busy: boolean) => void }) {
  const { client } = useAuth();
  const [chat, setChat] = useState<{ role: 'employee' | 'assistant'; text: string }[]>([]);
  const [message, setMessage] = useState('');
  const [reply, setReply] = useState<Reply | null>(null);
  const [transcript, setTranscript] = useState('');
  const [meetingId, setMeetingId] = useState('');
  const [consent, setConsent] = useState(false);
  const [recording, setRecording] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const recorder = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const alive = useRef(false);
  const [starting, setStarting] = useState(false);
  const [reviewedNotes, setReviewedNotes] = useState('');
  const [status, setStatus] = useState('');

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      if (recorder.current?.state === 'recording') {
        recorder.current.onstop = null;
        recorder.current.stop();
      }
      streamRef.current?.getTracks().forEach(track => track.stop());
    };
  }, []);
  useEffect(() => {
    onBusy(busy || starting || recording);
    return () => onBusy(false);
  }, [busy, starting, recording, onBusy]);

  async function ask(text = message, source = transcript) {
    if (!text.trim() || busy) return;
    setBusy(true); setError('');
    try {
      const answer = await client.request<Reply>('POST', '/payday/lead-assistant', { message: text, history: chat.slice(-12), transcript: source || undefined });
      setChat(current => [...current, { role: 'employee' as const, text }, { role: 'assistant' as const, text: answer.message }].slice(-12));
      setReply(answer); setMessage('');
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'The assistant is unavailable. Enter the lead manually.'); }
    finally { setBusy(false); }
  }

  async function startRecording() {
    if (!consent) { setError('Confirm that everyone in the meeting agreed to recording.'); return; }
    setError('');
    setStarting(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (!alive.current) { stream.getTracks().forEach(track => track.stop()); return; }
      streamRef.current = stream;
      const options = ['audio/webm;codecs=opus','audio/mp4','audio/webm'].find(type => MediaRecorder.isTypeSupported(type));
      const next = new MediaRecorder(stream, options ? { mimeType: options } : undefined);
      chunks.current = [];
      next.ondataavailable = event => { if (event.data.size) chunks.current.push(event.data); };
      next.onstop = () => { stream.getTracks().forEach(track => track.stop()); void saveRecording(next.mimeType); };
      next.start(); recorder.current = next; setRecording(true);
    } catch {
      streamRef.current?.getTracks().forEach(track => track.stop());
      setError('Microphone access is unavailable. You can type meeting notes instead.');
    } finally { setStarting(false); }
  }

  async function saveRecording(mimeType: string) {
    setBusy(true);
    setError('');
    setStatus('');
    try {
      const blob = new Blob(chunks.current, { type: mimeType });
      if (blob.size > 4 * 1024 * 1024) throw new Error('This recording exceeds 4 MB. Record a shorter segment or type meeting notes.');
      const form = new FormData();
      form.append('file', blob, mimeType.includes('mp4') ? 'meeting.mp4' : 'meeting.webm');
      form.append('consentDeclaration', 'I confirmed all participants consented to recording this meeting.');
      const result = await client.request<Meeting>('POST', '/payday/lead-assistant/record', form);
      setMeetingId(result.id); onMeeting(result.id);
      if (result.transcript) { setTranscript(result.transcript); setStatus('Recording transcribed. Prepare notes below or enter your own.'); }
      else setStatus(result.message);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Recording could not be saved.'); }
    finally { setBusy(false); }
  }

  return <section className="space-y-4 rounded-3xl border border-purple-200 bg-[#fbf7ff] p-5"><div><h3 className="text-lg font-bold">Lead assistant</h3><p className="text-sm text-slate-600">Tell the assistant about the business or record an agreed meeting. Review every suggested detail before saving.</p></div><div className="max-h-52 space-y-2 overflow-auto" aria-live="polite">{chat.map((entry, index) => <p key={index} className={`rounded-xl p-3 text-sm ${entry.role === 'employee' ? 'bg-purple-100' : 'bg-white'}`}>{entry.text}</p>)}</div><form className="flex gap-2" onSubmit={event => { event.preventDefault(); void ask(); }}><input aria-label="Message the lead assistant" className="min-w-0 flex-1 rounded-xl border p-3" value={message} maxLength={4000} onChange={event => setMessage(event.target.value)} placeholder="What did the business tell you?" /><button type="submit" disabled={busy || !message.trim()} className="rounded-xl bg-purple-700 px-4 text-white disabled:opacity-50">Send</button></form><div className="space-y-3 border-t pt-4"><label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={consent} onChange={event => setConsent(event.target.checked)} /><span>I confirmed everyone in this meeting agreed to audio recording.</span></label><button type="button" disabled={busy || starting || !!meetingId || (!recording && !consent)} className="rounded-xl border border-purple-700 px-4 py-2 font-semibold text-purple-700 disabled:opacity-50" onClick={() => recording ? (setBusy(true), recorder.current?.stop(), setRecording(false)) : void startRecording()}>{recording ? 'Stop and save recording' : 'Record meeting'}</button>{meetingId && <p className="text-xs text-slate-600">Recording saved as evidence {meetingId.slice(0, 8)}. A recording is not a signed agreement.</p>}<label className="block text-sm">Meeting transcript or notes<textarea className="mt-1 w-full rounded-xl border p-3" rows={4} maxLength={20000} value={transcript} onChange={event => setTranscript(event.target.value)} placeholder="Review the transcript or type meeting notes here" /></label><button type="button" disabled={busy || !transcript.trim()} className="rounded-xl border px-4 py-2 text-sm disabled:opacity-50" onClick={() => void ask('Prepare lead details and meeting minutes from these notes.')}>Prepare from notes</button></div>{reply && <div className="space-y-3 border-t pt-4"><p className="text-sm">{reply.message}</p>{reply.values.map(value => <p key={value.field} className="rounded-xl bg-white p-3 text-sm"><strong>{value.field}:</strong> {value.value}<small className="block text-slate-500">Source: “{value.sourceQuote}”</small></p>)}{reply.values.length > 0 && <button type="button" className="rounded-xl bg-purple-700 px-4 py-2 font-semibold text-white" onClick={() => onApply(Object.fromEntries(reply.values.map(value => [value.field, value.value])) as Partial<LeadDraft>)}>Use suggested details</button>}{reply.meetingNotes.length > 0 && <div><strong>Meeting minutes to review</strong><ul className="list-inside list-disc text-sm">{reply.meetingNotes.map((note, index) => <li key={index}>{note}</li>)}</ul></div>}{reply.contractFacts.length > 0 && <div><strong>Facts for contract preparation</strong><ul className="list-inside list-disc text-sm">{reply.contractFacts.map((fact, index) => <li key={index}>{fact}</li>)}</ul><p className="text-xs text-slate-500">Legal terms and signatures still need human review.</p></div>}</div>}{reply && (reply.meetingNotes.length > 0 || reply.contractFacts.length > 0) && <button type="button" className="rounded-xl border border-purple-700 px-4 py-2 text-sm text-purple-700" onClick={() => {
    const notes = [...reply.meetingNotes, ...(reply.contractFacts.length ? ['', 'Facts for contract preparation', ...reply.contractFacts] : [])].join('\n').slice(0, 6000);
    setReviewedNotes(notes);
    onNotes(notes);
  }}>Use these notes</button>}<label className="block text-sm font-medium">Notes to save with the lead<textarea className="mt-1 w-full rounded-xl border p-3 font-normal" rows={3} maxLength={6000} value={reviewedNotes} onChange={event => { setReviewedNotes(event.target.value); onNotes(event.target.value); }} /></label>{status && <p role="status" className="text-sm text-slate-600">{status}</p>}{error && <p role="alert" className="rounded-xl bg-amber-50 p-3 text-sm">{error}</p>}</section>;
}
