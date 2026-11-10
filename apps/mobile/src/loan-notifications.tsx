import { Ionicons } from '@expo/vector-icons';
import { useEffect, useMemo, useState } from 'react';
import { AppState, Linking, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useApi, useAuth } from './auth';
import { Button, Card, ErrorText, Muted } from './ui';
import { colors } from './theme';

type LoanNotification = { key: string; applicationId: string; title: string; description: string; cta: string; kind: string; owner: string; read: boolean };
const WEB_URL = process.env.EXPO_PUBLIC_WEB_URL || 'https://xtra-cash.vercel.app';

export function NativeLoanNotifications() {
  const { client, me } = useAuth();
  const feed = useApi((c) => c.request<{ notifications: LoanNotification[] }>('GET', '/loan-operations/notifications'), [me?.id]);
  const [open, setOpen] = useState(false), [notice, setNotice] = useState('');
  const unread = useMemo(() => feed.data?.notifications.filter((n) => !n.read) ?? [], [feed.data?.notifications]);
  useEffect(() => {
    const timer = setInterval(() => { if (AppState.currentState === 'active') void feed.reload(); }, 30_000);
    const sub = AppState.addEventListener('change', (state) => { if (state === 'active') void feed.reload(); });
    return () => { clearInterval(timer); sub.remove(); };
  }, [feed.reload]);
  async function act(n: LoanNotification) {
    setNotice('');
    const reviewer = me?.roles.some((r) => r === 'LENDER' || r === 'ADMIN' || r === 'SUPER_ADMIN');
    const path = n.kind === 'WALLET' ? '/app/wallet' : reviewer ? `/lender/applications/${encodeURIComponent(n.applicationId)}` : `/app/applications/${encodeURIComponent(n.applicationId)}`;
    try {
      await Linking.openURL(WEB_URL + path);
      await client.request('POST', '/loan-operations/notifications/read', { key: n.key });
      await feed.reload();
      setOpen(false);
    } catch { setNotice('Could not open this task. Check your connection and try again.'); }
  }
  return <>
    <Pressable accessibilityRole="button" accessibilityLabel={`Notifications${unread.length ? `, ${unread.length} unread` : ''}`} onPress={() => { setOpen(true); void feed.reload(); }} style={s.bell}>
      <Ionicons name="notifications-outline" color={colors.ink} size={23} />
      {unread.length ? <View style={s.badge}><Text style={s.badgeText}>{unread.length > 99 ? '99+' : unread.length}</Text></View> : null}
    </Pressable>
    <Modal visible={open} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setOpen(false)}>
      <SafeAreaView style={s.modal}>
        <View style={s.header}><View><Text style={s.title}>Notifications</Text><Muted>{unread.length ? `${unread.length} unread loan task${unread.length === 1 ? '' : 's'}` : 'You’re all caught up'}</Muted></View><Pressable accessibilityRole="button" accessibilityLabel="Close notifications" onPress={() => setOpen(false)} style={s.close}><Ionicons name="close" size={24} color={colors.ink} /></Pressable></View>
        <ScrollView contentContainerStyle={s.list}>
          <ErrorText>{feed.error || notice}</ErrorText>
          {unread.length ? unread.map((n) => <Card key={n.key}><Text style={s.itemTitle}>{n.title}</Text><Muted>{n.description}</Muted><Button title={n.cta || 'Open task'} onPress={() => { void act(n); }} /></Card>) : <Card><Text style={s.itemTitle}>No action is waiting</Text><Muted>New loan updates will appear here with a button that takes you directly to the task.</Muted></Card>}
        </ScrollView>
      </SafeAreaView>
    </Modal>
  </>;
}

const s = StyleSheet.create({
  bell: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', marginRight: 8 },
  badge: { position: 'absolute', right: 3, top: 2, minWidth: 19, height: 19, paddingHorizontal: 4, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.brand },
  badgeText: { color: colors.white, fontSize: 10, fontWeight: '800' },
  modal: { flex: 1, backgroundColor: colors.surface },
  header: { paddingHorizontal: 18, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: colors.line, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { color: colors.ink, fontSize: 22, fontWeight: '800' },
  close: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.white },
  list: { padding: 16, gap: 12 },
  itemTitle: { color: colors.ink, fontSize: 16, fontWeight: '700', marginBottom: 4 },
});
