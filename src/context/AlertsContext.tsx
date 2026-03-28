import React, { createContext, useContext, useEffect, useRef } from 'react';
import { Alert } from 'react-native';

import { useSensorData } from '../hooks/useSensorData';

type AlertFlags = {
  overheat: boolean;
  chargingComplete: boolean;
  lowBattery: boolean;
};

const AlertsContext = createContext<null>(null);

export function AlertsProvider({ children }: { children: React.ReactNode }) {
  const { data } = useSensorData();
  const flags = useRef<AlertFlags>({ overheat: false, chargingComplete: false, lowBattery: false });

  useEffect(() => {
    if (!data) return;

    const { temperature, soc, targetSoC, relay } = data;

    // Overheat alert: temperature > 40 and not yet alerted
    if (temperature > 40 && !flags.current.overheat) {
      flags.current.overheat = true;
      Alert.alert(
        'Overheat Warning',
        `Temperature is ${temperature.toFixed(1)}°C — Charging stopped automatically.`,
      );
    } else if (temperature <= 40) {
      flags.current.overheat = false; // Reset when back to normal
    }

    // Charging complete alert: soc >= targetSoC and relay is off
    if (soc >= targetSoC && !relay && !flags.current.chargingComplete) {
      flags.current.chargingComplete = true;
      Alert.alert(
        'Charging Complete',
        `Battery at ${soc.toFixed(0)}%.`,
      );
    } else if (soc < targetSoC || relay) {
      flags.current.chargingComplete = false; // Reset
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
  }, [data]);

  return <AlertsContext.Provider value={null}>{children}</AlertsContext.Provider>;
}
