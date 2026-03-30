import React from 'react';
import { ActivityIndicator, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GoogleSignin } from '@react-native-google-signin/google-signin';

import { AppRoot } from './src/AppRoot';
import { AuthProvider, useAuth } from './src/context/AuthContext';
import { googleWebClientId } from './src/config/firebase';
import { LoginScreen } from './src/screens/LoginScreen';

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
  React.useEffect(() => {
    if (!googleWebClientId) return;

    // Google Sign-In is configured lazily so missing native modules do not crash app startup.
    try {
      GoogleSignin.configure({
        webClientId: googleWebClientId,
      });
    } catch (error) {
      console.warn('Google Sign-In configuration skipped:', error);
    }
  }, []);

  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      <AuthProvider>
        <AppContent />
      </AuthProvider>
    </SafeAreaProvider>
  );
}
