import { Redirect, Tabs, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Pressable, Text, View } from 'react-native';
import { useAuth } from '../../src/auth';
import { Loading } from '../../src/ui';
import { colors } from '../../src/theme';
import { NativeLoanNotifications } from '../../src/loan-notifications';

const icon = (name: keyof typeof Ionicons.glyphMap) => ({ color, size }: { color: string; size: number }) => <Ionicons name={name} color={color} size={size} />;

export default function TabsLayout() {
  const { me, loading } = useAuth();
  if (loading) return <Loading />;
  if (!me) return <Redirect href="/(auth)/login" />;
  const initials = `${me.firstName?.[0] ?? 'X'}${me.lastName?.[0] ?? ''}`.toUpperCase();
  return (
    <Tabs screenOptions={{ headerShown: true, headerTitle: 'XTRA-CASH', headerTitleStyle: { color: colors.white, fontWeight: '800' }, headerShadowVisible: false, headerStyle: { backgroundColor: colors.purple }, headerRight: () => <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginRight: 12 }}><NativeLoanNotifications /><Pressable accessibilityRole="button" accessibilityLabel="Open profile" onPress={() => router.push('/(tabs)/profile')} style={{ width: 36, height: 36, borderRadius: 18, borderWidth: 2, borderColor: colors.white, alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: colors.white, fontWeight: '800', fontSize: 12 }}>{initials}</Text></Pressable></View>, tabBarActiveTintColor: colors.purple, tabBarInactiveTintColor: colors.ink2, tabBarStyle: { backgroundColor: colors.white, borderTopColor: colors.line, height: 76, paddingTop: 6, paddingBottom: 10 }, tabBarLabelStyle: { fontSize: 11, fontWeight: '700' } }}>
      <Tabs.Screen name="index" options={{ title: 'Home', tabBarIcon: icon('home-outline') }} />
      <Tabs.Screen name="loans" options={{ title: 'Loans', tabBarIcon: icon('cash-outline') }} />
      <Tabs.Screen name="assistant" options={{ title: 'Assistant', tabBarIcon: () => <View style={{ width: 58, height: 58, marginTop: -20, borderRadius: 29, borderWidth: 3, borderColor: colors.white, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.purple, elevation: 6 }}><Ionicons name="sparkles" size={28} color={colors.white} /></View> }} />
      <Tabs.Screen name="pay" options={{ title: 'Pay', tabBarIcon: icon('scan-outline') }} />
      <Tabs.Screen name="more" options={{ title: 'More', tabBarIcon: icon('ellipsis-horizontal') }} />
      <Tabs.Screen name="card" options={{ href: null }} />
      <Tabs.Screen name="activity" options={{ href: null }} />
      <Tabs.Screen name="profile" options={{ href: null }} />
    </Tabs>
  );
}
