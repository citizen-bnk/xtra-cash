import { ImageBackground, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Logo } from './ui';
import { colors } from './theme';

const CARD_FROZEN = require('../assets/card-frozen.jpg');

/**
 * The XTRA-CASH card, drawn to match the brand card artwork (orange-to-purple flames), with the
 * cardholder's details. A frozen card shows the frosted ice artwork. Mirrors XtraCard in @xtra/ui.
 * No card-network logo until XTRA-CASH has an issuing agreement.
 */
export function XtraCard({ name, maskedPan, expiry, frozen }: { name: string; maskedPan: string; expiry: string; frozen?: boolean }) {
  const ink = frozen ? colors.ink : colors.white;
  const body = (
    <>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <Logo light={!frozen} />
        {frozen && <Text style={s.frozen}>FROZEN</Text>}
      </View>
      <View style={s.chip} />
      <View style={{ gap: 6 }}>
        <Text style={{ color: ink, fontSize: 20, letterSpacing: 2, fontVariant: ['tabular-nums'] }}>{maskedPan}</Text>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          <Text style={{ color: ink, opacity: 0.85, fontSize: 12, fontWeight: '600' }}>{name}</Text>
          <Text style={{ color: ink, opacity: 0.85, fontSize: 12, fontWeight: '600' }}>{expiry}</Text>
        </View>
      </View>
    </>
  );

  if (frozen) {
    return (
      <ImageBackground source={CARD_FROZEN} resizeMode="cover" style={[s.card, { backgroundColor: '#8cc4e3' }]}>
        {body}
      </ImageBackground>
    );
  }
  return (
    <LinearGradient colors={['#fb9320', '#e5476a', '#a617d3', '#5c2394']} locations={[0, 0.42, 0.76, 1]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s.card}>
      <MaterialCommunityIcons name="fire" size={190} color="rgba(255,255,255,0.14)" style={{ position: 'absolute', right: -30, bottom: -36 }} />
      {body}
    </LinearGradient>
  );
}

const s = StyleSheet.create({
  card: { borderRadius: 20, overflow: 'hidden', padding: 20, aspectRatio: 1.586, justifyContent: 'space-between' },
  chip: { width: 44, height: 32, borderRadius: 6, backgroundColor: '#d4af37', borderWidth: 1, borderColor: 'rgba(0,0,0,0.12)' },
  frozen: { color: colors.white, fontWeight: '700', backgroundColor: 'rgba(27,16,48,0.8)', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999, overflow: 'hidden', fontSize: 12 },
});
