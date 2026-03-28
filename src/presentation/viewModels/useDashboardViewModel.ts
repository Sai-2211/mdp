import { useCallback, useMemo, useState } from 'react';

import { ApiError, NetworkError } from '../../core/errors';
import type { ChargerStatus } from '../../domain/entities/charger';
import { fetchChargerStatus, startCharging, stopCharging } from '../../domain/usecases/charger';
import { useRepositories } from '../state/RepositoriesContext';

function errorToMessage(err: unknown): string {
  if (err instanceof ApiError) return err.message;
  if (err instanceof NetworkError) return 'Backend unavailable. Check your connection.';
  if (err instanceof Error) return err.message;
  return 'Something went wrong';
}

export function useDashboardViewModel() {
  const { chargerRepository, mode } = useRepositories();
  const [status, setStatus] = useState<ChargerStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState<'start' | 'stop' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async (background = false) => {
    if (!background) setLoading(true);
    setError(null);
    try {
      const next = await fetchChargerStatus(chargerRepository);
      setStatus(next);
    } catch (e) {
      setError(errorToMessage(e));
    } finally {
      if (!background) setLoading(false);
    }
  }, [chargerRepository]);

  const start = useCallback(async () => {
    setActionLoading('start');
    setError(null);
    try {
      await startCharging(chargerRepository);
      await refresh();
    } catch (e) {
      setError(errorToMessage(e));
    } finally {
      setActionLoading(null);
    }
  }, [chargerRepository, refresh]);

  const stop = useCallback(async () => {
    setActionLoading('stop');
    setError(null);
    try {
      await stopCharging(chargerRepository);
      await refresh();
    } catch (e) {
      setError(errorToMessage(e));
    } finally {
      setActionLoading(null);
    }
  }, [chargerRepository, refresh]);

  return useMemo(
    () => ({
      backendMode: mode,
      status,
      loading,
      actionLoading,
      error,
      refresh,
      start,
      stop,
    }),
    [mode, status, loading, actionLoading, error, refresh, start, stop],
  );
}

