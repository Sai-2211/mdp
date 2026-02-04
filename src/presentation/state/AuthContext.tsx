import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import { clearStoredSession, getStoredSession, storeSession } from '../../data/storage/sessionStorage';

export type AuthStatus = 'restoring' | 'authenticated' | 'unauthenticated';

export type AuthState = {
  status: AuthStatus;
  accessToken: string | null;
  email: string | null;
};

export type AuthContextValue = {
  state: AuthState;
  setSession: (args: { accessToken: string; email?: string }) => Promise<void>;
  clearSession: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthState>({ status: 'restoring', accessToken: null, email: null });

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const stored = await getStoredSession();
        if (cancelled) return;
        if (stored?.accessToken) {
          setState({ status: 'authenticated', accessToken: stored.accessToken, email: stored.email ?? null });
        } else {
          setState({ status: 'unauthenticated', accessToken: null, email: null });
        }
      } catch {
        if (!cancelled) setState({ status: 'unauthenticated', accessToken: null, email: null });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const setSession = useCallback(async (args: { accessToken: string; email?: string }) => {
    await storeSession({ accessToken: args.accessToken, email: args.email });
    setState({ status: 'authenticated', accessToken: args.accessToken, email: args.email ?? null });
  }, []);

  const clearSession = useCallback(async () => {
    await clearStoredSession();
    setState({ status: 'unauthenticated', accessToken: null, email: null });
  }, []);

  const value = useMemo<AuthContextValue>(() => ({ state, setSession, clearSession }), [state, setSession, clearSession]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

