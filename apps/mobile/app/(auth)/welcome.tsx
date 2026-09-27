import { useEffect, useState } from 'react';
import { AccessibilityInfo, Image, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { router } from 'expo-router';
import { useVideoPlayer, VideoView } from 'expo-video';
import { Button, Logo } from '../../src/ui';
import { colors } from '../../src/theme';

const FIRE = require('../../assets/fire.mp4');
const FIRE_POSTER = require('../../assets/fire-poster.jpg');

/** First screen for signed-out users: the "Put out the fire" video behind the sign-in choices. */
export default function Welcome() {
  const [reduceMotion, setReduceMotion] = useState(false);
  const player = useVideoPlayer(FIRE, (p) => {
    p.loop = true;
    p.muted = true;
  });

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(setReduceMotion);
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion);
    return () => sub.remove();
  }, []);

  useEffect(() => {
    if (reduceMotion) player.pause();
    else player.play();
  }, [player, reduceMotion]);

  return (
    <View style={{ flex: 1, backgroundColor: colors.ink }}>
      <StatusBar style="light" />
      {reduceMotion ? (
        <Image source={FIRE_POSTER} style={StyleSheet.absoluteFill} resizeMode="cover" />
      ) : (
        <VideoView player={player} style={StyleSheet.absoluteFill} contentFit="cover" nativeControls={false} />
      )}
      <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(27,16,48,0.55)' }]} />
      <SafeAreaView style={{ flex: 1, justifyContent: 'space-between', padding: 24 }}>
        <Logo light />
        <View style={{ gap: 14 }}>
          <Text style={{ color: colors.white, fontSize: 44, fontWeight: '900', lineHeight: 44, letterSpacing: -1, textTransform: 'uppercase' }}>
            Put out{'\n'}the <Text style={{ color: colors.orange }}>fire.</Text>
          </Text>
          <Text style={{ color: 'rgba(255,255,255,0.85)', fontSize: 17 }}>
            Money trouble spreads fast. XTRA-CASH stops it at the till, in seconds.
          </Text>
          <View style={{ gap: 10, marginTop: 8 }}>
            <Button title="Get my card" variant="accent" onPress={() => router.push('/(auth)/register')} />
            <Button title="Sign in" variant="secondary" onPress={() => router.push('/(auth)/login')} />
          </View>
          <Text style={{ color: 'rgba(255,255,255,0.6)', fontSize: 12 }}>
            Affordability-checked. You see the full cost before you pay. Credit from NCR-registered lenders.
          </Text>
        </View>
      </SafeAreaView>
    </View>
  );
}
