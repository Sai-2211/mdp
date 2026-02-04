import React from 'react';
import { DefaultTheme, NavigationContainer } from '@react-navigation/native';

import { useAuth } from '../state/AuthContext';
import { AuthStack } from './AuthStack';
import { AppTabs } from './AppTabs';
import { SplashScreen } from '../screens/SplashScreen';
import { theme } from '../theme/theme';

const navTheme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    background: theme.colors.bg,
    card: theme.colors.bg,
    text: theme.colors.text,
    border: theme.colors.border,
    primary: theme.colors.primary,
  },
};

export function RootNavigator() {
  const { state } = useAuth();

  if (state.status === 'restoring') {
    return <SplashScreen />;
  }

  return (
    <NavigationContainer theme={navTheme}>
      {state.status === 'authenticated' ? <AppTabs /> : <AuthStack />}
    </NavigationContainer>
  );
}
