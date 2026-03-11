import React, { createContext, useContext, useMemo } from 'react';

import { useAuth as useFirebaseAuth } from '../../context/AuthContext';

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
  const { user, loading, signOut } = useFirebaseAuth();

  const state: AuthState = useMemo(
    () => ({
      status: loading ? 'restoring' : user ? 'authenticated' : 'unauthenticated',
      accessToken: user ? user.uid : null,
      email: user?.email ?? null,
    }),
    [loading, user],
  );

  const value: AuthContextValue = useMemo(
    () => ({
      state,
      setSession: async () => Promise.resolve(), // legacy API no-op; Firebase handles session
      clearSession: async () => {
        await signOut();
      },
    }),
    [state, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
