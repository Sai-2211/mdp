export type ChargerState = 'idle' | 'charging' | 'unavailable';

export type ChargerStatus = {
  online: boolean;
  state: ChargerState;
  lastUpdated: Date;
};

