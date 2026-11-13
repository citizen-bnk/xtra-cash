import { router } from 'expo-router';
import { Button, Card, H1, Muted, Screen } from '../../src/ui';

export default function Assistant() {
  return <Screen>
    <H1>XTRA-CASH Assistant</H1>
    <Card><Muted>What can we help you with today?</Muted></Card>
    <Button title="Get a loan" onPress={() => router.push('/(tabs)/loans')} />
    <Button title="View my card" variant="secondary" onPress={() => router.push('/(tabs)/card')} />
    <Button title="View account activity" variant="secondary" onPress={() => router.push('/(tabs)/activity')} />
    <Button title="Manage my profile" variant="secondary" onPress={() => router.push('/(tabs)/profile')} />
  </Screen>;
}
