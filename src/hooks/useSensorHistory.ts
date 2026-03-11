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
      const items = snapshot.docs.map((d) => d.data() as SensorHistoryItem);
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
