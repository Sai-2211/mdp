import React from 'react';
import { ActivityIndicator, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AppRoot } from './src/AppRoot';
import { AuthProvider, useAuth } from './src/context/AuthContext';
import { LoginScreen } from './src/screens/LoginScreen';
import { GoogleSignin } from '@react-native-google-signin/google-signin';

GoogleSignin.configure({
  webClientId: '553905450489-n6t3o23sj3hjbptj0t3nqs6b27cua0ro.apps.googleusercontent.com',
});

function AppContent() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator />
      </View>
    );
  }

  if (!user) {
    return <LoginScreen />;
  }

  return <AppRoot />;
}

export default function App() {
  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      <AuthProvider>
        <AppContent />
      </AuthProvider>
    </SafeAreaProvider>
  );
}
