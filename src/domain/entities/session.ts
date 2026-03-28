export type ChargingSession = {
  sessionId: string;
  startTime: Date;
  endTime?: Date;
  energyWh: number;
  elapsedSeconds?: number;
  stopReason?: string;
  soc?: number;
  profile?: string;
};

