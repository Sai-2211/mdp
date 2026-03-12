import { useCallback, useEffect, useState } from 'react';
import { getFirestore, collection, query, orderBy, limit, getDocs } from '@react-native-firebase/firestore';
import { getApp } from '@react-native-firebase/app';

import type { SensorData } from './useSensorData';

export type SensorHistoryItem = SensorData;

export function useSensorHistory() {
  const [history, setHistory] = useState<SensorHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchHistory = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const db = getFirestore(getApp());
      const q = query(
        collection(db, 'readings'),
        orderBy('timestamp', 'desc'),
        limit(50),
      );
      const snapshot = await getDocs(q);
      
      const extractValue = (field: any, expectedType: 'doubleValue' | 'booleanValue' | 'timestampValue') => {
        if (field === undefined || field === null) return undefined;
        if (typeof field === 'object' && expectedType in field) {
          return field[expectedType];
        }
        return field;
      };

      const items = snapshot.docs.map((d: any) => {
        const raw = d.data() as any;
        return {
          temperature: extractValue(raw.temperature, 'doubleValue') ?? 0,
          voltage: extractValue(raw.voltage, 'doubleValue') ?? 0,
          current: extractValue(raw.current, 'doubleValue') ?? 0,
          power: extractValue(raw.power, 'doubleValue') ?? 0,
          relay: extractValue(raw.relay, 'booleanValue') ?? false,
          timestamp: extractValue(raw.timestamp, 'timestampValue') ?? new Date(),
        } as SensorHistoryItem;
      });
      setHistory(items);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Failed to load history';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchHistory();
  }, [fetchHistory]);

  return { history, loading, error, refresh: fetchHistory };
}
