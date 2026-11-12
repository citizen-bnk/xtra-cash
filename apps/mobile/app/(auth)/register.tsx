import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, Text, View } from 'react-native';
import { Link, router } from 'expo-router';
import { useAuth, errorMessage } from '../../src/auth';
import { Button, Card, ErrorText, Field, H1, Logo, Muted, Screen } from '../../src/ui';
import { colors } from '../../src/theme';

type Details = { firstName: string; lastName: string; email: string; phone: string; password: string; referralCode: string };

export default function Register() {
  const { client, refreshMe } = useAuth();
  const [f, setF] = useState<Details>({ firstName: '', lastName: '', email: '', phone: '', password: '', referralCode: '' });
  const [step, setStep] = useState<1 | 2>(1);
  const [showReferral, setShowReferral] = useState(false);
  const [agree, setAgree] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof Details) => (v: string) => setF((current) => ({ ...current, [k]: v }));

  const continueToSecurity = () => {
    setError(null);
    const phone = f.phone.replace(/\s/g, '');
    if (!f.firstName.trim() || !f.lastName.trim() || !f.email.trim() || !phone) {
      setError('Complete your name, email and mobile number to continue.');
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email.trim())) {
      setError('Enter a valid email address.');
      return;
    }
    if (!/^(\+27|0)[6-8][0-9]{8}$/.test(phone)) {
      setError('Enter a valid South African mobile number.');
      return;
    }
    setStep(2);
  };

  const submit = async () => {
    if (!agree) return;
    setLoading(true);
    setError(null);
    try {
      await client.auth.register({
        email: f.email.trim(),
        phone: f.phone.replace(/\s/g, ''),
        password: f.password,
        firstName: f.firstName.trim(),
        lastName: f.lastName.trim(),
        accountType: 'CONSUMER',
        consent: true,
        referralCode: f.referralCode.trim() || undefined,
      });
      await refreshMe();
      router.replace('/kyc');
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Screen>
        <View style={{ marginTop: 12, gap: 18 }}>
          <Logo />
          <View style={{ gap: 6 }}>
            <Muted style={{ color: colors.brandDark, fontSize: 12, fontWeight: '800', letterSpacing: 1 }}>PERSONAL ACCOUNT · STEP {step} OF 2</Muted>
            <H1>{step === 1 ? 'Let’s get started' : 'Secure your account'}</H1>
            <Muted>{step === 1 ? 'Add your contact details. You can verify your profile next.' : 'Choose a password and review the account terms.'}</Muted>
          </View>
        </View>

        <View accessibilityRole="progressbar" accessibilityValue={{ min: 1, max: 2, now: step }} style={{ flexDirection: 'row', gap: 6 }}>
          <View style={{ flex: 1, height: 4, borderRadius: 99, backgroundColor: colors.brand }} />
          <View style={{ flex: 1, height: 4, borderRadius: 99, backgroundColor: step === 2 ? colors.brand : colors.line }} />
        </View>

        {step === 1 ? (
          <View style={{ gap: 14 }}>
            <Field label="First name" value={f.firstName} onChangeText={set('firstName')} autoComplete="given-name" autoCapitalize="words" returnKeyType="next" />
            <Field label="Surname" value={f.lastName} onChangeText={set('lastName')} autoComplete="family-name" autoCapitalize="words" returnKeyType="next" />
            <Field label="Email address" value={f.email} onChangeText={set('email')} autoCapitalize="none" keyboardType="email-address" autoComplete="email" returnKeyType="next" />
            <Field label="Mobile number" hint="South African number, e.g. 082 123 4567" value={f.phone} onChangeText={set('phone')} keyboardType="phone-pad" autoComplete="tel" returnKeyType="done" />
          </View>
        ) : (
          <View style={{ gap: 14 }}>
            <Field label="Password" hint="At least 8 characters" value={f.password} onChangeText={set('password')} secureTextEntry autoComplete="new-password" />

            <Pressable
              accessibilityRole="button"
              accessibilityState={{ expanded: showReferral }}
              onPress={() => setShowReferral((value) => !value)}
              style={{ minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}
            >
              <Text style={{ color: colors.ink, fontWeight: '700' }}>Have a referral code?</Text>
              <Text style={{ color: colors.brandDark, fontSize: 18, fontWeight: '800' }}>{showReferral ? '−' : '+'}</Text>
            </Pressable>
            {showReferral ? <Field label="Referral code (optional)" value={f.referralCode} onChangeText={set('referralCode')} autoCapitalize="characters" /> : null}

            <Pressable
              accessibilityRole="checkbox"
              accessibilityState={{ checked: agree }}
              onPress={() => setAgree((value) => !value)}
              style={({ pressed }) => ({
                flexDirection: 'row', alignItems: 'flex-start', gap: 12, padding: 14, minHeight: 76,
                borderRadius: 14, borderWidth: 2, borderColor: agree ? colors.purple : '#756487',
                backgroundColor: agree ? '#f5effa' : colors.white, opacity: pressed ? 0.82 : 1,
              })}
            >
              <View style={{ width: 24, height: 24, borderRadius: 6, borderWidth: 2, borderColor: agree ? colors.purple : '#59446e', backgroundColor: agree ? colors.purple : colors.white, alignItems: 'center', justifyContent: 'center' }}>
                {agree ? <Text style={{ color: colors.white, fontSize: 16, lineHeight: 18, fontWeight: '900' }}>✓</Text> : null}
              </View>
              <Text style={{ flex: 1, color: colors.ink, fontSize: 14, lineHeight: 20 }}>
                I consent to XTRA-CASH processing the information I provide to create this account.
              </Text>
            </Pressable>
          </View>
        )}

        <ErrorText>{error}</ErrorText>
        {step === 1 ? (
          <Button title="Continue" onPress={continueToSecurity} />
        ) : (
          <View style={{ gap: 10 }}>
            <Button title="Create account" onPress={submit} loading={loading} disabled={!agree || f.password.length < 8} />
            <Button title="Back to contact details" variant="secondary" onPress={() => { setError(null); setStep(1); }} disabled={loading} />
          </View>
        )}

        <Link href="/(auth)/login" style={{ textAlign: 'center', paddingVertical: 8 }}>
          <Muted>Already have an account? <Muted style={{ fontWeight: '800', color: colors.ink }}>Sign in</Muted></Muted>
        </Link>
        <Card style={{ backgroundColor: '#f5effa', borderColor: '#e2d4ee' }}>
          <Muted style={{ fontSize: 12, lineHeight: 17 }}>Your account is the starting point. Profile checks and any loan application happen separately, with their own explanations and consent.</Muted>
        </Card>
      </Screen>
    </KeyboardAvoidingView>
  );
}
