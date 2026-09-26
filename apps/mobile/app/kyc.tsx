import { useState } from 'react';
import { Switch, Text, View } from 'react-native';
import { router } from 'expo-router';
import { EMPLOYMENT_LABELS, EmploymentStatus, formatZAR, parseSaId, PROVINCES } from '@xtra/shared';
import { errorMessage, useAuth } from '../src/auth';
import { Button, Chip, ErrorText, Field, H2, Muted, Screen, toCents } from '../src/ui';
import { colors } from '../src/theme';

export default function Kyc() {
  const { me, client, refreshMe } = useAuth();
  const k = me?.kyc;
  const [idNumber, setIdNumber] = useState(k?.idNumber ?? '');
  const [province, setProvince] = useState(k?.province ?? 'Gauteng');
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
      <Muted>Lenders use this to match you with offers. We never share your details without consent.</Muted>
      <Field
        label="SA ID number"
        keyboardType="number-pad"
        maxLength={13}
        value={idNumber}
        onChangeText={(t) => setIdNumber(t.replace(/\D/g, ''))}
        editable={k?.status !== 'VERIFIED'}
        error={id && !id.valid ? id.reason : undefined}
        hint={id?.valid ? `Born ${id.dateOfBirth!.toLocaleDateString('en-ZA')}` : '13 digits'}
      />
      <H2>Province</H2>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {PROVINCES.map((p) => <Chip key={p} label={p} on={province === p} onPress={() => setProvince(p)} />)}
      </View>
      <H2>Employment</H2>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {(Object.keys(EMPLOYMENT_LABELS) as EmploymentStatus[]).map((e) => <Chip key={e} label={EMPLOYMENT_LABELS[e]} on={employment === e} onPress={() => setEmployment(e)} />)}
      </View>
      <Field label="Monthly income after tax (R)" keyboardType="decimal-pad" value={income} onChangeText={setIncome} />
      <Field label="Monthly expenses (R)" hint="Rent, transport, food, other debt" keyboardType="decimal-pad" value={expenses} onChangeText={setExpenses} />
      {inc != null && exp != null && <Muted>Left each month: {formatZAR(inc - exp)}</Muted>}
      <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
        <Switch value={consent} onValueChange={setConsent} trackColor={{ true: colors.brand }} />
        <Text style={{ flex: 1, color: colors.muted, fontSize: 13 }}>I consent to a credit bureau check by XTRA-CASH and its partner credit providers and confirm this information is true.</Text>
      </View>
      <ErrorText>{error}</ErrorText>
      <Button title="Verify and see my offers" onPress={submit} loading={loading} disabled={!consent || !id?.valid || inc == null || exp == null} />
    </Screen>
  );
}
