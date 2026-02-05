import { useEffect, useMemo, useState } from 'react';

import type { LiveChargingTelemetry } from '../../domain/entities/liveCharging';
import { useRepositories } from '../state/RepositoriesContext';

export function useLiveChargingViewModel({ autoConnect }: { autoConnect: boolean }) {
  const { liveChargingRepository } = useRepositories();

  const [connectionState, setConnectionState] = useState(liveChargingRepository.getConnectionState());
  const [latest, setLatest] = useState<LiveChargingTelemetry | null>(null);

  useEffect(() => {
    const unsubState = liveChargingRepository.onConnectionStateChange(setConnectionState);
    const unsubData = liveChargingRepository.subscribe((data) => {
      setLatest(data);
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
    }),
    [connectionState, latest],
  );
}
