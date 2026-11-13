import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { router } from 'expo-router';
import { Button, Logo } from '../../src/ui';
import { colors } from '../../src/theme';

const CUSTOMER_PHOTO = require('../../assets/customer-phone.png');

/** Branded entry point for the native customer app. */
export default function Welcome() {
  return (
    <View style={styles.root}>
      <StatusBar style="light" />
      <View style={styles.glow} />
      <Image source={CUSTOMER_PHOTO} style={styles.hero} resizeMode="contain" />
      <View style={styles.scrim} />
      <SafeAreaView style={styles.safe}>
        <View style={styles.brandRow}>
          <Logo light />
          <Text style={styles.appLabel}>MONEY, MADE CLEAR</Text>
        </View>

        <View style={styles.bottom}>
          <View style={styles.message}>
            <Text style={styles.eyebrow}>WELCOME TO XTRA-CASH</Text>
            <Text accessibilityRole="header" style={styles.title}>
              More control.{ '\n' }Less money stress.
            </Text>
            <Text style={styles.body}>
              Manage your wallet, card and personal-loan journey in one secure app.
            </Text>
          </View>

          <View style={styles.actions}>
            <Button title="Get started" variant="accent" onPress={() => router.push('/(auth)/login')} />
            <Pressable
              accessibilityRole="button"
              onPress={() => router.push('/(auth)/register')}
              style={({ pressed }) => [styles.signIn, pressed && styles.pressed]}
            >
              <Text style={styles.signInText}>Not yet registered? <Text style={styles.signInStrong}>Create Account</Text></Text>
            </Pressable>
            <Text style={styles.footnote}>
              Credit applications are subject to lender review and affordability checks.
            </Text>
          </View>
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#420063' },
  glow: { position: 'absolute', top: '18%', right: -120, width: 360, height: 360, borderRadius: 180, backgroundColor: '#d91f63' },
  hero: { position: 'absolute', top: '12%', right: -35, width: '100%', height: '57%' },
  scrim: { position: 'absolute', left: 0, right: 0, bottom: 0, height: '48%', backgroundColor: 'rgba(27,16,48,0.75)' },
  safe: { flex: 1, justifyContent: 'space-between', paddingHorizontal: 22, paddingTop: 12, paddingBottom: 12 },
  brandRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  appLabel: { color: 'rgba(255,255,255,0.75)', fontSize: 10, fontWeight: '800', letterSpacing: 1.2 },
  bottom: { gap: 28, paddingBottom: 12 },
  message: { gap: 12, maxWidth: 440 },
  eyebrow: { color: colors.orange, fontSize: 11, fontWeight: '800', letterSpacing: 1.8 },
  title: { color: colors.white, fontSize: 38, fontWeight: '900', lineHeight: 43, letterSpacing: -1.1 },
  body: { color: 'rgba(255,255,255,0.88)', fontSize: 16, lineHeight: 23, maxWidth: 350 },
  actions: { gap: 10 },
  signIn: { minHeight: 48, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12 },
  signInText: { color: 'rgba(255,255,255,0.9)', fontSize: 14 },
  signInStrong: { color: colors.white, fontWeight: '800' },
  footnote: { color: 'rgba(255,255,255,0.66)', fontSize: 11, lineHeight: 16, textAlign: 'center', paddingHorizontal: 12 },
  pressed: { opacity: 0.72 },
});
