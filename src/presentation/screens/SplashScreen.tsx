import React from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { appConfig } from '../../config/appConfig';
import { Screen } from '../components/Screen';
import { theme } from '../theme/theme';

export function SplashScreen() {
  return (
    <Screen contentStyle={styles.content}>
      <View style={styles.center}>
        <Text style={styles.title}>Mini EV Charger</Text>
        <Text style={styles.subtitle}>Secure Mobile App (MVP)</Text>
        <ActivityIndicator color={theme.colors.primary} style={{ marginTop: theme.spacing.lg }} />
        {appConfig.useMock ? <Text style={styles.mock}>Mock mode enabled</Text> : null}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { justifyContent: 'center' },
  center: { alignItems: 'center' },
  title: { color: theme.colors.text, fontSize: 26, fontWeight: '800' },
  subtitle: { color: theme.colors.muted, marginTop: 6, fontWeight: '600' },
  mock: { color: theme.colors.warning, marginTop: theme.spacing.lg, fontWeight: '700' },
});

