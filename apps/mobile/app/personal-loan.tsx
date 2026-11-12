import { useEffect, useRef, useState } from 'react';
import { Modal, Pressable, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { formatZAR, type PersonalSettlement } from '@xtra/shared';
import { errorMessage, useAuth } from '../src/auth';
import { Button, Card, ErrorText, Field, H1, H2, Muted, Notice, Screen, Status, toCents } from '../src/ui';
import { colors } from '../src/theme';

type Pillar = 'ID' | 'RISK' | 'INCOME' | 'FRAUD';
type Response = { pillar: Pillar; disposition: 'CONFIRMED' | 'ANSWERED' | 'SKIPPED'; answer?: string };
type CheckStep = { pillar: Pillar; status: string; prompt: string; reason: string };
type Check = { id: string; steps: CheckStep[]; result?: { steps: CheckStep[] } };
const PILLARS: Pillar[] = ['ID', 'RISK', 'INCOME', 'FRAUD'];

export default function PersonalLoan() {
  const { applicationId, amountCents: presetAmountCents, termMonths: presetTermMonths } = useLocalSearchParams<{ applicationId?: string; amountCents?: string; termMonths?: string }>();
  const { client } = useAuth();
  const [amount, setAmount] = useState(() => presetAmountCents && Number.isFinite(Number(presetAmountCents)) ? (Number(presetAmountCents) / 100).toFixed(2) : '3000');
  const [term, setTerm] = useState(() => [3, 6, 9, 12, 18, 24].includes(Number(presetTermMonths)) ? Number(presetTermMonths) : 6);
  const [check, setCheck] = useState<Check | null>(null);
  const [step, setStep] = useState(0);
  const [responses, setResponses] = useState<Response[]>([]);
  const [answer, setAnswer] = useState('');
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const key = useRef(`native-loan-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  const amountCents = toCents(amount);
  const steps = check?.result?.steps ?? check?.steps ?? [];

  const validate = async () => {
    if (amountCents == null || amountCents < 50_000) { setError('Enter at least R500.'); return; }
    setBusy(true); setError('');
    try {
      setCheck(await client.request<Check>('POST', '/personal-loans/vault/application-validations', { amountCents, termMonths: term }));
    } catch (e) { setError(errorMessage(e)); }
    finally { setBusy(false); }
  };

  const answerPillar = (disposition: Response['disposition']) => {
    const current = steps[step];
    if (!current) return;
    if (disposition === 'ANSWERED' && answer.trim().length < 3) { setError('Add a short clarification or choose Skip for now.'); return; }
    setResponses((existing) => [...existing.filter((item) => item.pillar !== current.pillar), { pillar: current.pillar, disposition, ...(answer.trim() ? { answer: answer.trim() } : {}) }]);
    setAnswer(''); setError(''); setStep((index) => index + 1);
  };

  const submit = async () => {
    if (!check || !amountCents || !consent || responses.length !== 4) return;
    setBusy(true); setError('');
    try {
      await client.request('PUT', `/personal-loans/vault/application-validations/${check.id}`, { responses });
      await client.request('POST', '/personal-loans/applications', { amountCents, termMonths: term, consent: true, routingConsent: true, idempotencyKey: key.current, vaultValidationId: check.id });
      router.replace('/(tabs)/loans');
    } catch (e) { setError(errorMessage(e)); }
    finally { setBusy(false); }
  };

  if (applicationId) return <ApplicationStatus applicationId={applicationId} />;

  return (
    <Screen>
      {!check ? <>
        <View style={{ gap: 6 }}><Muted style={{ color: colors.brandDark, fontSize: 12, fontWeight: '800', letterSpacing: 1 }}>PERSONAL LOAN</Muted><H1>How much do you need?</H1><Muted>We’ll check the information already in your profile and only ask about gaps.</Muted></View>
        <Field label="Amount (R)" keyboardType="decimal-pad" value={amount} onChangeText={setAmount} />
        <H2>Repayment period</H2>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>{[3, 6, 9, 12, 18, 24].map((months) => <Pressable key={months} accessibilityRole="button" accessibilityState={{ selected: term === months }} onPress={() => setTerm(months)} style={{ paddingHorizontal: 14, minHeight: 44, justifyContent: 'center', borderRadius: 22, borderWidth: 1, borderColor: term === months ? colors.purple : colors.line, backgroundColor: term === months ? '#f5effa' : colors.white }}><Text style={{ color: colors.ink, fontWeight: '700' }}>{months} months</Text></Pressable>)}</View>
        <Card><View style={{ flexDirection: 'row', justifyContent: 'space-between' }}><Muted>Request</Muted><Text style={{ color: colors.ink, fontWeight: '800' }}>{formatZAR(amountCents ?? 0)}</Text></View><View style={{ flexDirection: 'row', justifyContent: 'space-between' }}><Muted>Term</Muted><Text style={{ color: colors.ink, fontWeight: '800' }}>{term} months</Text></View></Card>
        {error ? <ErrorText>{error}</ErrorText> : null}
        <Button title="Check my profile" loading={busy} disabled={!amountCents} onPress={() => { void validate(); }} />
      </> : step < steps.length ? <>
        <View style={{ gap: 6 }}><Muted style={{ color: colors.brandDark, fontSize: 12, fontWeight: '800', letterSpacing: 1 }}>PROFILE CHECK · {step + 1} OF {steps.length}</Muted><H1>{steps[step].pillar}</H1><Muted>{steps[step].reason}</Muted></View>
        <View style={{ flexDirection: 'row', gap: 5 }}>{steps.map((item, index) => <View key={item.pillar} style={{ flex: 1, height: 4, borderRadius: 99, backgroundColor: index <= step ? colors.brand : colors.line }} />)}</View>
        <Card><Text style={{ color: colors.ink, fontWeight: '700', lineHeight: 22 }}>{steps[step].prompt}</Text><View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 }}><Muted>Current check</Muted><Status status={steps[step].status} /></View></Card>
        <Field label="Clarification (optional)" multiline numberOfLines={4} textAlignVertical="top" maxLength={1000} value={answer} onChangeText={setAnswer} hint="You can skip this and leave it pending for lender review." />
        {error ? <ErrorText>{error}</ErrorText> : null}
        <Button title={answer.trim() ? 'Save and continue' : 'Confirm and continue'} onPress={() => answerPillar(answer.trim() ? 'ANSWERED' : 'CONFIRMED')} />
        <Button title="Skip · mark pending" variant="secondary" onPress={() => answerPillar('SKIPPED')} />
        {step > 0 ? <Button title="Back" variant="secondary" onPress={() => { setStep((index) => index - 1); setAnswer(''); setError(''); }} /> : null}
      </> : <>
        <View style={{ gap: 6 }}><Muted style={{ color: colors.brandDark, fontSize: 12, fontWeight: '800', letterSpacing: 1 }}>READY TO SUBMIT</Muted><H1>Review your request</H1><Muted>Skipped checks remain pending for lender review.</Muted></View>
        <Card><View style={{ flexDirection: 'row', justifyContent: 'space-between' }}><Muted>Amount</Muted><Text style={{ color: colors.ink, fontWeight: '800' }}>{formatZAR(amountCents ?? 0)}</Text></View><View style={{ flexDirection: 'row', justifyContent: 'space-between' }}><Muted>Period</Muted><Text style={{ color: colors.ink, fontWeight: '800' }}>{term} months</Text></View>{responses.map((item) => <View key={item.pillar} style={{ paddingTop: 8, flexDirection: 'row', justifyContent: 'space-between', borderTopWidth: 1, borderColor: colors.line }}><Text style={{ color: colors.ink }}>{item.pillar}</Text><Status status={item.disposition === 'SKIPPED' ? 'PENDING' : item.disposition} /></View>)}</Card>
        <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: consent }} onPress={() => setConsent((value) => !value)} style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12, padding: 14, borderRadius: 14, borderWidth: 2, borderColor: consent ? colors.purple : '#756487', backgroundColor: consent ? '#f5effa' : colors.white }}>
          <View style={{ width: 24, height: 24, borderRadius: 6, borderWidth: 2, borderColor: consent ? colors.purple : '#59446e', backgroundColor: consent ? colors.purple : colors.white, alignItems: 'center', justifyContent: 'center' }}>{consent ? <Text style={{ color: colors.white, fontWeight: '900' }}>✓</Text> : null}</View>
          <Text style={{ flex: 1, color: colors.ink, fontSize: 14, lineHeight: 20 }}>I confirm this request is accurate and consent to XTRA-CASH sharing my application with active accredited lenders so they may consider an offer.</Text>
        </Pressable>
        <Notice title="Submitting is not accepting a loan">A lender makes any offer. You decide whether to accept and sign it.</Notice>
        {error ? <ErrorText>{error}</ErrorText> : null}
        <Button title="Submit loan request" loading={busy} disabled={!consent} onPress={() => { void submit(); }} />
        <Button title="Review checks" variant="secondary" onPress={() => { setStep(Math.max(0, steps.length - 1)); }} />
      </>}
    </Screen>
  );
}

function ApplicationStatus({ applicationId }: { applicationId: string }) {
  const { client } = useAuth();
  const [application, setApplication] = useState<PersonalSettlement | null>(null);
  const [error, setError] = useState(''), [loading, setLoading] = useState(true), [refreshing, setRefreshing] = useState(false);
  const [acceptOpen, setAcceptOpen] = useState(false), [acknowledged, setAcknowledged] = useState(false), [password, setPassword] = useState(''), [busy, setBusy] = useState(false);
  const [replyOpen, setReplyOpen] = useState(false), [reply, setReply] = useState('');
  const load = async (quiet = false) => {
    if (quiet) setRefreshing(true); else setLoading(true);
    setError('');
    try { setApplication(await client.request<PersonalSettlement>('GET', `/personal-loans/applications/${encodeURIComponent(applicationId)}`)); }
    catch (e) { setError(errorMessage(e)); }
    finally { setLoading(false); setRefreshing(false); }
  };
  useEffect(() => { void load(); }, [applicationId]);
  async function accept() {
    if (!application?.agreement || !acknowledged || !password) return;
    setBusy(true); setError('');
    try { await client.request('POST', `/personal-loans/applications/${applicationId}/accept`, { digest: application.agreement.digest, acknowledged: true, password }); setAcceptOpen(false); setPassword(''); await load(true); }
    catch (e) { setError(errorMessage(e)); }
    finally { setBusy(false); }
  }
  async function respond() {
    if (reply.trim().length < 3) return;
    setBusy(true); setError('');
    try { await client.request('POST', `/personal-loans/applications/${applicationId}/respond`, { message: reply.trim() }); setReplyOpen(false); setReply(''); await load(true); }
    catch (e) { setError(errorMessage(e)); }
    finally { setBusy(false); }
  }
  if (loading && !application) return <Screen><Muted>Loading your request…</Muted></Screen>;
  if (!application) return <Screen><ErrorText>{error || 'Could not load this application.'}</ErrorText><Button title="Try again" variant="secondary" onPress={() => { void load(); }} /><Button title="Back to loans" onPress={() => router.replace('/(tabs)/loans')} /></Screen>;
  const { agreement, application: request } = application;
  return <>
    <Screen refreshing={refreshing} onRefresh={() => { void load(true); }}>
      <View style={{ gap: 4 }}><Muted style={{ color: colors.brandDark, fontWeight: '800', fontSize: 12, letterSpacing: 1 }}>LOAN REQUEST</Muted><H1>{formatZAR(request.amountCents)} · {request.termMonths} months</H1><Status status={request.status} /></View>
      <Card><Text style={{ color: colors.ink, fontWeight: '800' }}>Next step</Text><Muted style={{ lineHeight: 20 }}>{request.reviewNotes || nextStep(request.status, agreement?.acceptedAt)}</Muted></Card>
      {error ? <ErrorText>{error}</ErrorText> : null}

      {request.status === 'ACTION_REQUIRED' ? <Button title="Reply to lender" onPress={() => setReplyOpen(true)} /> : null}
      {agreement ? <Card>
        <Text style={{ color: colors.ink, fontSize: 17, fontWeight: '800' }}>{agreement.acceptedAt ? 'Loan agreement' : 'Your loan offer'}</Text>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}><Muted>Amount offered</Muted><Text style={{ color: colors.ink, fontWeight: '800' }}>{formatZAR(agreement.terms.principalCents)}</Text></View>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}><Muted>Monthly instalment</Muted><Text style={{ color: colors.ink, fontWeight: '800' }}>{formatZAR(agreement.terms.monthlyInstallmentCents)}</Text></View>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}><Muted>Total repayment</Muted><Text style={{ color: colors.ink, fontWeight: '800' }}>{formatZAR(agreement.terms.totalRepayableCents)}</Text></View>
        <Muted>Offer expires {new Date(agreement.expiresAt).toLocaleString('en-ZA')}</Muted>
        <Notice title="Read the agreement before accepting">Accepting requires your account password and confirms these specific terms.</Notice>
        {!agreement.acceptedAt && request.status === 'OFFERED' ? <Button title="Review and accept offer" onPress={() => setAcceptOpen(true)} disabled={!application.configuration.agreementsEnabled || new Date(agreement.expiresAt).getTime() <= Date.now()} /> : null}
        {!application.configuration.agreementsEnabled && !agreement.acceptedAt ? <Muted style={{ fontSize: 12 }}>Agreement acceptance is not available until lender and legal activation is complete.</Muted> : null}
        <View style={{ maxHeight: 280, borderRadius: 12, borderWidth: 1, borderColor: colors.line, padding: 12 }}><Text style={{ color: colors.muted, fontSize: 12, lineHeight: 18 }}>{agreement.content}</Text></View>
      </Card> : null}

      {application.documents.length ? <Card><Text style={{ color: colors.ink, fontWeight: '800' }}>Documents for this request</Text><Muted>These documents are stored in your profile vault.</Muted>{application.documents.map((doc) => <View key={doc.id} style={{ borderTopWidth: 1, borderColor: colors.line, paddingTop: 10, gap: 5 }}><Text style={{ color: colors.ink, fontWeight: '700' }}>{doc.originalName}</Text><Muted style={{ fontSize: 12 }}>{doc.type.replaceAll('_', ' ')} · {new Date(doc.createdAt).toLocaleDateString('en-ZA')}</Muted><Status status={doc.status} />{doc.processingNote ? <Muted style={{ fontSize: 12 }}>{doc.processingNote}</Muted> : null}{doc.reviews.map((review, index) => <Muted key={`${doc.id}-${index}`} style={{ fontSize: 12 }}>{review.status}: {review.comment}</Muted>)}</View>)}</Card> : null}

      {application.depositReference ? <Card><Text style={{ color: colors.ink, fontWeight: '800' }}>Funding reference</Text><Text selectable style={{ color: colors.brandDark, fontSize: 18, fontWeight: '900' }}>{application.depositReference}</Text><Muted>Funding is confirmed separately before your wallet balance changes.</Muted></Card> : null}
      {application.externalPayment ? <Card style={{ backgroundColor: '#effaf5', borderColor: '#b8e3ce' }}><Text style={{ color: colors.ink, fontWeight: '800' }}>Funds added to your wallet</Text><Text style={{ color: colors.ink, fontSize: 18, fontWeight: '900' }}>{formatZAR(application.externalPayment.amountCents)}</Text><Muted>{application.externalPayment.note}</Muted><Button title="View wallet" variant="secondary" onPress={() => router.push('/(tabs)')} /></Card> : null}

      {application.timeline.length ? <Card><Text style={{ color: colors.ink, fontWeight: '800' }}>Progress</Text>{application.timeline.map((event) => <View key={event.id} style={{ borderLeftWidth: 2, borderColor: colors.brand, paddingLeft: 10, paddingVertical: 5, gap: 2 }}><Muted style={{ fontSize: 11 }}>{new Date(event.createdAt).toLocaleString('en-ZA')}</Muted><Text style={{ color: colors.ink, fontWeight: '700' }}>{event.status.replaceAll('_', ' ')}</Text><Muted style={{ fontSize: 12 }}>{event.message}</Muted></View>)}</Card> : null}
      <Button title="Back to loans" variant="secondary" onPress={() => router.replace('/(tabs)/loans')} />
    </Screen>

    <Modal visible={acceptOpen} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setAcceptOpen(false)}><Screen><H1>Accept this offer?</H1><Muted>Confirm you have read the agreement and want these terms.</Muted>{agreement ? <Card><Text style={{ color: colors.ink, fontWeight: '800' }}>{formatZAR(agreement.terms.principalCents)} · {agreement.terms.termMonths} months</Text><Text style={{ color: colors.ink }}>Total repayment {formatZAR(agreement.terms.totalRepayableCents)}</Text></Card> : null}<Pressable accessibilityRole="checkbox" accessibilityState={{ checked: acknowledged }} onPress={() => setAcknowledged((value) => !value)} style={{ flexDirection: 'row', gap: 12, alignItems: 'flex-start', padding: 14, borderRadius: 12, borderWidth: 2, borderColor: acknowledged ? colors.purple : '#756487', backgroundColor: acknowledged ? '#f5effa' : colors.white }}><Text style={{ color: colors.purple, fontWeight: '900', fontSize: 18 }}>{acknowledged ? '☑' : '□'}</Text><Text style={{ flex: 1, color: colors.ink, lineHeight: 20 }}>I have read the quotation and agreement and accept these specific terms.</Text></Pressable><Field label="Confirm your account password" secureTextEntry value={password} onChangeText={setPassword} autoComplete="current-password" /><ErrorText>{error}</ErrorText><Button title="Accept and sign agreement" loading={busy} disabled={!acknowledged || !password} onPress={() => { void accept(); }} /><Button title="Cancel" variant="secondary" onPress={() => setAcceptOpen(false)} /></Screen></Modal>
    <Modal visible={replyOpen} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setReplyOpen(false)}><Screen><H1>Reply to your lender</H1><Field label="Your response" multiline numberOfLines={5} textAlignVertical="top" value={reply} onChangeText={setReply} hint="For documents, upload them to your profile data vault." /><ErrorText>{error}</ErrorText><Button title="Send reply" loading={busy} disabled={reply.trim().length < 3} onPress={() => { void respond(); }} /><Button title="Cancel" variant="secondary" onPress={() => setReplyOpen(false)} /></Screen></Modal>
  </>;
}

function nextStep(status: string, acceptedAt?: string | null) {
  if (status === 'OFFERED') return 'A lender has made an offer. Review the repayment terms and agreement, then accept only if you agree.';
  if (status === 'ACCEPTED' || acceptedAt) return 'Your agreement is accepted. The lender must send the funds, then an administrator confirms receipt into your wallet.';
  if (status === 'FUNDING_PENDING') return 'Your agreement is accepted. Funding is being arranged.';
  if (status === 'DISBURSED') return 'Funds have been released. Review your wallet and repayment schedule.';
  if (status === 'DECLINED') return 'This request was declined. Review the lender’s note or contact support if you need help.';
  if (status === 'ACTION_REQUIRED') return 'The lender needs more information before continuing.';
  return 'Your request is with the lending team. We’ll notify you when there is an update.';
}
