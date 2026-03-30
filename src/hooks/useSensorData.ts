import { useEffect, useState } from 'react';
import { collection, doc, onSnapshot, type FirebaseFirestoreTypes } from '@react-native-firebase/firestore';

import { appConfig } from '../config/appConfig';
import { getFirestoreDb, isFirebaseNativeAvailable } from '../config/firebase';
import { mockBackendState } from '../data/mock/mockBackendState';

type WrappedFieldKey =
  | 'doubleValue'
  | 'booleanValue'
  | 'timestampValue'
  | 'stringValue'
  | 'integerValue';

type WrappedField = Partial<Record<WrappedFieldKey, unknown>>;
type SensorDocument = Partial<Record<keyof SensorData, unknown>>;

export type SensorTimestamp = FirebaseFirestoreTypes.Timestamp | Date | string;

export type SensorData = {
  temperature: number;
  voltage: number;
  current: number;
  power: number;
  relay: boolean;
  timestamp: SensorTimestamp;
  soc: number;
  profile: string;
  targetSoC: number;
  stopReason: string;
  socStopActive: boolean;
  faultTemp: boolean;
  faultVoltage: boolean;
  faultCurrent: boolean;
  faultSoC: boolean;
  energyWh: number;
  elapsedSeconds: number;
  tempLimit: number;
  buzzerActive: boolean;
};

let mockListeners = new Set<(value: SensorData) => void>();
let mockTimer: ReturnType<typeof setInterval> | null = null;
let lastMockValue: SensorData = createMockSensorData(false);

function unwrapField<T>(field: unknown, expectedType: WrappedFieldKey, fallback: T): T {
  if (field === undefined || field === null) {
    return fallback;
  }

  if (typeof field === 'object' && field !== null && expectedType in (field as WrappedField)) {
    return ((field as WrappedField)[expectedType] as T | undefined) ?? fallback;
  }

  return field as T;
}

function toSensorData(raw: SensorDocument): SensorData {
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

function createMockSensorData(advance: boolean): SensorData {
  const telemetry = advance ? mockBackendState.tick() : mockBackendState.getLiveTelemetrySnapshot();
  const temperatureBase = telemetry.chargerState === 'charging' ? 34.5 : 29.5;

  return {
    temperature: temperatureBase,
    voltage: telemetry.voltage,
    current: telemetry.current,
    power: telemetry.power,
    relay: telemetry.chargerState === 'charging',
    timestamp: new Date(),
    soc: telemetry.batteryPercent,
    profile: 'car',
    targetSoC: 100,
    stopReason: 'none',
    socStopActive: false,
    faultTemp: false,
    faultVoltage: false,
    faultCurrent: false,
    faultSoC: false,
    energyWh: telemetry.energyWh,
    elapsedSeconds: telemetry.elapsedSeconds,
    tempLimit: 40,
    buzzerActive: false,
  };
}

function startMockLoop() {
  if (mockTimer) return;

  mockTimer = setInterval(() => {
    lastMockValue = createMockSensorData(true);
    mockListeners.forEach((listener) => listener(lastMockValue));
  }, 1000);
}

function stopMockLoopIfIdle() {
  if (mockListeners.size || !mockTimer) return;
  clearInterval(mockTimer);
  mockTimer = null;
}

function subscribeToMockSensor(listener: (value: SensorData) => void) {
  mockListeners.add(listener);
  listener(lastMockValue);
  startMockLoop();

  return () => {
    mockListeners.delete(listener);
    stopMockLoopIfIdle();
  };
}

export function useSensorData() {
  const [data, setData] = useState<SensorData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const useMockSensorFeed = appConfig.useMock || !isFirebaseNativeAvailable();

    if (useMockSensorFeed) {
      // Share a single mock timer across screens so live values stay in sync.
      const unsubscribe = subscribeToMockSensor((value) => {
        setData(value);
        setLoading(false);
        setError(null);
      });

      return () => unsubscribe();
    }

    try {
      const db = getFirestoreDb();

      const unsubscribe = onSnapshot(
        doc(collection(db, 'device'), 'status'),
        (snap) => {
          setLoading(false);
          if (!snap.exists()) {
            setData(null);
            return;
          }

          setData(toSensorData(snap.data() as SensorDocument));
          setError(null);
        },
        (snapshotError) => {
          setLoading(false);
          setError(snapshotError.message);
        },
      );

      return () => unsubscribe();
    } catch (firebaseError) {
      setLoading(false);
      setError(firebaseError instanceof Error ? firebaseError.message : 'Failed to connect to sensor data');
    }
  }, []);

  return { data, loading, error };
}
