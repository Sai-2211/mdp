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

export function useRecentSessionsViewModel({ limit }: { limit: number }) {
  const { sessionsRepository } = useRepositories();
  const [sessions, setSessions] = useState<ChargingSession[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const all = await listSessions(sessionsRepository);
      setSessions(all.slice(0, Math.max(0, limit)));
    } catch (e) {
      setError(errorToMessage(e));
    } finally {
      setLoading(false);
    }
  }, [limit, sessionsRepository]);

  return useMemo(() => ({ sessions, loading, error, refresh }), [sessions, loading, error, refresh]);
}

