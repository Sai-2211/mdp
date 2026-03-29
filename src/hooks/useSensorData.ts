import { useEffect, useState } from 'react';
import { getFirestore, collection, doc, onSnapshot } from '@react-native-firebase/firestore';
import { getApp } from '@react-native-firebase/app';
import type { FirebaseFirestoreTypes } from '@react-native-firebase/firestore';

export type SensorData = {
  temperature: number;
  voltage: number;
  current: number;
  power: number;
  relay: boolean;
  timestamp: FirebaseFirestoreTypes.Timestamp;
  soc: number;
  profile: string;
  targetSoC: number;
  stopReason: string;
  energyWh: number;
  elapsedSeconds: number;
};

export function useSensorData() {
  const [data, setData] = useState<SensorData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const db = getFirestore(getApp());
    const unsubscribe = onSnapshot(
      doc(collection(db, 'device'), 'status'),
      (snap) => {
        setLoading(false);
        if (!snap.exists()) {
          setData(null);
          return;
        }
        // The ESP32 is using the REST API which nests values like { doubleValue: 25.5 }
        // We need to unwrap these values to match the SensorData type
        const raw = snap.data() || {};
        
        // Helper to extract value regardless of whether it's nested (from ESP32) or flat
        const extractValue = (field: any, expectedType: 'doubleValue' | 'booleanValue' | 'timestampValue' | 'stringValue' | 'integerValue') => {
          if (field === undefined || field === null) return undefined;
          if (typeof field === 'object' && expectedType in field) {
            return field[expectedType];
          }
          return field; // Fallback if it's already flat
        };

        const payload: SensorData = {
          temperature: extractValue(raw.temperature, 'doubleValue') ?? 0,
          voltage: extractValue(raw.voltage, 'doubleValue') ?? 0,
          current: extractValue(raw.current, 'doubleValue') ?? 0,
          power: extractValue(raw.power, 'doubleValue') ?? 0,
          relay: extractValue(raw.relay, 'booleanValue') ?? false,
          timestamp: extractValue(raw.timestamp, 'timestampValue') ?? new Date(),
          soc: extractValue(raw.soc, 'doubleValue') ?? 0,
          profile: extractValue(raw.profile, 'stringValue') ?? 'car',
          targetSoC: extractValue(raw.targetSoC, 'doubleValue') ?? 95,
          stopReason: extractValue(raw.stopReason, 'stringValue') ?? 'none',
          energyWh: extractValue(raw.energyWh, 'doubleValue') ?? 0,
          elapsedSeconds: extractValue(raw.elapsedSeconds, 'integerValue') ?? 0,
        };

        setData(payload);
      },
      (err) => {
        setLoading(false);
        setError(err.message);
      },
    );

    return () => unsubscribe();
  }, []);

  return { data, loading, error };
}
