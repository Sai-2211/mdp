import React, { createContext, useContext, useMemo, useRef, useEffect } from 'react';

import { appConfig } from '../../config/appConfig';
import { ApiClient } from '../../data/api/apiClient';
import { MockAuthRepository, MockChargerRepository, MockLiveChargingRepository, MockSessionsRepository } from '../../data/mock/mockRepositories';
import { AuthRepositoryImpl } from '../../data/repositories/authRepositoryImpl';
import { ChargerRepositoryFirestore } from '../../data/repositories/chargerRepositoryFirestore';
import { LiveChargingRepositoryImpl } from '../../data/repositories/liveChargingRepositoryImpl';
import { SessionsRepositoryFirestore } from '../../data/repositories/sessionsRepositoryFirestore';
import { LiveChargingSocket } from '../../data/ws/liveChargingSocket';
import type { AuthRepository } from '../../domain/repositories/authRepository';
import type { ChargerRepository } from '../../domain/repositories/chargerRepository';
import type { LiveChargingRepository } from '../../domain/repositories/liveChargingRepository';
import type { SessionsRepository } from '../../domain/repositories/sessionsRepository';
import { useAuth } from './AuthContext';

export type BackendMode = 'real' | 'mock';

export type Repositories = {
  mode: BackendMode;
  authRepository: AuthRepository;
  chargerRepository: ChargerRepository;
  sessionsRepository: SessionsRepository;
  liveChargingRepository: LiveChargingRepository;
};

const RepositoriesContext = createContext<Repositories | null>(null);

export function RepositoriesProvider({ children }: { children: React.ReactNode }) {
  const { state: authState, clearSession } = useAuth();

  const tokenRef = useRef<string | null>(authState.accessToken);
  useEffect(() => {
    tokenRef.current = authState.accessToken;
  }, [authState.accessToken]);

  const apiClient = useMemo(
    () =>
      new ApiClient({
        baseUrl: appConfig.apiBaseUrl,
        getAccessToken: () => tokenRef.current,
        onUnauthorized: () => {
          void clearSession();
        },
      }),
    [clearSession],
  );

  const repositories = useMemo<Repositories>(() => {
    if (appConfig.useMock) {
      return {
        mode: 'mock',
        authRepository: new MockAuthRepository(),
        chargerRepository: new MockChargerRepository(),
        sessionsRepository: new MockSessionsRepository(),
        liveChargingRepository: new MockLiveChargingRepository(),
      };
    }

    const liveSocket = new LiveChargingSocket({
      wsUrl: appConfig.wsUrl,
      authMode: appConfig.wsAuthMode,
      getAccessToken: () => tokenRef.current,
    });

    return {
      mode: 'real',
      authRepository: new AuthRepositoryImpl(apiClient),
      // Charger status and relay control go directly through Firestore.
      chargerRepository: new ChargerRepositoryFirestore(),
      
      // Sessions go directly through Firestore.
      sessionsRepository: new SessionsRepositoryFirestore(),
      
      // MOCK OUT LiveCharging so it doesn't crash from missing WebSocket. 
      // We will phase this out and rely solely on useSensorData.
      liveChargingRepository: new MockLiveChargingRepository(),
    };
  }, [apiClient]);

  return <RepositoriesContext.Provider value={repositories}>{children}</RepositoriesContext.Provider>;
}

export function useRepositories(): Repositories {
  const ctx = useContext(RepositoriesContext);
  if (!ctx) throw new Error('useRepositories must be used within RepositoriesProvider');
  return ctx;
}
