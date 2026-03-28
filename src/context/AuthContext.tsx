import React, { createContext, useCallback, useContext, useEffect, useReducer } from 'react';
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

import { firebaseAuth } from '../config/firebase';

type AuthState = {
  user: FirebaseAuthTypes.User | null;
  loading: boolean;
  error: string | null;
};

type Action =
  | { type: 'SET_USER'; user: FirebaseAuthTypes.User | null }
  | { type: 'SET_LOADING'; loading: boolean }
  | { type: 'SET_ERROR'; error: string | null };

type AuthContextValue = {
  user: FirebaseAuthTypes.User | null;
  loading: boolean;
  error: string | null;
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

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initialState);

  useEffect(() => {
    const unsub = onAuthStateChanged(firebaseAuth, (user) => {
      dispatch({ type: 'SET_USER', user });
    });
    return () => unsub();
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    dispatch({ type: 'SET_LOADING', loading: true });
    try {
      await signInWithEmailAndPassword(firebaseAuth, email, password);
      dispatch({ type: 'SET_ERROR', error: null });
      return null;
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Sign-in failed';
      dispatch({ type: 'SET_ERROR', error: msg });
      return msg;
    } finally {
      dispatch({ type: 'SET_LOADING', loading: false });
    }
  }, []);

  const signUp = useCallback(async (email: string, password: string) => {
    dispatch({ type: 'SET_LOADING', loading: true });
    try {
      await createUserWithEmailAndPassword(firebaseAuth, email, password);
      dispatch({ type: 'SET_ERROR', error: null });
      return null;
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Sign-up failed';
      dispatch({ type: 'SET_ERROR', error: msg });
      return msg;
    } finally {
      dispatch({ type: 'SET_LOADING', loading: false });
    }
  }, []);

  const signInWithGoogle = useCallback(async () => {
    dispatch({ type: 'SET_LOADING', loading: true });
    try {
      await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
      const { data } = await GoogleSignin.signIn();
      if (!data?.idToken) throw new Error('No Google ID token found');
      const googleCredential = GoogleAuthProvider.credential(data.idToken);
      await signInWithCredential(firebaseAuth, googleCredential);
      dispatch({ type: 'SET_ERROR', error: null });
      return null;
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Google Sign-in failed';
      dispatch({ type: 'SET_ERROR', error: msg });
      return msg;
    } finally {
      dispatch({ type: 'SET_LOADING', loading: false });
    }
  }, []);

  const signOut = useCallback(async () => {
    dispatch({ type: 'SET_LOADING', loading: true });
    try {
      await firebaseSignOut(firebaseAuth);
      dispatch({ type: 'SET_ERROR', error: null });
      return null;
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Sign-out failed';
      dispatch({ type: 'SET_ERROR', error: msg });
      return msg;
    } finally {
      dispatch({ type: 'SET_LOADING', loading: false });
    }
  }, []);

  const value: AuthContextValue = {
    user: state.user,
    loading: state.loading,
    error: state.error,
    signIn,
    signUp,
    signInWithGoogle,
    signOut,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
