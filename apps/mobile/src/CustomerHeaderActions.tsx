import { router } from 'expo-router';
import { Pressable, Text, View } from 'react-native';
import { useAuth } from './auth';
import { colors } from './theme';
import { NativeLoanNotifications } from './loan-notifications';

export function CustomerHeaderActions() {
  const { me } = useAuth();
  const initials = `${me?.firstName?.[0] ?? 'X'}${me?.lastName?.[0] ?? ''}`.toUpperCase();
  return <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginRight: 12 }}>
    <NativeLoanNotifications />
    <Pressable accessibilityRole="button" accessibilityLabel="Open profile" onPress={() => router.push('/(tabs)/profile')} style={{ width: 36, height: 36, borderRadius: 18, borderWidth: 2, borderColor: colors.white, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ color: colors.white, fontWeight: '800', fontSize: 12 }}>{initials}</Text>
    </Pressable>
  </View>;
}
