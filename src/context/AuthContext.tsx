import React, { createContext, useCallback, useContext, useEffect, useMemo, useReducer } from 'react';
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut as firebaseSignOut,
  GoogleAuthProvider,
  signInWithCredential,
  type FirebaseAuthTypes,
} from '@react-native-firebase/auth';
import { GoogleSignin } from '@react-native-google-signin/google-signin';

import { appConfig } from '../config/appConfig';
import {
  getFirebaseAuth,
  getFirebaseRuntimeStatus,
  googleWebClientId,
} from '../config/firebase';

export type AuthUser = {
  uid: string;
  email: string | null;
  displayName: string | null;
  isDemoUser: boolean;
};

type AuthState = {
  user: AuthUser | null;
  loading: boolean;
  error: string | null;
};

type Action =
  | { type: 'SET_USER'; user: AuthUser | null }
  | { type: 'SET_LOADING'; loading: boolean }
  | { type: 'SET_ERROR'; error: string | null };

type AuthMode = 'firebase' | 'demo';

type AuthContextValue = {
  user: AuthUser | null;
  loading: boolean;
  error: string | null;
  mode: AuthMode;
  statusMessage: string | null;
  canUseGoogleSignIn: boolean;
  signIn: (email: string, password: string) => Promise<string | null>;
  signUp: (email: string, password: string) => Promise<string | null>;
  signInWithGoogle: () => Promise<string | null>;
  signOut: () => Promise<string | null>;
};

const initialState: AuthState = { user: null, loading: true, error: null };

function reducer(state: AuthState, action: Action): AuthState {
  switch (action.type) {
    case 'SET_USER':
      return { ...state, user: action.user, loading: false, error: null };
    case 'SET_LOADING':
      return { ...state, loading: action.loading };
    case 'SET_ERROR':
      return { ...state, error: action.error };
    default:
      return state;
  }
}

function toAuthUser(user: FirebaseAuthTypes.User): AuthUser {
  return {
    uid: user.uid,
    email: user.email ?? null,
    displayName: user.displayName ?? null,
    isDemoUser: false,
  };
}

function createDemoUser(email: string): AuthUser {
  const trimmedEmail = email.trim().toLowerCase();
  const displayName = trimmedEmail.includes('@') ? trimmedEmail.split('@')[0] : trimmedEmail;

  return {
    uid: `demo-${displayName || 'user'}`,
    email: trimmedEmail || null,
    displayName: displayName || 'Demo User',
    isDemoUser: true,
  };
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initialState);

  const firebaseStatus = getFirebaseRuntimeStatus();
  const demoMode = appConfig.useMock || !firebaseStatus.available;
  const mode: AuthMode = demoMode ? 'demo' : 'firebase';
  const statusMessage = useMemo(() => {
    if (appConfig.useMock) {
      return 'Mock mode is enabled. Sign in locally to preview the charger UI.';
    }

    if (!firebaseStatus.available) {
      return firebaseStatus.message;
    }

    return null;
  }, [firebaseStatus.available, firebaseStatus.message]);

  useEffect(() => {
    if (demoMode) {
      dispatch({ type: 'SET_LOADING', loading: false });
      return;
    }

    try {
      const firebaseAuth = getFirebaseAuth();
      const unsubscribe = onAuthStateChanged(firebaseAuth, (user) => {
        dispatch({ type: 'SET_USER', user: user ? toAuthUser(user) : null });
      });

      return () => unsubscribe();
    } catch (error) {
      dispatch({
        type: 'SET_ERROR',
        error: error instanceof Error ? error.message : 'Failed to initialize Firebase Auth',
      });
      dispatch({ type: 'SET_LOADING', loading: false });
    }
  }, [demoMode]);

  const signIn = useCallback(
    async (email: string, password: string) => {
      dispatch({ type: 'SET_LOADING', loading: true });
      try {
        if (demoMode) {
          dispatch({ type: 'SET_USER', user: createDemoUser(email) });
          dispatch({ type: 'SET_ERROR', error: null });
          return null;
        }

        await signInWithEmailAndPassword(getFirebaseAuth(), email, password);
        dispatch({ type: 'SET_ERROR', error: null });
        return null;
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : 'Sign-in failed';
        dispatch({ type: 'SET_ERROR', error: msg });
        return msg;
      } finally {
        dispatch({ type: 'SET_LOADING', loading: false });
      }
    },
    [demoMode],
  );

  const signUp = useCallback(
    async (email: string, password: string) => {
      dispatch({ type: 'SET_LOADING', loading: true });
      try {
        if (demoMode) {
          dispatch({ type: 'SET_USER', user: createDemoUser(email) });
          dispatch({ type: 'SET_ERROR', error: null });
          return null;
        }

        await createUserWithEmailAndPassword(getFirebaseAuth(), email, password);
        dispatch({ type: 'SET_ERROR', error: null });
        return null;
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : 'Sign-up failed';
        dispatch({ type: 'SET_ERROR', error: msg });
        return msg;
      } finally {
        dispatch({ type: 'SET_LOADING', loading: false });
      }
    },
    [demoMode],
  );

  const signInWithGoogle = useCallback(async () => {
    dispatch({ type: 'SET_LOADING', loading: true });
    try {
      if (demoMode) {
        throw new Error('Google Sign-In is unavailable in demo mode. Use email sign-in to continue.');
      }

      if (!googleWebClientId) {
        throw new Error('Google Sign-In is not configured. Set EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID before rebuilding the app.');
      }

      await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
      const { data } = await GoogleSignin.signIn();
      if (!data?.idToken) {
        throw new Error('No Google ID token found');
      }

      const googleCredential = GoogleAuthProvider.credential(data.idToken);
      await signInWithCredential(getFirebaseAuth(), googleCredential);
      dispatch({ type: 'SET_ERROR', error: null });
      return null;
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Google Sign-in failed';
      dispatch({ type: 'SET_ERROR', error: msg });
      return msg;
    } finally {
      dispatch({ type: 'SET_LOADING', loading: false });
    }
  }, [demoMode]);

  const signOut = useCallback(async () => {
    dispatch({ type: 'SET_LOADING', loading: true });
    try {
      if (demoMode) {
        dispatch({ type: 'SET_USER', user: null });
        dispatch({ type: 'SET_ERROR', error: null });
        return null;
      }

      await firebaseSignOut(getFirebaseAuth());
      dispatch({ type: 'SET_ERROR', error: null });
      return null;
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Sign-out failed';
      dispatch({ type: 'SET_ERROR', error: msg });
      return msg;
    } finally {
      dispatch({ type: 'SET_LOADING', loading: false });
    }
  }, [demoMode]);

  const value: AuthContextValue = {
    user: state.user,
    loading: state.loading,
    error: state.error,
    mode,
    statusMessage,
    canUseGoogleSignIn: mode === 'firebase' && Boolean(googleWebClientId),
    signIn,
    signUp,
    signInWithGoogle,
    signOut,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used inside AuthProvider');
  }

  return ctx;
}
