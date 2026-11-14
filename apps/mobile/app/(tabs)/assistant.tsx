import { useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import * as DocumentPicker from 'expo-document-picker';
import * as Location from 'expo-location';
import type { ApplicantVaultStatus } from '@xtra/shared';
import { errorMessage, useAuth } from '../../src/auth';
import { colors } from '../../src/theme';

type VaultType = 'BANK_STATEMENT' | 'ID_DOCUMENT' | 'PROOF_OF_INCOME' | 'PROOF_OF_ADDRESS';
type Message = { id: string; role: 'user' | 'assistant'; text: string; at: number; attachment?: string; location?: string };
const files: { type: VaultType; label: string }[] = [
  { type: 'BANK_STATEMENT', label: 'Bank statements' },
  { type: 'ID_DOCUMENT', label: 'ID document' },
  { type: 'PROOF_OF_INCOME', label: 'Proof of income' },
  { type: 'PROOF_OF_ADDRESS', label: 'Proof of address' },
];
const message = (role: Message['role'], text: string, extra: Partial<Message> = {}): Message => ({ id: `${Date.now()}-${Math.random()}`, role, text, at: Date.now(), ...extra });

export default function Assistant() {
  const { me, client } = useAuth();
  const [messages, setMessages] = useState<Message[]>([message('assistant', `Hi ${me?.firstName || 'there'}! 👋 How can I help you today?`)]);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [attachmentsOpen, setAttachmentsOpen] = useState(false);
  const [optionsOpen, setOptionsOpen] = useState(false);
  const [error, setError] = useState('');
  const scroll = useRef<ScrollView>(null);

  async function ask(text: string) {
    const trimmed = text.trim();
    if (!trimmed || busy) return;
    const next = [...messages, message('user', trimmed)];
    setMessages(next); setDraft(''); setError(''); setBusy(true);
    try {
      const answer = await client.consumer.assistantReply(next.slice(-16).map(m => ({ role: m.role, content: m.text })));
      setMessages(all => [...all, message('assistant', answer.message)]);
    } catch (cause) { setError(errorMessage(cause)); }
    finally { setBusy(false); }
  }
  async function upload(type: VaultType) {
    setAttachmentsOpen(false); setError('');
    const picked = await DocumentPicker.getDocumentAsync({ type: ['application/pdf', 'image/jpeg', 'image/png'], copyToCacheDirectory: true });
    if (picked.canceled || !picked.assets[0]) return;
    const file = picked.assets[0];
    if (file.size && file.size > 10_000_000) { setError('Choose a file smaller than 10 MB.'); return; }
    setBusy(true);
    try {
      const body = new FormData();
      body.append('type', type); body.append('consent', 'true');
      body.append('file', { uri: file.uri, name: file.name, type: file.mimeType || 'application/octet-stream' } as any);
      await client.request<ApplicantVaultStatus>('POST', '/personal-loans/vault/documents', body);
      const label = files.find(item => item.type === type)?.label || 'document';
      setMessages(all => [...all, message('user', `I uploaded ${label.toLowerCase()} to my secure profile vault.`, { attachment: file.name }), message('assistant', 'Your file is in your profile vault. Processing can continue in the background; check My Documents for its status. You can keep chatting here.')]);
    } catch (cause) { setError(errorMessage(cause)); }
    finally { setBusy(false); }
  }
  async function shareLocation() {
    setAttachmentsOpen(false); setError('');
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (permission.status !== 'granted') { setError('Location was not shared. You can allow it later if you want to.'); return; }
      const point = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const coordinates = `${point.coords.latitude.toFixed(4)}, ${point.coords.longitude.toFixed(4)}`;
      setMessages(all => [...all, message('user', 'I shared my current location once in this chat.', { location: coordinates }), message('assistant', 'Location received for this conversation. You can explore nearby stores from the app. Background location monitoring was not turned on.')]);
    } catch { setError('Could not get your location. Please try again.'); }
  }
  return <SafeAreaView edges={['top', 'bottom']} style={{ flex: 1, backgroundColor: '#ede5f2' }}>
    <StatusBar style="light" />
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
      <View style={{ height: 64, backgroundColor: colors.purple, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, gap: 10 }}>
        <Pressable accessibilityRole="button" accessibilityLabel="Back to Home" onPress={() => router.replace('/(tabs)')}><Ionicons name="arrow-back" size={25} color={colors.white} /></Pressable>
        <View style={{ width: 42, height: 42, borderRadius: 21, backgroundColor: colors.brand, borderWidth: 2, borderColor: colors.white, alignItems: 'center', justifyContent: 'center' }}><Ionicons name="sparkles" size={24} color={colors.white} /></View>
        <View style={{ flex: 1 }}><Text style={{ color: colors.white, fontWeight: '800', fontSize: 16 }}>XTRA-CASH Assistant</Text><Text style={{ color: '#e9d4f4', fontSize: 12 }}>● Here to help</Text></View>
        <Pressable accessibilityRole="button" accessibilityLabel="Conversation options" onPress={() => setOptionsOpen(!optionsOpen)}><Ionicons name="ellipsis-vertical" size={22} color={colors.white} /></Pressable>
      </View>
      {optionsOpen ? <View style={{ backgroundColor: colors.white, paddingHorizontal: 16, paddingVertical: 8, gap: 5 }}><Pressable onPress={() => { setMessages([message('assistant', `Hi ${me?.firstName || 'there'}! 👋 How can I help you today?`)]); setOptionsOpen(false); }} style={{ paddingVertical: 8 }}><Text style={{ color: colors.ink }}>Clear this chat</Text></Pressable><Pressable onPress={() => { setOptionsOpen(false); router.push('/(tabs)/profile'); }} style={{ paddingVertical: 8 }}><Text style={{ color: colors.ink }}>My profile</Text></Pressable></View> : null}
      <ScrollView ref={scroll} style={{ flex: 1 }} contentContainerStyle={{ padding: 14, gap: 10 }} onContentSizeChange={() => scroll.current?.scrollToEnd({ animated: true })} keyboardShouldPersistTaps="handled">
        {messages.map(item => <View key={item.id} style={{ alignSelf: item.role === 'user' ? 'flex-end' : 'flex-start', maxWidth: '85%', backgroundColor: item.role === 'user' ? '#e6cff4' : colors.white, borderRadius: 18, paddingHorizontal: 13, paddingVertical: 9, elevation: 1 }}>
          <Text style={{ color: colors.ink, fontSize: 14, lineHeight: 20 }}>{item.text}</Text>
          {item.attachment ? <Text style={{ marginTop: 6, color: colors.purple, fontSize: 12 }}>📄 {item.attachment}</Text> : null}
          {item.location ? <Text style={{ marginTop: 6, color: colors.purple, fontSize: 12 }}>📍 {item.location}</Text> : null}
          <Text style={{ alignSelf: 'flex-end', color: colors.muted, fontSize: 10, marginTop: 3 }}>{new Date(item.at).toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit' })}{item.role === 'user' ? '  ✓✓' : ''}</Text>
        </View>)}
        {busy ? <Text style={{ alignSelf: 'flex-start', backgroundColor: colors.white, borderRadius: 16, padding: 10, color: colors.muted }}>● ● ●</Text> : null}
      </ScrollView>
      {error ? <Pressable accessibilityRole="button" accessibilityLabel="Dismiss error" onPress={() => setError('')} style={{ marginHorizontal: 12, marginBottom: 5, backgroundColor: '#fee2e2', borderRadius: 10, padding: 9 }}><Text style={{ color: colors.red, fontSize: 12 }}>{error}  ×</Text></Pressable> : null}
      {attachmentsOpen ? <View style={{ backgroundColor: colors.white, padding: 12, gap: 8, marginHorizontal: 10, borderRadius: 16, elevation: 4 }}><Text style={{ color: colors.ink, fontWeight: '800' }}>Add to chat</Text>{files.map(item => <Pressable key={item.type} onPress={() => { void upload(item.type); }} style={{ paddingVertical: 8, flexDirection: 'row', gap: 8 }}><Ionicons name="document-attach-outline" size={19} color={colors.purple} /><Text style={{ color: colors.ink }}>{item.label}</Text></Pressable>)}<Pressable onPress={() => { void shareLocation(); }} style={{ paddingVertical: 8, flexDirection: 'row', gap: 8 }}><Ionicons name="location-outline" size={19} color={colors.purple} /><Text style={{ color: colors.ink }}>Share location once</Text></Pressable><Text style={{ color: colors.muted, fontSize: 11 }}>Files save to your profile vault. Location stays in this chat.</Text></View> : null}
      <View style={{ backgroundColor: '#f7f2fa', padding: 8, flexDirection: 'row', alignItems: 'flex-end', gap: 8 }}>
        <Pressable accessibilityRole="button" accessibilityLabel="Add attachment or location" onPress={() => setAttachmentsOpen(!attachmentsOpen)} style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: colors.white, alignItems: 'center', justifyContent: 'center' }}><Ionicons name="add" size={26} color={colors.purple} /></Pressable>
        <TextInput accessibilityLabel="Message XTRA-CASH Assistant" placeholder="Message XTRA-CASH…" value={draft} onChangeText={setDraft} maxLength={1200} multiline style={{ flex: 1, minHeight: 42, maxHeight: 110, backgroundColor: colors.white, borderRadius: 21, paddingHorizontal: 14, paddingVertical: 10, color: colors.ink }} />
        <Pressable accessibilityRole="button" accessibilityLabel="Send message" disabled={!draft.trim() || busy} onPress={() => { void ask(draft); }} style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: colors.purple, alignItems: 'center', justifyContent: 'center', opacity: !draft.trim() || busy ? 0.5 : 1 }}><Ionicons name="send" size={19} color={colors.white} /></Pressable>
      </View>
    </KeyboardAvoidingView>
  </SafeAreaView>;
}
