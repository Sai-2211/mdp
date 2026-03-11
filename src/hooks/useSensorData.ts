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
