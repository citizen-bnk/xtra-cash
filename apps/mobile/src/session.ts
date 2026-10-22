import * as SecureStore from 'expo-secure-store';
import type { Tokens } from '@xtra/shared';
const KEY = 'xtra.tokens';
export const API_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:4000';
export const tokenStore = {
  async get(): Promise<Tokens | null> { const raw = await SecureStore.getItemAsync(KEY); return raw ? JSON.parse(raw) : null; },
  async set(tokens: Tokens | null) { if (tokens) await SecureStore.setItemAsync(KEY, JSON.stringify(tokens)); else await SecureStore.deleteItemAsync(KEY); },
};
