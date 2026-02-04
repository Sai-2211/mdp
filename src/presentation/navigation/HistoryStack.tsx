import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

import type { HistoryStackParamList } from './types';
import { theme } from '../theme/theme';
import { SessionDetailsScreen } from '../screens/SessionDetailsScreen';
import { SessionHistoryScreen } from '../screens/SessionHistoryScreen';

const Stack = createNativeStackNavigator<HistoryStackParamList>();

export function HistoryStack() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: theme.colors.bg },
        headerTintColor: theme.colors.text,
        contentStyle: { backgroundColor: theme.colors.bg },
      }}
    >
      <Stack.Screen name="SessionHistory" component={SessionHistoryScreen} options={{ title: 'Sessions' }} />
      <Stack.Screen name="SessionDetails" component={SessionDetailsScreen} options={{ title: 'Session Details' }} />
    </Stack.Navigator>
  );
}

