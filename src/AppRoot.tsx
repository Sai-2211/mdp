import React from 'react';

import { AuthProvider } from './presentation/state/AuthContext';
import { RepositoriesProvider } from './presentation/state/RepositoriesContext';
import { RootNavigator } from './presentation/navigation/RootNavigator';

export function AppRoot() {
  return (
    <AuthProvider>
      <RepositoriesProvider>
        <RootNavigator />
      </RepositoriesProvider>
    </AuthProvider>
  );
}

