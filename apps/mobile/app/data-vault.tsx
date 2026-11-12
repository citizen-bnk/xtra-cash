import { useCallback, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import { useFocusEffect } from 'expo-router';
import type { ApplicantVaultStatus } from '@xtra/shared';
import { errorMessage, useApi, useAuth } from '../src/auth';
import { Button, Card, H1, Loading, Muted, Notice, Screen, Status } from '../src/ui';
import { colors } from '../src/theme';

type VaultType = 'ID_DOCUMENT' | 'PROOF_OF_ADDRESS' | 'BANK_STATEMENT' | 'PROOF_OF_INCOME';
const ITEMS: { type: VaultType; key: string; title: string; detail: string }[] = [
  { type: 'ID_DOCUMENT', key: 'identity', title: 'Identity document', detail: 'South African ID or passport' },
  { type: 'PROOF_OF_ADDRESS', key: 'address', title: 'Proof of address', detail: 'Utility, municipal or official statement' },
  { type: 'BANK_STATEMENT', key: 'bank', title: 'Bank statements', detail: 'Upload statements; no date range entry is needed' },
  { type: 'PROOF_OF_INCOME', key: 'income', title: 'Proof of income', detail: 'Payslip or other income evidence' },
];

export default function DataVault() {
  const { client } = useAuth();
  const vault = useApi((c) => c.consumer.applicantVault());
  const [busy, setBusy] = useState<VaultType | null>(null);
  const [error, setError] = useState('');
  useFocusEffect(useCallback(() => { void vault.reload(); }, [vault.reload]));

  const pick = async (type: VaultType) => {
    setError('');
    const result = await DocumentPicker.getDocumentAsync({ type: ['application/pdf', 'image/jpeg', 'image/png'], copyToCacheDirectory: true, multiple: false });
    if (result.canceled || !result.assets[0]) return;
    const file = result.assets[0];
    setBusy(type);
    try {
      const body = new FormData();
      body.append('type', type);
      body.append('consent', 'true');
      body.append('file', { uri: file.uri, name: file.name, type: file.mimeType || 'application/octet-stream' } as any);
      await client.request<ApplicantVaultStatus>('POST', '/personal-loans/vault/documents', body);
      await vault.reload();
    } catch (e) { setError(errorMessage(e)); }
    finally { setBusy(null); }
  };

  if (!vault.data) return <Loading />;
  const data = vault.data;
  return (
    <Screen refreshing={vault.loading} onRefresh={() => { void vault.reload(); }}>
      <View style={{ gap: 5 }}>
        <Muted style={{ color: colors.brandDark, fontSize: 12, fontWeight: '800', letterSpacing: 1 }}>YOUR PROFILE</Muted>
        <H1>Personal data vault</H1>
        <Muted>Keep your details and evidence ready for services that need them.</Muted>
      </View>

      <Card style={{ backgroundColor: data.eligible ? '#effaf5' : '#fff8e8', borderColor: data.eligible ? '#b8e3ce' : '#f0d797' }}>
        <Text style={{ color: colors.ink, fontWeight: '800', fontSize: 16 }}>{data.eligible ? 'Ready to start a loan request' : `${data.probation.daysRemaining} days left in your profile period`}</Text>
        <Muted style={{ lineHeight: 19 }}>{data.eligible ? 'You can begin an application. Lenders will still review your information and make their own decision.' : 'You may complete the evidence checklist to request access sooner. Submitting documents does not guarantee approval.'}</Muted>
      </Card>

      <Text style={{ color: colors.ink, fontSize: 18, fontWeight: '800' }}>Profile checks</Text>
      <View style={{ gap: 8 }}>
        {[
          ['ID', data.pillars.id.status, data.pillars.id.confidenceBps],
          ['Risk', data.pillars.risk.status, data.pillars.risk.confidenceBps],
          ['Income', data.pillars.income.status, data.pillars.income.confidenceBps],
          ['Fraud', data.pillars.fraud.status, data.pillars.fraud.homeBase.confidenceBps],
        ].map(([name, state, confidence]) => <Card key={String(name)} style={{ paddingVertical: 11 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
            <Text style={{ color: colors.ink, fontWeight: '700', flex: 1 }}>{name}</Text><Status status={String(state)} />
          </View>
          <View style={{ height: 3, borderRadius: 99, backgroundColor: colors.line, overflow: 'hidden', marginTop: 7 }}><View style={{ width: `${Math.max(0, Math.min(100, Number(confidence) / 100))}%`, height: '100%', backgroundColor: colors.brand }} /></View>
        </Card>)}
      </View>

      <Text style={{ color: colors.ink, fontSize: 18, fontWeight: '800' }}>Evidence in your vault</Text>
      <View style={{ gap: 9 }}>
        {ITEMS.map((item) => {
          const requirement = data.fastTrack.required.find((entry) => entry.key === item.key);
          const document = data.documents.find((entry) => entry.type === item.type);
          return <Card key={item.type}>
            <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
              <View style={{ flex: 1, gap: 3 }}><Text style={{ color: colors.ink, fontWeight: '800' }}>{item.title}</Text><Muted style={{ fontSize: 12 }}>{document?.originalName ?? item.detail}</Muted></View>
              <Status status={requirement?.status ?? 'MISSING'} />
            </View>
            {document?.processingNote ? <Muted style={{ fontSize: 12 }}>{document.processingNote}</Muted> : null}
            <Button title={busy === item.type ? 'Uploading…' : document ? 'Replace document' : 'Add document'} variant="secondary" loading={busy === item.type} disabled={!!busy} onPress={() => { void pick(item.type); }} />
          </Card>;
        })}
      </View>
      <Notice title="Processing happens in the background">You can continue using XTRA-CASH while a document is being checked. We’ll show the result here when processing finishes.</Notice>
      {error ? <Notice title="Could not add this document" tone="red">{error}</Notice> : null}
      <Text style={{ color: colors.ink, fontSize: 18, fontWeight: '800' }}>All uploaded documents</Text>
      {data.documents.length ? data.documents.map((document) => <Card key={document.id} style={{ gap: 7 }}>
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
          <View style={{ flex: 1, gap: 3 }}>
            <Text style={{ color: colors.ink, fontWeight: '800' }}>{document.originalName}</Text>
            <Muted style={{ fontSize: 12 }}>{document.type.replaceAll('_', ' ')} · uploaded {new Date(document.createdAt).toLocaleDateString('en-ZA')}</Muted>
          </View>
          <Status status={document.status} />
        </View>
        {document.processingNote ? <Notice title="Processing update" tone={document.status === 'REJECTED' ? 'red' : 'blue'}>{document.processingNote}</Notice> : null}
      </Card>) : <Card><Muted>No files uploaded yet. Add evidence above to build your profile vault.</Muted></Card>}
      <Pressable accessibilityRole="button" onPress={() => void vault.reload()} style={{ padding: 8, alignItems: 'center' }}><Text style={{ color: colors.brandDark, fontWeight: '700' }}>Refresh profile status</Text></Pressable>
    </Screen>
  );
}
