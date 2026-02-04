export type AuthStackParamList = {
  Login: undefined;
  Register: undefined;
};

export type DashboardStackParamList = {
  Dashboard: undefined;
  LiveCharging: undefined;
};

export type HistoryStackParamList = {
  SessionHistory: undefined;
  SessionDetails: { sessionId: string };
};

export type AppTabParamList = {
  DashboardTab: undefined;
  HistoryTab: undefined;
  Profile: undefined;
};

