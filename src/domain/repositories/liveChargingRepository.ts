import type { LiveChargingTelemetry, LiveConnectionState } from '../entities/liveCharging';

export type LiveChargingUnsubscribe = () => void;

export type LiveChargingRepository = {
  connect(): Promise<void>;
  disconnect(): void;
  getConnectionState(): LiveConnectionState;
  onConnectionStateChange(listener: (state: LiveConnectionState) => void): LiveChargingUnsubscribe;
  subscribe(listener: (data: LiveChargingTelemetry) => void): LiveChargingUnsubscribe;
};

