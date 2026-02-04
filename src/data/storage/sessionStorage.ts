import * as SecureStore from 'expo-secure-store';

const ACCESS_TOKEN_KEY = 'auth.accessToken';
const EMAIL_KEY = 'auth.email';

export type StoredSession = {
  accessToken: string;
  email?: string;
};

/**
 * Secure storage for authentication/session data.
 *
 * Security notes:
 * - Access tokens are stored using the OS keychain/keystore via expo-secure-store.
 * - Never log tokens, and never hardcode secrets in the app bundle.
 */
export async function getStoredSession(): Promise<StoredSession | null> {
  const accessToken = await SecureStore.getItemAsync(ACCESS_TOKEN_KEY);
  if (!accessToken) return null;
  const email = (await SecureStore.getItemAsync(EMAIL_KEY)) ?? undefined;
  return { accessToken, email };
}

export async function storeSession(session: StoredSession): Promise<void> {
  await SecureStore.setItemAsync(ACCESS_TOKEN_KEY, session.accessToken);
  if (session.email) {
    await SecureStore.setItemAsync(EMAIL_KEY, session.email);
  } else {
    await SecureStore.deleteItemAsync(EMAIL_KEY);
  }
}

export async function clearStoredSession(): Promise<void> {
  await SecureStore.deleteItemAsync(ACCESS_TOKEN_KEY);
  await SecureStore.deleteItemAsync(EMAIL_KEY);
}

