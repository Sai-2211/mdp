import React from 'react';

import { AlertsProvider } from './context/AlertsContext';
import { AuthProvider } from './presentation/state/AuthContext';
import { RepositoriesProvider } from './presentation/state/RepositoriesContext';
import { RootNavigator } from './presentation/navigation/RootNavigator';

export function AppRoot() {
  return (
    <AuthProvider>
      <RepositoriesProvider>
        <AlertsProvider>
          <RootNavigator />
        </AlertsProvider>
      </RepositoriesProvider>
    </AuthProvider>
  );
}
