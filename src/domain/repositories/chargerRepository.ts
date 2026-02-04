import type { ChargerStatus } from '../entities/charger';

export type StartChargingResult = { sessionId?: string };

export type ChargerRepository = {
  getStatus(): Promise<ChargerStatus>;
  startCharging(): Promise<StartChargingResult>;
  stopCharging(): Promise<void>;
};

