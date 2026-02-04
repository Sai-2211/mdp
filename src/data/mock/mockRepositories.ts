import EventEmitter from 'eventemitter3';

import type { AuthRepository } from '../../domain/repositories/authRepository';
import type { ChargerRepository, StartChargingResult } from '../../domain/repositories/chargerRepository';
import type { SessionsRepository } from '../../domain/repositories/sessionsRepository';
import type { LiveChargingRepository, LiveChargingUnsubscribe } from '../../domain/repositories/liveChargingRepository';
import type { ChargingSession } from '../../domain/entities/session';
import type { ChargerStatus } from '../../domain/entities/charger';
import type { LiveConnectionState, LiveChargingTelemetry } from '../../domain/entities/liveCharging';

import { mockBackendState } from './mockBackendState';

export class MockAuthRepository implements AuthRepository {
  async register(): Promise<{ accessToken: string }> {
    return { accessToken: 'mock-token' };
  }

  async login(): Promise<{ accessToken: string }> {
    return { accessToken: 'mock-token' };
  }
}

export class MockChargerRepository implements ChargerRepository {
  async getStatus(): Promise<ChargerStatus> {
    return mockBackendState.getStatus();
  }

  async startCharging(): Promise<StartChargingResult> {
    const { sessionId } = mockBackendState.startCharging();
    return { sessionId };
  }

  async stopCharging(): Promise<void> {
    mockBackendState.stopCharging('user_stop');
  }
}

export class MockSessionsRepository implements SessionsRepository {
  async listSessions(): Promise<ChargingSession[]> {
    return mockBackendState.listSessions();
  }

  async getSession(sessionId: string): Promise<ChargingSession> {
    return mockBackendState.getSession(sessionId);
  }
}

export class MockLiveChargingRepository implements LiveChargingRepository {
  private readonly events = new EventEmitter();
  private state: LiveConnectionState = 'disconnected';
  private timer: ReturnType<typeof setInterval> | null = null;

  async connect(): Promise<void> {
    if (this.state === 'connected' || this.state === 'connecting') return;
    this.setState('connecting');
    // Simulate instant connect.
    this.setState('connected');
    if (!this.timer) {
      this.timer = setInterval(() => {
        const telemetry = mockBackendState.tick();
        this.events.emit('data', telemetry);
      }, 1000);
    }
  }

  disconnect(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.setState('disconnected');
  }

  getConnectionState(): LiveConnectionState {
    return this.state;
  }

  onConnectionStateChange(listener: (state: LiveConnectionState) => void): LiveChargingUnsubscribe {
    this.events.on('state', listener);
    return () => this.events.off('state', listener);
  }

  subscribe(listener: (data: LiveChargingTelemetry) => void): LiveChargingUnsubscribe {
    this.events.on('data', listener);
    return () => this.events.off('data', listener);
  }

  private setState(next: LiveConnectionState) {
    if (this.state === next) return;
    this.state = next;
    this.events.emit('state', next);
  }
}

