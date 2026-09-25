import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider } from '../src/auth';
import { colors } from '../src/theme';

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <StatusBar style="dark" />
        <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.surface } }}>
          <Stack.Screen name="pay" options={{ presentation: 'modal', headerShown: true, title: 'Pay with XTRA-CASH' }} />
          <Stack.Screen name="kyc" options={{ headerShown: true, title: 'Verify your profile' }} />
          <Stack.Screen name="loan/[id]" options={{ headerShown: true, title: 'Repayment' }} />
        </Stack>
      </AuthProvider>
    </SafeAreaProvider>
  );
}
