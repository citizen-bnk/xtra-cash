import { useState } from 'react';
import { Switch, Text, View } from 'react-native';
import { Link, router } from 'expo-router';
import { useAuth, errorMessage } from '../../src/auth';
import { Button, ErrorText, Field, H1, Muted, Screen } from '../../src/ui';
import { colors } from '../../src/theme';

export default function Register() {
  const { client, refreshMe } = useAuth();
  const [f, setF] = useState({ firstName: '', lastName: '', email: '', phone: '', password: '', referralCode: '' });
  const [agree, setAgree] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof typeof f) => (v: string) => setF({ ...f, [k]: v });

  const submit = async () => {
    setLoading(true);
    setError(null);
    try {
      await client.auth.register({ ...f, accountType: 'CONSUMER', referralCode: f.referralCode || undefined });
      await refreshMe();
      router.replace('/kyc');
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Screen>
      <View style={{ marginTop: 24, gap: 4 }}>
        <H1>Get your XTRA-CASH card</H1>
        <Muted>Takes 2 minutes. Lenders and merchants can register on the web.</Muted>
      </View>
      <Field label="First name" value={f.firstName} onChangeText={set('firstName')} autoComplete="given-name" />
      <Field label="Surname" value={f.lastName} onChangeText={set('lastName')} autoComplete="family-name" />
      <Field label="Email" value={f.email} onChangeText={set('email')} autoCapitalize="none" keyboardType="email-address" autoComplete="email" />
      <Field label="Mobile number" hint="e.g. 082 123 4567" value={f.phone} onChangeText={set('phone')} keyboardType="phone-pad" autoComplete="tel" />
      <Field label="Password" hint="At least 8 characters" value={f.password} onChangeText={set('password')} secureTextEntry autoComplete="new-password" />
      <Field label="Referral code (optional)" value={f.referralCode} onChangeText={set('referralCode')} autoCapitalize="characters" />
      <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
        <Switch value={agree} onValueChange={setAgree} trackColor={{ true: colors.limeDark }} />
        <Text style={{ flex: 1, color: colors.muted }}>I agree to the Terms and consent to processing of my personal information (POPIA).</Text>
      </View>
      <ErrorText>{error}</ErrorText>
      <Button title="Create account" onPress={submit} loading={loading} disabled={!agree} />
      <Link href="/(auth)/login" style={{ textAlign: 'center' }}>
        <Muted>Already have an account? Sign in</Muted>
      </Link>
    </Screen>
  );
}
