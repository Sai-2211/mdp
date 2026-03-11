import { useCallback, useEffect, useState } from 'react';
import firestore, { FirebaseFirestoreTypes } from '@react-native-firebase/firestore';

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
      const snapshot = await firestore()
        .collection('readings')
        .orderBy('timestamp', 'desc')
        .limit(50)
        .get();
      const items = snapshot.docs.map((doc) => doc.data() as SensorHistoryItem);
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
