import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';

import type { AppTabParamList } from './types';
import { DashboardStack } from './DashboardStack';
import { HistoryStack } from './HistoryStack';
import { VehicleProfileScreen } from '../screens/VehicleProfileScreen';
import { SettingsScreen } from '../screens/SettingsScreen';
import { ProfileScreen } from '../screens/ProfileScreen';
import { theme } from '../theme/theme';

const Tab = createBottomTabNavigator<AppTabParamList>();

const tabIcons: Record<string, string> = {
  DashboardTab: 'flash',
  HistoryTab: 'time',
  VehicleProfileTab: 'car',
  SettingsTab: 'settings',
  Profile: 'person',
};

export function AppTabs() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarStyle: { backgroundColor: theme.colors.card, borderTopColor: theme.colors.border },
        tabBarActiveTintColor: theme.colors.primary,
        tabBarInactiveTintColor: theme.colors.muted,
        tabBarIcon: ({ color, size }) => {
          const name = tabIcons[route.name] ?? 'ellipse';
          return <Ionicons name={name as any} size={size} color={color} />;
        },
      })}
    >
      <Tab.Screen name="DashboardTab" component={DashboardStack} options={{ title: 'Charger' }} />
      <Tab.Screen name="VehicleProfileTab" component={VehicleProfileScreen} options={{ title: 'Vehicle' }} />
      <Tab.Screen name="HistoryTab" component={HistoryStack} options={{ title: 'History' }} />
      <Tab.Screen name="SettingsTab" component={SettingsScreen} options={{ title: 'Settings' }} />
      <Tab.Screen name="Profile" component={ProfileScreen} options={{ title: 'Profile' }} />
    </Tab.Navigator>
  );
}
