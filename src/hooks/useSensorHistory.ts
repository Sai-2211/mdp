import { useCallback, useEffect, useState } from 'react';
import {
  collection,
  getDocs,
  limit,
  orderBy,
  query,
  type FirebaseFirestoreTypes,
} from '@react-native-firebase/firestore';

import { appConfig } from '../config/appConfig';
import { getFirestoreDb, isFirebaseNativeAvailable } from '../config/firebase';
import { mockBackendState } from '../data/mock/mockBackendState';
import type { SensorData, SensorTimestamp } from './useSensorData';

type WrappedFieldKey = 'doubleValue' | 'booleanValue' | 'timestampValue' | 'stringValue' | 'integerValue';
type WrappedField = Partial<Record<WrappedFieldKey, unknown>>;
type SensorHistoryDocument = Partial<Record<keyof SensorHistoryItem, unknown>>;

export type SensorHistoryItem = SensorData;

function unwrapField<T>(field: unknown, expectedType: WrappedFieldKey, fallback: T): T {
  if (field === undefined || field === null) {
    return fallback;
  }

  if (typeof field === 'object' && field !== null && expectedType in (field as WrappedField)) {
    return ((field as WrappedField)[expectedType] as T | undefined) ?? fallback;
  }

  return field as T;
}

function toHistoryItem(raw: SensorHistoryDocument): SensorHistoryItem {
  return {
    temperature: Number(unwrapField(raw.temperature, 'doubleValue', 0)),
    voltage: Number(unwrapField(raw.voltage, 'doubleValue', 0)),
    current: Number(unwrapField(raw.current, 'doubleValue', 0)),
    power: Number(unwrapField(raw.power, 'doubleValue', 0)),
    relay: Boolean(unwrapField(raw.relay, 'booleanValue', false)),
    timestamp: unwrapField<SensorTimestamp>(raw.timestamp, 'timestampValue', new Date()),
    soc: Number(unwrapField(raw.soc, 'doubleValue', 0)),
    profile: String(unwrapField(raw.profile, 'stringValue', 'car')),
    targetSoC: Number(unwrapField(raw.targetSoC, 'doubleValue', 95)),
    stopReason: String(unwrapField(raw.stopReason, 'stringValue', 'none')),
    socStopActive: Boolean(unwrapField(raw.socStopActive, 'booleanValue', false)),
    faultTemp: Boolean(unwrapField(raw.faultTemp, 'booleanValue', false)),
    faultVoltage: Boolean(unwrapField(raw.faultVoltage, 'booleanValue', false)),
    faultCurrent: Boolean(unwrapField(raw.faultCurrent, 'booleanValue', false)),
    faultSoC: Boolean(unwrapField(raw.faultSoC, 'booleanValue', false)),
    energyWh: Number(unwrapField(raw.energyWh, 'doubleValue', 0)),
    elapsedSeconds: Number(unwrapField(raw.elapsedSeconds, 'integerValue', 0)),
    tempLimit: Number(unwrapField(raw.tempLimit, 'doubleValue', 40)),
    buzzerActive: Boolean(unwrapField(raw.buzzerActive, 'booleanValue', false)),
  };
}

function toMockHistory(): SensorHistoryItem[] {
  return mockBackendState.listSessions().slice(0, 50).map((session) => ({
    temperature: 0,
    voltage: 230,
    current: 0,
    power: 0,
    relay: false,
    timestamp: (session.endTime ?? session.startTime) as FirebaseFirestoreTypes.Timestamp | Date,
    soc: 100,
    profile: 'car',
    targetSoC: 100,
    stopReason: session.stopReason ?? 'none',
    socStopActive: false,
    faultTemp: false,
    faultVoltage: false,
    faultCurrent: false,
    faultSoC: false,
    energyWh: session.energyWh ?? 0,
    elapsedSeconds: session.elapsedSeconds ?? 0,
    tempLimit: 40,
    buzzerActive: false,
  }));
}

export function useSensorHistory() {
  const [history, setHistory] = useState<SensorHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchHistory = useCallback(async () => {
    setLoading(true);
    setError(null);

    const useMockHistory = appConfig.useMock || !isFirebaseNativeAvailable();
    if (useMockHistory) {
      setHistory(toMockHistory());
      setLoading(false);
      return;
    }

    try {
      const db = getFirestoreDb();
      const historyQuery = query(collection(db, 'readings'), orderBy('timestamp', 'desc'), limit(50));
      const snapshot = await getDocs(historyQuery);
      setHistory(
        snapshot.docs.map((item: FirebaseFirestoreTypes.QueryDocumentSnapshot) =>
          toHistoryItem(item.data() as SensorHistoryDocument),
        ),
      );
    } catch (historyError) {
      const message =
        historyError instanceof Error ? historyError.message : 'Failed to load sensor history';
      setError(message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchHistory();
  }, [fetchHistory]);

  return { history, loading, error, refresh: fetchHistory };
}
