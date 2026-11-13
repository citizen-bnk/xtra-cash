import { Ionicons } from '@expo/vector-icons';
import { router, useSegments } from 'expo-router';
import { Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from './auth';
import { colors } from './theme';

const destinations = [
  { label: 'Home', icon: 'home-outline', href: '/(tabs)' },
  { label: 'Loans', icon: 'cash-outline', href: '/(tabs)/loans' },
  { label: 'Assistant', icon: 'sparkles', href: '/(tabs)/assistant' },
  { label: 'Pay', icon: 'scan-outline', href: '/(tabs)/pay' },
  { label: 'More', icon: 'ellipsis-horizontal', href: '/(tabs)/more' },
] as const;

export function CustomerRootNav() {
  const segments = useSegments();
  const { me } = useAuth();
  if (!me || segments[0] === '(tabs)' || segments[0] === '(auth)') return null;
  return <SafeAreaView edges={['bottom']} style={{ backgroundColor: colors.white, borderTopWidth: 1, borderTopColor: colors.line }}>
    <View style={{ height: 66, flexDirection: 'row', alignItems: 'center' }}>
      {destinations.map(item => <Pressable key={item.label} accessibilityRole="button" accessibilityLabel={item.label} onPress={() => router.replace(item.href)} style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 2 }}>
        <View style={item.label === 'Assistant' ? { width: 48, height: 48, marginTop: -16, borderRadius: 24, backgroundColor: colors.purple, alignItems: 'center', justifyContent: 'center' } : undefined}><Ionicons name={item.icon} size={item.label === 'Assistant' ? 25 : 23} color={item.label === 'Assistant' ? colors.white : colors.ink2} /></View>
        <Text style={{ color: colors.ink2, fontSize: 11, fontWeight: '700' }}>{item.label}</Text>
      </Pressable>)}
    </View>
  </SafeAreaView>;
}
