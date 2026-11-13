import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider } from '../src/auth';
import { NearbyLifecycle } from '../src/NearbyLifecycle';
import { colors } from '../src/theme';
import { CustomerRootNav } from '../src/CustomerRootNav';
import { CustomerHeaderActions } from '../src/CustomerHeaderActions';

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <StatusBar style="dark" />
        <NearbyLifecycle />
        <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.surface }, headerStyle: { backgroundColor: colors.purple }, headerTintColor: colors.white, headerTitleStyle: { fontWeight: '800' }, headerRight: () => <CustomerHeaderActions /> }}>
          <Stack.Screen name="pay" options={{ presentation: 'modal', headerShown: true, title: 'Pay with XTRA-CASH' }} />
          <Stack.Screen name="kyc" options={{ headerShown: true, title: 'Verify your profile' }} />
          <Stack.Screen name="loan/[id]" options={{ headerShown: true, title: 'Repayment' }} />
          <Stack.Screen name="personal-loan" options={{ headerShown: true, title: 'Loan request' }} />
          <Stack.Screen name="data-vault" options={{ headerShown: true, title: 'My documents' }} />
          <Stack.Screen name="nearby" options={{ headerShown: true, title: 'Offers near me' }} />
          <Stack.Screen name="offer/[id]" options={{ headerShown: true, title: 'Offer' }} />
        </Stack>
        <CustomerRootNav />
      </AuthProvider>
    </SafeAreaProvider>
  );
}
