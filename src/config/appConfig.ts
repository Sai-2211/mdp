export type WebSocketAuthMode = 'header' | 'query';

export type AppConfig = {
  apiBaseUrl: string;
  wsUrl: string;
  useMock: boolean;
  wsAuthMode: WebSocketAuthMode;
  costPerKwh: number;
  currencySymbol: string;
};

/**
 * Centralized app configuration.
 *
 * - Do not hardcode secrets in the app bundle.
 * - Use Expo public environment variables for runtime configuration.
 */
function parseNumber(value: string | undefined, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

export const appConfig: AppConfig = {
  apiBaseUrl: process.env.EXPO_PUBLIC_API_BASE_URL ?? 'http://localhost:3000',
  wsUrl: process.env.EXPO_PUBLIC_WS_URL ?? 'ws://localhost:3000/charging/live',
  useMock: (process.env.EXPO_PUBLIC_USE_MOCK ?? 'false').toLowerCase() === 'true',
  wsAuthMode: (process.env.EXPO_PUBLIC_WS_AUTH_MODE ?? 'header') as WebSocketAuthMode,
  costPerKwh: parseNumber(process.env.EXPO_PUBLIC_COST_PER_KWH, 6),
  currencySymbol: process.env.EXPO_PUBLIC_CURRENCY_SYMBOL ?? '₹',
};
