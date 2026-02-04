import type { ChargingSession } from '../entities/session';

export type SessionsRepository = {
  listSessions(): Promise<ChargingSession[]>;
  getSession(sessionId: string): Promise<ChargingSession>;
};

