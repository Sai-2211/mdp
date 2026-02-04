import { useCallback, useEffect, useMemo, useState } from 'react';

import { ApiError, NetworkError } from '../../core/errors';
import type { ChargingSession } from '../../domain/entities/session';
import { getSessionDetails } from '../../domain/usecases/sessions';
import { useRepositories } from '../state/RepositoriesContext';

function errorToMessage(err: unknown): string {
  if (err instanceof ApiError) return err.message;
  if (err instanceof NetworkError) return 'Backend unavailable. Check your connection.';
  if (err instanceof Error) return err.message;
  return 'Something went wrong';
}

export function useSessionDetailsViewModel(sessionId: string) {
  const { sessionsRepository } = useRepositories();
  const [session, setSession] = useState<ChargingSession | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const next = await getSessionDetails(sessionsRepository, sessionId);
      setSession(next);
    } catch (e) {
      setError(errorToMessage(e));
    } finally {
      setLoading(false);
    }
  }, [sessionId, sessionsRepository]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return useMemo(() => ({ session, loading, error, refresh }), [session, loading, error, refresh]);
}

