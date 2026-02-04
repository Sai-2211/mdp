import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import type { AuthStackParamList } from '../navigation/types';
import { ErrorBanner } from '../components/ErrorBanner';
import { PrimaryButton } from '../components/PrimaryButton';
import { Screen } from '../components/Screen';
import { TextField } from '../components/TextField';
import { theme } from '../theme/theme';
import { useAuthViewModel } from '../viewModels/useAuthViewModel';

type Props = NativeStackScreenProps<AuthStackParamList, 'Register'>;

export function RegisterScreen({ navigation }: Props) {
  const vm = useAuthViewModel();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  return (
    <Screen contentStyle={styles.content}>
      <View style={styles.header}>
        <Text style={styles.title}>Create account</Text>
        <Text style={styles.subtitle}>Secure access is required before charging control.</Text>
        {vm.backendMode === 'mock' ? <Text style={styles.mock}>Mock mode enabled</Text> : null}
      </View>

      <View style={styles.form}>
        {vm.error ? <ErrorBanner message={vm.error} /> : null}
        <TextField label="Email" value={email} onChangeText={setEmail} placeholder="you@example.com" keyboardType="email-address" />
        <TextField label="Password" value={password} onChangeText={setPassword} placeholder="At least 6 characters" secureTextEntry />
        <PrimaryButton title="Register" onPress={() => void vm.register(email, password)} loading={vm.loading} />
      </View>

      <View style={styles.footer}>
        <Text style={styles.footerText}>Already have an account?</Text>
        <Pressable onPress={() => navigation.navigate('Login')}>
          <Text style={styles.link}>Login</Text>
        </Pressable>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { justifyContent: 'center', gap: theme.spacing.lg },
  header: { gap: 6 },
  title: { color: theme.colors.text, fontSize: 28, fontWeight: '900' },
  subtitle: { color: theme.colors.muted, fontWeight: '600' },
  mock: { color: theme.colors.warning, fontWeight: '800', marginTop: 10 },
  form: { gap: theme.spacing.sm },
  footer: { flexDirection: 'row', gap: 8, justifyContent: 'center', marginTop: theme.spacing.md },
  footerText: { color: theme.colors.muted, fontWeight: '600' },
  link: { color: theme.colors.primary, fontWeight: '800' },
});

