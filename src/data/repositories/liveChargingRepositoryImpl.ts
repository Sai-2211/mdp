import type { LiveChargingRepository } from '../../domain/repositories/liveChargingRepository';
import type { LiveConnectionState, LiveChargingTelemetry } from '../../domain/entities/liveCharging';

import { LiveChargingSocket } from '../ws/liveChargingSocket';

export class LiveChargingRepositoryImpl implements LiveChargingRepository {
  constructor(private readonly socket: LiveChargingSocket) {}

  connect(): Promise<void> {
    return this.socket.connect();
  }

  disconnect(): void {
    this.socket.disconnect();
  }

  getConnectionState(): LiveConnectionState {
    return this.socket.getConnectionState();
  }

  onConnectionStateChange(listener: (state: LiveConnectionState) => void) {
    return this.socket.onConnectionStateChange(listener);
  }

  subscribe(listener: (data: LiveChargingTelemetry) => void) {
    return this.socket.subscribe(listener);
  }
}

