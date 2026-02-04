import { useCallback, useMemo, useState } from 'react';

import { ApiError, NetworkError } from '../../core/errors';
import { loginUser, registerUser } from '../../domain/usecases/auth';
import { useAuth } from '../state/AuthContext';
import { useRepositories } from '../state/RepositoriesContext';

function validateEmail(email: string): string | null {
  const trimmed = email.trim();
  if (!trimmed) return 'Email is required';
  if (!trimmed.includes('@')) return 'Enter a valid email address';
  return null;
}

function validatePassword(password: string): string | null {
  if (!password) return 'Password is required';
  if (password.length < 6) return 'Password must be at least 6 characters';
  return null;
}

function errorToMessage(err: unknown): string {
  if (err instanceof ApiError) return err.message;
  if (err instanceof NetworkError) return 'Backend unavailable. Check your connection or enable mock mode.';
  if (err instanceof Error) return err.message;
  return 'Something went wrong';
}

export function useAuthViewModel() {
  const { authRepository, mode } = useRepositories();
  const { setSession } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const validate = useCallback((email: string, password: string): string | null => {
    return validateEmail(email) ?? validatePassword(password);
  }, []);

  const login = useCallback(
    async (email: string, password: string) => {
      const v = validate(email, password);
      if (v) {
        setError(v);
        return;
      }
      setLoading(true);
      setError(null);
      try {
        const result = await loginUser(authRepository, email.trim(), password);
        await setSession({ accessToken: result.accessToken, email: email.trim() });
      } catch (e) {
        setError(errorToMessage(e));
      } finally {
        setLoading(false);
      }
    },
    [authRepository, setSession, validate],
  );

  const register = useCallback(
    async (email: string, password: string) => {
      const v = validate(email, password);
      if (v) {
        setError(v);
        return;
      }
      setLoading(true);
      setError(null);
      try {
        const result = await registerUser(authRepository, email.trim(), password);
        await setSession({ accessToken: result.accessToken, email: email.trim() });
      } catch (e) {
        setError(errorToMessage(e));
      } finally {
        setLoading(false);
      }
    },
    [authRepository, setSession, validate],
  );

  return useMemo(
    () => ({
      backendMode: mode,
      loading,
      error,
      login,
      register,
      clearError: () => setError(null),
    }),
    [mode, loading, error, login, register],
  );
}

