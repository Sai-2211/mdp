import { useEffect, useState } from 'react';
import firestore, { FirebaseFirestoreTypes } from '@react-native-firebase/firestore';

export type SensorData = {
  temperature: number;
  voltage: number;
  current: number;
  power: number;
  relay: boolean;
  timestamp: FirebaseFirestoreTypes.Timestamp;
};

export function useSensorData() {
  const [data, setData] = useState<SensorData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribe = firestore()
      .collection('device')
      .doc('status')
      .onSnapshot(
        (snap) => {
          setLoading(false);
          if (!snap.exists) {
            setData(null);
            return;
          }
          const payload = snap.data() as SensorData | undefined;
          setData(payload ?? null);
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
