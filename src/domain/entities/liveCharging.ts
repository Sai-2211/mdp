import type { ChargerState } from './charger';

export type LiveChargingTelemetry = {
  voltage: number;
  current: number;
  power: number;
  energyWh: number;
  sessionId: string;
  elapsedSeconds: number;
  batteryPercent: number;
  chargerState: Extract<ChargerState, 'idle' | 'charging'>;
};

export type LiveConnectionState = 'disconnected' | 'connecting' | 'connected' | 'error';

