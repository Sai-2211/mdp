import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

import type { DashboardStackParamList } from './types';
import { DashboardScreen } from '../screens/DashboardScreen';
import { theme } from '../theme/theme';

const Stack = createNativeStackNavigator<DashboardStackParamList>();

export function DashboardStack() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: theme.colors.bg },
        headerTintColor: theme.colors.text,
        headerShadowVisible: false,
        contentStyle: { backgroundColor: theme.colors.bg },
      }}
    >
      <Stack.Screen name="Dashboard" component={DashboardScreen} options={{ title: 'Charger' }} />
    </Stack.Navigator>
  );
}
