import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { router } from 'expo-router';
import { EMPLOYMENT_LABELS, EmploymentStatus, formatZAR, parseSaId, PROVINCES } from '@xtra/shared';
import { errorMessage, useAuth } from '../src/auth';
import { Button, Card, Chip, ErrorText, Field, H1, H2, Muted, Notice, Screen, toCents } from '../src/ui';
import { colors } from '../src/theme';

export default function Kyc() {
  const { me, client, refreshMe } = useAuth();
  const k = me?.kyc;
  const [step, setStep] = useState<1 | 2>(1);
  const [idNumber, setIdNumber] = useState(k?.idNumber ?? '');
  const [province, setProvince] = useState<string>(k?.province ?? 'Gauteng');
  const [employment, setEmployment] = useState<EmploymentStatus>(k?.employmentStatus ?? 'EMPLOYED_FULL_TIME');
  const [income, setIncome] = useState(k ? String(k.monthlyIncomeCents / 100) : '');
  const [expenses, setExpenses] = useState(k ? String(k.monthlyExpensesCents / 100) : '');
  const [consent, setConsent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const id = idNumber.length === 13 ? parseSaId(idNumber) : null;
  const inc = toCents(income);
  const exp = toCents(expenses);

  const submit = async () => {
    setLoading(true);
    setError(null);
    try {
      await client.consumer.submitKyc({ idNumber, province, employmentStatus: employment, monthlyIncomeCents: inc ?? 0, monthlyExpensesCents: exp ?? 0, consentCreditCheck: consent });
      await refreshMe();
      router.replace('/(tabs)');
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Screen>
      <View style={{ gap: 6 }}>
        <Muted style={{ color: colors.brandDark, fontSize: 12, fontWeight: '800', letterSpacing: 1 }}>PROFILE SETUP · STEP {step} OF 2</Muted>
        <H1>{step === 1 ? 'Build your data vault' : 'Add your income picture'}</H1>
        <Muted>{step === 1 ? 'Start with your identity and where you live.' : 'This information helps lenders assess affordability. You can add documents to your vault later.'}</Muted>
      </View>
      <View accessibilityRole="progressbar" accessibilityValue={{ min: 1, max: 2, now: step }} style={{ flexDirection: 'row', gap: 6 }}>
        <View style={{ flex: 1, height: 4, borderRadius: 99, backgroundColor: colors.brand }} />
        <View style={{ flex: 1, height: 4, borderRadius: 99, backgroundColor: step === 2 ? colors.brand : colors.line }} />
      </View>

      {k?.status === 'PENDING' ? <Notice title="Your verification is in progress" tone="blue">You can continue using the app. We’ll update your profile when the review is complete.</Notice> : null}
      {k?.status === 'REJECTED' ? <Notice title="We need to review your details">{k.rejectionReason || 'Check your details or contact support for help.'}</Notice> : null}

      {step === 1 ? <>
        <Field
          label="South African ID number"
          keyboardType="number-pad"
          maxLength={13}
          value={idNumber}
          onChangeText={(value) => setIdNumber(value.replace(/\D/g, ''))}
          editable={k?.status !== 'VERIFIED'}
          error={id && !id.valid ? id.reason : undefined}
          hint={id?.valid ? `Date of birth ${id.dateOfBirth!.toLocaleDateString('en-ZA')}` : '13 digits. Your number is stored securely.'}
        />
        <H2>Province</H2>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {PROVINCES.map((item) => <Chip key={item} label={item} on={province === item} onPress={() => setProvince(item)} />)}
        </View>
        <Notice title="Your information stays in your profile">You choose when to submit a loan application and consent to lender sharing as part of that application.</Notice>
        <Button title="Continue to income" onPress={() => { setError(null); setStep(2); }} disabled={!id?.valid} />
      </> : <>
        <H2>Employment status</H2>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {(Object.keys(EMPLOYMENT_LABELS) as EmploymentStatus[]).map((item) => <Chip key={item} label={EMPLOYMENT_LABELS[item]} on={employment === item} onPress={() => setEmployment(item)} />)}
        </View>
        <Field label="Monthly income after tax (R)" keyboardType="decimal-pad" value={income} onChangeText={setIncome} />
        <Field label="Monthly expenses (R)" hint="Include housing, transport, food and other debt." keyboardType="decimal-pad" value={expenses} onChangeText={setExpenses} />
        {inc != null && exp != null ? <Card><Text style={{ color: colors.muted }}>Estimated amount left each month</Text><Text style={{ color: colors.ink, fontSize: 24, fontWeight: '900' }}>{formatZAR(inc - exp)}</Text></Card> : null}
        <Pressable
          accessibilityRole="checkbox"
          accessibilityState={{ checked: consent }}
          onPress={() => setConsent((value) => !value)}
          style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12, padding: 14, minHeight: 76, borderRadius: 14, borderWidth: 2, borderColor: consent ? colors.purple : '#756487', backgroundColor: consent ? '#f5effa' : colors.white }}
        >
          <View style={{ width: 24, height: 24, borderRadius: 6, borderWidth: 2, borderColor: consent ? colors.purple : '#59446e', backgroundColor: consent ? colors.purple : colors.white, alignItems: 'center', justifyContent: 'center' }}>
            {consent ? <Text style={{ color: colors.white, fontSize: 16, lineHeight: 18, fontWeight: '900' }}>✓</Text> : null}
          </View>
          <Text style={{ flex: 1, color: colors.ink, fontSize: 14, lineHeight: 20 }}>I confirm my income and expenses are accurate and consent to a credit bureau check when I apply for credit.</Text>
        </Pressable>
        <ErrorText>{error}</ErrorText>
        <Button title="Save my profile" onPress={submit} loading={loading} disabled={!consent || !id?.valid || inc == null || exp == null} />
        <Button title="Back to identity" variant="secondary" onPress={() => { setError(null); setStep(1); }} disabled={loading} />
      </>}
      <Pressable accessibilityRole="button" onPress={() => router.replace('/(tabs)')} style={{ alignItems: 'center', padding: 10 }}>
        <Text style={{ color: colors.brandDark, fontWeight: '700' }}>Do this later</Text>
      </Pressable>
    </Screen>
  );
}
