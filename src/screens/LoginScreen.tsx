import React, { useState } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Platform, StyleSheet, Text, TextInput, View } from 'react-native';

import { useAuth } from '../context/AuthContext';

export function LoginScreen() {
  const { signIn, signUp, loading, error } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);

  const handleSignIn = async () => {
    if (!email || !password) {
      setLocalError('Email and password are required');
      return;
    }
    const res = await signIn(email.trim(), password);
    if (res) setLocalError(res);
  };

  const handleSignUp = async () => {
    if (!email || !password) {
      setLocalError('Email and password are required');
      return;
    }
    const res = await signUp(email.trim(), password);
    if (!res) {
      Alert.alert('Account created', 'You are now signed in.');
    } else {
      setLocalError(res);
    }
  };

  const errText = localError ?? error;

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={styles.card}>
        <Text style={styles.title}>EV Charger Login</Text>

        <TextInput
          style={styles.input}
          placeholder="Email"
          autoCapitalize="none"
          keyboardType="email-address"
          value={email}
          onChangeText={setEmail}
        />
        <TextInput
          style={styles.input}
          placeholder="Password"
          secureTextEntry
          value={password}
          onChangeText={setPassword}
        />

        {loading ? <ActivityIndicator style={{ marginVertical: 12 }} /> : null}
        {errText ? <Text style={styles.error}>{errText}</Text> : null}

        <View style={styles.actions}>
          <Text style={styles.button} onPress={handleSignIn}>
            Sign In
          </Text>
          <Text style={[styles.button, styles.secondary]} onPress={handleSignUp}>
            Create Account
          </Text>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#f6f7fb', padding: 16 },
  card: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: '#fff',
    padding: 20,
    borderRadius: 16,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  title: { fontSize: 22, fontWeight: '800', color: '#0f172a', marginBottom: 16, textAlign: 'center' },
  input: {
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    marginBottom: 12,
    backgroundColor: '#fff',
  },
  actions: { marginTop: 8, gap: 10 },
  button: {
    textAlign: 'center',
    paddingVertical: 12,
    borderRadius: 12,
    fontWeight: '800',
    color: '#fff',
    backgroundColor: '#1d4ed8',
  },
  secondary: { backgroundColor: '#111827' },
  error: { color: '#b91c1c', fontWeight: '700', marginVertical: 6, textAlign: 'center' },
});
