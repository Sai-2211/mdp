import type { ChargerState, ChargerStatus } from '../../domain/entities/charger';
import type { ChargingSession } from '../../domain/entities/session';
import type { LiveChargingTelemetry } from '../../domain/entities/liveCharging';

function randomId(prefix: string) {
  return `${prefix}_${Math.random().toString(16).slice(2)}_${Date.now().toString(16)}`;
}

export class MockBackendState {
  online = true;
  chargerState: ChargerState = 'idle';

  currentSessionId: string | null = null;
  currentSessionStart: Date | null = null;
  currentEnergyWh = 0;
  currentElapsedSeconds = 0;

  // Used only to simulate backend estimation for mock mode.
  batteryCapacityWh = 5000;

  sessions: ChargingSession[] = [
    {
      sessionId: randomId('sess'),
      startTime: new Date(Date.now() - 1000 * 60 * 60 * 26),
      endTime: new Date(Date.now() - 1000 * 60 * 60 * 25.5),
      energyWh: 420,
      elapsedSeconds: 60 * 30,
      stopReason: 'user_stop',
    },
    {
      sessionId: randomId('sess'),
      startTime: new Date(Date.now() - 1000 * 60 * 60 * 5),
      endTime: new Date(Date.now() - 1000 * 60 * 60 * 4.8),
      energyWh: 180,
      elapsedSeconds: 60 * 12,
      stopReason: 'charger_error',
    },
  ].sort((a, b) => b.startTime.getTime() - a.startTime.getTime());

  getStatus(): ChargerStatus {
    return { online: this.online, state: this.chargerState, lastUpdated: new Date() };
  }

  startCharging(): { sessionId: string } {
    if (!this.online) throw new Error('Charger offline');
    if (this.chargerState === 'charging') return { sessionId: this.currentSessionId ?? randomId('sess') };

    this.chargerState = 'charging';
    this.currentSessionId = randomId('sess');
    this.currentSessionStart = new Date();
    this.currentEnergyWh = 0;
    this.currentElapsedSeconds = 0;
    return { sessionId: this.currentSessionId };
  }

  stopCharging(reason: string = 'user_stop'): void {
    if (this.chargerState !== 'charging') return;
    const sessionId = this.currentSessionId ?? randomId('sess');
    const startTime = this.currentSessionStart ?? new Date(Date.now() - this.currentElapsedSeconds * 1000);
    const endTime = new Date();
    const energyWh = this.currentEnergyWh;
    const elapsedSeconds = this.currentElapsedSeconds;

    this.sessions.unshift({ sessionId, startTime, endTime, energyWh, elapsedSeconds, stopReason: reason });

    this.chargerState = 'idle';
    this.currentSessionId = null;
    this.currentSessionStart = null;
    this.currentEnergyWh = 0;
    this.currentElapsedSeconds = 0;
  }

  tick(): LiveChargingTelemetry {
    // Simple/consistent physics-ish simulation for UI testing.
    const voltage = 230;
    const baseCurrent = this.chargerState === 'charging' ? 7 + Math.sin(this.currentElapsedSeconds / 12) : 0;
    const current = Math.max(0, baseCurrent);
    const power = voltage * current;

    if (this.chargerState === 'charging') {
      this.currentElapsedSeconds += 1;
      this.currentEnergyWh += power / 3600;
    }

    const batteryPercent = Math.min(100, (this.currentEnergyWh / this.batteryCapacityWh) * 100);

    return {
      voltage,
      current,
      power,
      energyWh: this.currentEnergyWh,
      sessionId: this.currentSessionId ?? 'no-session',
      elapsedSeconds: this.currentElapsedSeconds,
      batteryPercent,
      chargerState: this.chargerState === 'charging' ? 'charging' : 'idle',
    };
  }

  listSessions(): ChargingSession[] {
    return [...this.sessions].sort((a, b) => b.startTime.getTime() - a.startTime.getTime());
  }

  getSession(sessionId: string): ChargingSession {
    const found = this.sessions.find((s) => s.sessionId === sessionId);
    if (found) return found;
    // Fallback for unknown session IDs.
    return { sessionId, startTime: new Date(), energyWh: 0 };
  }
}

export const mockBackendState = new MockBackendState();

