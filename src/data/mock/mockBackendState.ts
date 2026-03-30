import type { ChargerState, ChargerStatus } from '../../domain/entities/charger';
import type { ChargingSession } from '../../domain/entities/session';
import type { LiveChargingTelemetry } from '../../domain/entities/liveCharging';

function envNumber(value: string | undefined, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

const BATTERY_CAPACITY_WH = envNumber(process.env.EXPO_PUBLIC_BATTERY_CAPACITY_WH, 5000);
const BATTERY_CAPACITY_KWH = envNumber(process.env.EXPO_PUBLIC_BATTERY_CAPACITY_KWH, BATTERY_CAPACITY_WH / 1000);
const MAX_CHARGING_POWER_KW = envNumber(process.env.EXPO_PUBLIC_MAX_CHARGING_POWER_KW, 3.3);

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
  batteryCapacityWh = Math.max(50, BATTERY_CAPACITY_KWH * 1000);

  sessions: ChargingSession[] = [
    {
      sessionId: randomId('sess'),
      startTime: new Date(Date.now() - 1000 * 60 * 60 * 26),
      endTime: new Date(Date.now() - 1000 * 60 * 60 * 25.5),
      energyWh: 420,
      elapsedSeconds: 60 * 30,
      startSoC: 18,
      finalSoC: 60,
      soc: 60,
      profile: 'scooter',
      stopReason: 'user_stop',
    },
    {
      sessionId: randomId('sess'),
      startTime: new Date(Date.now() - 1000 * 60 * 60 * 5),
      endTime: new Date(Date.now() - 1000 * 60 * 60 * 4.8),
      energyWh: 180,
      elapsedSeconds: 60 * 12,
      startSoC: 42,
      finalSoC: 55,
      soc: 55,
      profile: 'bike',
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
    const finalSoC = Math.min(100, (energyWh / this.batteryCapacityWh) * 100);

    this.sessions.unshift({
      sessionId,
      startTime,
      endTime,
      energyWh,
      elapsedSeconds,
      startSoC: 0,
      finalSoC,
      soc: finalSoC,
      profile: 'car',
      stopReason: reason,
    });

    this.chargerState = 'idle';
    this.currentSessionId = null;
    this.currentSessionStart = null;
    this.currentEnergyWh = 0;
    this.currentElapsedSeconds = 0;
  }

  private buildTelemetry(advance: boolean): LiveChargingTelemetry {
    // Simple/consistent physics-ish simulation for UI testing.
    const voltage = 230;
    const maxKw = Math.max(0.5, MAX_CHARGING_POWER_KW);
    const basePowerKw =
      this.chargerState === 'charging'
        ? maxKw * (0.65 + 0.25 * Math.sin(this.currentElapsedSeconds / 7) + 0.1 * Math.sin(this.currentElapsedSeconds / 3.5))
        : 0;
    const powerKw = Math.max(0, Math.min(maxKw, basePowerKw));
    const power = powerKw * 1000;
    const current = power / voltage;

    if (advance && this.chargerState === 'charging') {
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

  getLiveTelemetrySnapshot(): LiveChargingTelemetry {
    return this.buildTelemetry(false);
  }

  tick(): LiveChargingTelemetry {
    return this.buildTelemetry(true);
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
