import { useEffect, useMemo, useState } from 'react';

import type { LiveChargingTelemetry } from '../../domain/entities/liveCharging';
import { useRepositories } from '../state/RepositoriesContext';

const MAX_POINTS = 60;

export function useLiveChargingViewModel({ autoConnect }: { autoConnect: boolean }) {
  const { liveChargingRepository } = useRepositories();

  const [connectionState, setConnectionState] = useState(liveChargingRepository.getConnectionState());
  const [latest, setLatest] = useState<LiveChargingTelemetry | null>(null);
  const [powerSeries, setPowerSeries] = useState<number[]>([]);
  const [elapsedSeries, setElapsedSeries] = useState<number[]>([]);

  useEffect(() => {
    const unsubState = liveChargingRepository.onConnectionStateChange(setConnectionState);
    const unsubData = liveChargingRepository.subscribe((data) => {
      setLatest(data);
      setPowerSeries((prev) => [...prev.slice(-MAX_POINTS + 1), Number(data.power) || 0]);
      setElapsedSeries((prev) => [...prev.slice(-MAX_POINTS + 1), Number(data.elapsedSeconds) || 0]);
    });

    if (autoConnect) {
      void liveChargingRepository.connect();
    }

    return () => {
      unsubState();
      unsubData();
      liveChargingRepository.disconnect();
    };
  }, [autoConnect, liveChargingRepository]);

  return useMemo(
    () => ({
      connectionState,
      latest,
      powerSeries,
      elapsedSeries,
      connect: () => liveChargingRepository.connect(),
      disconnect: () => liveChargingRepository.disconnect(),
      clearSeries: () => {
        setPowerSeries([]);
        setElapsedSeries([]);
      },
    }),
    [connectionState, latest, powerSeries, elapsedSeries, liveChargingRepository],
  );
}

