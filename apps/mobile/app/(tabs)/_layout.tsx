import { Redirect, Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../src/auth';
import { Loading } from '../../src/ui';
import { colors } from '../../src/theme';
import { NativeLoanNotifications } from '../../src/loan-notifications';

const icon = (name: keyof typeof Ionicons.glyphMap) => ({ color, size }: { color: string; size: number }) => <Ionicons name={name} color={color} size={size} />;

export default function TabsLayout() {
  const { me, loading } = useAuth();
  if (loading) return <Loading />;
  if (!me) return <Redirect href="/(auth)/login" />;
  return (
    <Tabs screenOptions={{ headerShown: true, headerTitle: 'XTRA-CASH', headerTitleStyle: { color: colors.ink, fontWeight: '800' }, headerShadowVisible: false, headerStyle: { backgroundColor: colors.white }, headerRight: () => <NativeLoanNotifications />, tabBarActiveTintColor: colors.ink, tabBarInactiveTintColor: colors.muted }}>
      <Tabs.Screen name="index" options={{ title: 'Home', tabBarIcon: icon('home-outline') }} />
      <Tabs.Screen name="card" options={{ title: 'Card', tabBarIcon: icon('card-outline') }} />
      <Tabs.Screen name="loans" options={{ title: 'Loans', tabBarIcon: icon('list-outline') }} />
      <Tabs.Screen name="activity" options={{ title: 'Activity', tabBarIcon: icon('receipt-outline') }} />
      <Tabs.Screen name="profile" options={{ title: 'Profile', tabBarIcon: icon('person-outline') }} />
    </Tabs>
  );
}
