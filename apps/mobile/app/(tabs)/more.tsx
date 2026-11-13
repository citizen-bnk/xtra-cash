import { router } from 'expo-router';
import { Button, H1, Screen } from '../../src/ui';

export default function More() {
  return <Screen>
    <H1>More services</H1>
    <Button title="My wallet and card" variant="secondary" onPress={() => router.push('/(tabs)/card')} />
    <Button title="Transactions" variant="secondary" onPress={() => router.push('/(tabs)/activity')} />
    <Button title="My documents" variant="secondary" onPress={() => router.push('/data-vault')} />
    <Button title="Profile and settings" variant="secondary" onPress={() => router.push('/(tabs)/profile')} />
    <Button title="Offers near me" variant="secondary" onPress={() => router.push('/nearby')} />
  </Screen>;
}
