import { useCallback, useEffect, useMemo, useState } from 'react';

import { ApiError, NetworkError } from '../../core/errors';
import { listSessions } from '../../domain/usecases/sessions';
import { useAuth } from '../state/AuthContext';
import { useRepositories } from '../state/RepositoriesContext';

function errorToMessage(err: unknown): string {
  if (err instanceof ApiError) return err.message;
  if (err instanceof NetworkError) return 'Backend unavailable. Check your connection.';
  if (err instanceof Error) return err.message;
  return 'Something went wrong';
}

export function useProfileViewModel() {
  const { state: authState, clearSession } = useAuth();
  const { sessionsRepository, mode } = useRepositories();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [totalEnergyWh, setTotalEnergyWh] = useState<number>(0);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const sessions = await listSessions(sessionsRepository);
      const total = sessions.reduce((sum, s) => sum + (Number(s.energyWh) || 0), 0);
      setTotalEnergyWh(total);
    } catch (e) {
      setError(errorToMessage(e));
    } finally {
      setLoading(false);
    }
  }, [sessionsRepository]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return useMemo(
    () => ({
      backendMode: mode,
      email: authState.email ?? '—',
      totalEnergyWh,
      loading,
      error,
      refresh,
      logout: () => clearSession(),
    }),
    [mode, authState.email, totalEnergyWh, loading, error, refresh, clearSession],
  );
}

