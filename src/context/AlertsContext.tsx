import React, { createContext, useEffect, useRef } from 'react';
import { Alert } from 'react-native';
import {
  collection,
  doc,
  getDocs,
  limit,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  where,
} from '@react-native-firebase/firestore';

import { appConfig } from '../config/appConfig';
import { getFirestoreDb, isFirebaseNativeAvailable } from '../config/firebase';
import { mockBackendState } from '../data/mock/mockBackendState';
import { useSensorData } from '../hooks/useSensorData';

type AlertFlags = {
  lowBattery: boolean;
};

const AlertsContext = createContext<null>(null);

export function AlertsProvider({ children }: { children: React.ReactNode }) {
  const { data } = useSensorData();
  const flags = useRef<AlertFlags>({ lowBattery: false });
  const sessionEndedRef = useRef(false);

  const acknowledgeProtectedWarning = async () => {
    try {
      if (appConfig.useMock || !isFirebaseNativeAvailable()) {
        return;
      }

      const db = getFirestoreDb();
      await setDoc(
        doc(collection(db, 'device'), 'command'),
        {
          relay: false,
          warningAcknowledged: true,
        },
        { merge: true },
      );
    } catch (e) {
      console.error('[Alert] Warning acknowledge failed:', e);
    }
  };

  const endChargingSession = async (reason: string) => {
    try {
      if (appConfig.useMock || !isFirebaseNativeAvailable()) {
        mockBackendState.stopCharging(reason);
        return;
      }

      const db = getFirestoreDb();
      const snapshot = await getDocs(
        query(
          collection(db, 'charging_sessions'),
          where('status', '==', 'active'),
          orderBy('startTime', 'desc'),
          limit(1),
        ),
      );

      if (!snapshot.empty) {
        const latestSessionRef = snapshot.docs[0].ref;
        await setDoc(
          latestSessionRef,
          {
            status: 'completed',
            endTime: serverTimestamp(),
            stopReason: reason,
            finalSoC: data?.soc ?? 0,
            soc: data?.soc ?? 0,
            energyWh: data?.energyWh ?? 0,
            elapsedSeconds: data?.elapsedSeconds ?? 0,
            profile: data?.profile ?? 'car',
          },
          { merge: true },
        );
      }

      await setDoc(
        doc(collection(db, 'device'), 'command'),
        { relay: false },
        { merge: true },
      );
    } catch (e) {
      console.error('[Session] End failed:', e);
    }
  };

  useEffect(() => {
    if (!data) return;

    const { relay, stopReason, targetSoC, soc, temperature, tempLimit } = data;

    if (relay === true) {
      sessionEndedRef.current = false;
    }

    // Low battery alert: soc < 10
    if (soc < 10 && soc > 0 && !flags.current.lowBattery) {
      flags.current.lowBattery = true;
      Alert.alert(
        'Low Battery Warning',
        `Battery below 10% (${soc.toFixed(0)}%).`,
      );
    } else if (soc >= 10) {
      flags.current.lowBattery = false; // Reset
    }

    if (relay === false && !sessionEndedRef.current) {
      if (stopReason === 'soc_reached') {
        sessionEndedRef.current = true;
        Alert.alert(
          'Charging Complete',
          `Target SoC of ${targetSoC}% reached. Charging stopped safely.`,
          [{ text: 'OK' }],
        );
        void endChargingSession('soc_reached');
      } else if (stopReason === 'overheat') {
        sessionEndedRef.current = true;
        Alert.alert(
          '⚠ Battery Overheated',
          `Temperature reached ${temperature.toFixed(1)}°C, above the ${tempLimit.toFixed(0)}°C limit. Charging stopped. Tap Acknowledge to turn off the red warning LED.`,
          [{ text: 'Acknowledge', onPress: () => void acknowledgeProtectedWarning() }],
        );
        void endChargingSession('overheat');
      } else if (stopReason === 'overdischarge') {
        sessionEndedRef.current = true;
        Alert.alert(
          '⚠ Battery Critical',
          'Voltage too low. Charging stopped to protect battery.',
          [{ text: 'OK' }],
        );
        void endChargingSession('overdischarge');
      }
    }
  }, [data]);

  return <AlertsContext.Provider value={null}>{children}</AlertsContext.Provider>;
}
