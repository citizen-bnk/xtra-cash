import { ImageBackground, StyleSheet, Text, View } from 'react-native';
import { Logo } from './ui';
import { colors } from './theme';

const CARD = require('../assets/card.jpg');
const CARD_FROZEN = require('../assets/card-frozen.jpg');

/**
 * The XTRA-CASH card: the official card artwork (logo and chip are printed on it) with the
 * cardholder's details on top. A frozen card shows the frosted ice artwork with its own logo.
 * Mirrors XtraCard in @xtra/ui. No card-network logo until XTRA-CASH has an issuing agreement.
 */
export function XtraCard({ name, maskedPan, expiry, frozen }: { name: string; maskedPan: string; expiry: string; frozen?: boolean }) {
  const ink = frozen ? colors.ink : colors.white;
  const shadow = frozen ? null : s.shadow;
  return (
    <ImageBackground
      source={frozen ? CARD_FROZEN : CARD}
      resizeMode="cover"
      style={[s.card, { backgroundColor: frozen ? '#8cc4e3' : colors.brand }]}
      accessibilityRole="image"
      accessibilityLabel={`XTRA-CASH card ${maskedPan}${frozen ? ', frozen' : ''}`}
    >
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        {frozen ? <Logo /> : <View />}
        {frozen && <Text style={s.frozen}>FROZEN</Text>}
      </View>
      <View style={{ gap: 6 }}>
        <Text style={[{ color: ink, fontSize: 20, letterSpacing: 2, fontVariant: ['tabular-nums'] }, shadow]}>{maskedPan}</Text>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          <Text style={[{ color: ink, opacity: 0.9, fontSize: 12, fontWeight: '600' }, shadow]}>{name}</Text>
          <Text style={[{ color: ink, opacity: 0.9, fontSize: 12, fontWeight: '600' }, shadow]}>{expiry}</Text>
        </View>
      </View>
    </ImageBackground>
  );
}

const s = StyleSheet.create({
  card: { borderRadius: 20, overflow: 'hidden', padding: 20, aspectRatio: 1.586, justifyContent: 'space-between' },
  shadow: { textShadowColor: 'rgba(0,0,0,0.45)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 3 },
  frozen: { color: colors.white, fontWeight: '700', backgroundColor: 'rgba(27,16,48,0.8)', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999, overflow: 'hidden', fontSize: 12 },
});
