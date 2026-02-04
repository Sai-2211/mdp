import { useCallback, useMemo, useState } from 'react';

import { ApiError, NetworkError } from '../../core/errors';
import type { ChargingSession } from '../../domain/entities/session';
import { listSessions } from '../../domain/usecases/sessions';
import { useRepositories } from '../state/RepositoriesContext';

function errorToMessage(err: unknown): string {
  if (err instanceof ApiError) return err.message;
  if (err instanceof NetworkError) return 'Backend unavailable. Check your connection.';
  if (err instanceof Error) return err.message;
  return 'Something went wrong';
}

export function useSessionHistoryViewModel() {
  const { sessionsRepository, mode } = useRepositories();
  const [sessions, setSessions] = useState<ChargingSession[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const next = await listSessions(sessionsRepository);
      setSessions(next);
    } catch (e) {
      setError(errorToMessage(e));
    } finally {
      setLoading(false);
    }
  }, [sessionsRepository]);

  const totalEnergyWh = useMemo(() => sessions.reduce((sum, s) => sum + (Number(s.energyWh) || 0), 0), [sessions]);

  return useMemo(
    () => ({ backendMode: mode, sessions, loading, error, refresh, totalEnergyWh }),
    [mode, sessions, loading, error, refresh, totalEnergyWh],
  );
}

