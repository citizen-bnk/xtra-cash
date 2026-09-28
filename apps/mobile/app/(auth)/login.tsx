import { useState } from 'react';
import { KeyboardAvoidingView, Platform, View } from 'react-native';
import { Link, router } from 'expo-router';
import { useAuth, errorMessage } from '../../src/auth';
import { Button, ErrorText, Field, H1, Logo, Muted, Screen } from '../../src/ui';
import { colors } from '../../src/theme';

export default function Login() {
  const { client, refreshMe } = useAuth();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setLoading(true);
    setError(null);
    try {
      await client.auth.login(identifier, password);
      await refreshMe();
      router.replace('/(tabs)');
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Screen>
        <View style={{ marginTop: 40, gap: 8 }}>
          <Logo />
          <H1>Welcome back</H1>
          <Muted>Put out the fire. Credit at the point of payment.</Muted>
        </View>
        <Field label="Email or mobile number" autoCapitalize="none" autoComplete="username" value={identifier} onChangeText={setIdentifier} />
        <Field label="Password" secureTextEntry autoComplete="password" value={password} onChangeText={setPassword} />
        <ErrorText>{error}</ErrorText>
        <Button title="Sign in" onPress={submit} loading={loading} disabled={!identifier || !password} />
        <Link href="/(auth)/register" style={{ textAlign: 'center', marginTop: 8 }}>
          <Muted>New here? <Muted style={{ fontWeight: '700', color: colors.ink }}>Create an account</Muted></Muted>
        </Link>
      </Screen>
    </KeyboardAvoidingView>
  );
}
